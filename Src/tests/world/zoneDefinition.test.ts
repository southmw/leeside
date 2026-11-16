import { describe, expect, it } from "vitest";
import { parseZoneDefinition } from "../../src/world/zoneDefinition";

/** A small but complete zone. Each test changes one thing about it. */
function validZone() {
  return {
    id: "test_zone",
    nameKey: "zone.test_zone.name",
    size: 100,
    terrain: { samples: 3, heights: [0, 0, 0, 0, -2, 0, 0, 0, 0] },
    spawn: { position: [50, 90], facing: 0 },
    buildings: [
      { id: "house_a", position: [40, 40], rotation: 90, size: [8, 6, 3], door: { side: "south", width: 1.2 }, shelter: true },
      { id: "house_b", position: [70, 30], size: [8, 6, 3], door: { side: "east", width: 1.2 }, shelter: true },
    ],
    props: [{ id: "car_1", kind: "car", position: [55, 70], rotation: 15 }],
    exits: [
      { id: "to_shelter", position: [40, 40], to: "shelter", entry: "from_test_zone" },
      { id: "north_exit", position: [50, 1], blocked: true },
    ],
    scatter: [{ id: "rocks", kind: "rock", count: 200, seed: 7 }],
  };
}

type Zone = ReturnType<typeof validZone>;

/** Parses the valid zone after `change` has altered it, and returns the error messages. */
function errorsAfter(change: (zone: Zone & Record<string, unknown>) => void): string[] {
  const zone = validZone();
  change(zone);
  const result = parseZoneDefinition(zone);
  return result.ok ? [] : result.errors;
}

describe("parseZoneDefinition", () => {
  it("accepts a valid zone", () => {
    const result = parseZoneDefinition(validZone());
    expect(result.ok).toBe(true);
  });

  it("fills in defaults", () => {
    const result = parseZoneDefinition(validZone());
    if (!result.ok) {
      throw new Error(result.errors.join("\n"));
    }
    expect(result.zone.buildings[1]?.rotation).toBe(0);
    expect(result.zone.exits[0]?.blocked).toBe(false);
  });

  it("accepts a zone with nothing in it but terrain and a start", () => {
    const { id, nameKey, size, terrain, spawn } = validZone();
    const result = parseZoneDefinition({ id, nameKey, size, terrain, spawn });
    expect(result.ok && result.zone.buildings).toEqual([]);
  });

  it("never throws, whatever it is given", () => {
    for (const junk of [null, undefined, 42, "zone", [], {}]) {
      expect(parseZoneDefinition(junk).ok).toBe(false);
    }
  });

  describe("required items", () => {
    it.each(["id", "nameKey", "size", "terrain", "spawn"] as const)("rejects a zone without %s", (key) => {
      const errors = errorsAfter((zone) => {
        delete zone[key];
      });
      expect(errors.some((error) => error.startsWith(`${key}:`))).toBe(true);
    });

    it("rejects a building without a door, and says which", () => {
      const errors = errorsAfter((zone) => {
        delete (zone.buildings[1] as Partial<Zone["buildings"][number]>).door;
      });
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/^buildings\.1\.door:/);
    });

    it("rejects an open exit that leads nowhere", () => {
      const errors = errorsAfter((zone) => {
        delete (zone.exits[0] as { to?: string }).to;
      });
      expect(errors.join()).toContain("exits.0");
    });

    it("allows a blocked exit to lead nowhere", () => {
      expect(errorsAfter(() => {})).toEqual([]);
    });
  });

  describe("coordinates and ranges", () => {
    it("rejects a position outside the zone", () => {
      const errors = errorsAfter((zone) => {
        zone.props[0]!.position = [120, 50];
      });
      expect(errors).toEqual([expect.stringMatching(/^props\.0\.position: is outside the zone/)]);
    });

    it("rejects a negative position", () => {
      const errors = errorsAfter((zone) => {
        zone.buildings[0]!.position = [40, -1];
      });
      expect(errors[0]).toMatch(/^buildings\.0\.position:/);
    });

    it("rejects a start point outside the zone", () => {
      const errors = errorsAfter((zone) => {
        zone.spawn.position = [50, 100.5];
      });
      expect(errors[0]).toMatch(/^spawn\.position:/);
    });

    it("accepts positions exactly on the edge", () => {
      expect(
        errorsAfter((zone) => {
          zone.props[0]!.position = [0, 100];
        }),
      ).toEqual([]);
    });

    it("rejects a terrain grid of the wrong length", () => {
      const errors = errorsAfter((zone) => {
        zone.terrain.heights.pop();
      });
      expect(errors[0]).toMatch(/^terrain\.heights: expected 9 heights/);
    });

    it("rejects a terrain height out of range", () => {
      const errors = errorsAfter((zone) => {
        zone.terrain.heights[4] = 500;
      });
      expect(errors[0]).toMatch(/^terrain\.heights\.4:/);
    });

    it("rejects a rotation outside 0 to 360", () => {
      const errors = errorsAfter((zone) => {
        zone.props[0]!.rotation = 400;
      });
      expect(errors[0]).toMatch(/^props\.0\.rotation:/);
    });

    it("rejects a zone that is too large", () => {
      const errors = errorsAfter((zone) => {
        zone.size = 5000;
      });
      expect(errors.some((error) => error.startsWith("size:"))).toBe(true);
    });
  });

  describe("ids", () => {
    it("rejects two items of the same kind with the same id", () => {
      const errors = errorsAfter((zone) => {
        zone.buildings[1]!.id = "house_a";
      });
      expect(errors).toEqual(['buildings.1.id: duplicate id "house_a" (already used in buildings[0])']);
    });

    it("rejects the same id on items of different kinds", () => {
      const errors = errorsAfter((zone) => {
        zone.props[0]!.id = "house_a";
      });
      expect(errors[0]).toMatch(/^props\.0\.id: duplicate id "house_a"/);
    });

    it("rejects ids that are not lower-case words", () => {
      for (const id of ["House A", "1st", "", "house-a"]) {
        const errors = errorsAfter((zone) => {
          zone.buildings[0]!.id = id;
        });
        expect(errors[0]).toMatch(/^buildings\.0\.id:/);
      }
    });
  });

  describe("unknown content", () => {
    it("rejects a misspelt key instead of ignoring it", () => {
      const errors = errorsAfter((zone) => {
        zone.buildngs = [];
      });
      expect(errors.join()).toContain("buildngs");
    });

    it("rejects an unknown prop kind", () => {
      const errors = errorsAfter((zone) => {
        zone.props[0]!.kind = "spaceship";
      });
      expect(errors[0]).toMatch(/^props\.0\.kind:/);
    });
  });

  it("reports every problem at once", () => {
    const errors = errorsAfter((zone) => {
      zone.props[0]!.position = [120, 50];
      zone.buildings[1]!.id = "house_a";
      zone.terrain.heights.pop();
    });
    expect(errors).toHaveLength(3);
  });
});
