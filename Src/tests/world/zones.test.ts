import { describe, expect, it } from "vitest";
import { INTERACT_DISTANCE } from "../../src/data/tuning";
import { MESSAGES } from "../../src/locales/i18n";
import { isInsideBuilding } from "../../src/world/building";
import { exitBox, EXIT_LOOKS, interiorShell, interiorShelterZone } from "../../src/world/interior";
import { isWithinShelterZone } from "../../src/gameplay/shelter";
import { parseZoneDefinition } from "../../src/world/zoneDefinition";
import { checkZoneLinks, isZoneId, loadZones, ZONE_IDS } from "../../src/world/zones";

const zones = loadZones();

describe("the zones", () => {
  it("are the riverbed and the shelter, each under its own id", () => {
    expect(ZONE_IDS).toEqual(["dry_riverbed", "shelter"]);
    for (const id of ZONE_IDS) {
      expect(zones[id].id).toBe(id);
    }
    expect(isZoneId("shelter")).toBe(true);
    expect(isZoneId("moon")).toBe(false);
    expect(isZoneId(null)).toBe(false);
  });

  it("have a name, and a prompt for going there, in the locale files", () => {
    for (const id of ZONE_IDS) {
      expect(MESSAGES.en).toHaveProperty([zones[id].nameKey]);
      expect(MESSAGES.en).toHaveProperty([`interact.travel_${id}`]);
    }
  });

  it("lead to each other: every exit ends at an entry point that exists", () => {
    expect(checkZoneLinks(zones)).toEqual([]);
    const riverbedOut = zones.dry_riverbed.exits.find((exit) => exit.to === "shelter");
    const shelterOut = zones.shelter.exits.find((exit) => exit.to === "dry_riverbed");
    expect(riverbedOut?.entry).toBe("from_riverbed");
    expect(shelterOut?.entry).toBe("from_shelter");
  });

  it("are told when an exit leads nowhere", () => {
    const lost = { ...zones.shelter, exits: [{ ...zones.shelter.exits[0], id: "to_nowhere", to: "moon" }] } as typeof zones.shelter;
    const noEntry = { ...zones.shelter, entries: [] };
    expect(checkZoneLinks({ dry_riverbed: zones.dry_riverbed, shelter: lost })).toEqual(['shelter.to_nowhere: leads to "moon", which is no zone']);
    expect(checkZoneLinks({ dry_riverbed: zones.dry_riverbed, shelter: noEntry })).toEqual(['dry_riverbed.to_shelter: zone "shelter" has no entry "from_riverbed"']);
  });

  it("leave blocked exits out of it", () => {
    expect(zones.dry_riverbed.exits.filter((exit) => exit.blocked)).toHaveLength(2);
  });
});

describe("the way between the riverbed and the shelter", () => {
  const hatch = zones.dry_riverbed.exits.find((exit) => exit.to === "shelter");
  const arrival = zones.dry_riverbed.entries.find((entry) => entry.id === "from_shelter");
  const houseA = zones.dry_riverbed.buildings.find((building) => building.id === "house_a");

  it("goes down through a hatch in the floor of house A", () => {
    expect(hatch?.shape).toBe("hatch");
    expect(houseA && hatch && isInsideBuilding(houseA, hatch.position[0], hatch.position[1])).toBe(true);
  });

  it("comes up inside house A beside the hatch, with the hatch behind", () => {
    if (!hatch || !arrival || !houseA) {
      throw new Error("missing");
    }
    expect(isInsideBuilding(houseA, arrival.position[0], arrival.position[1])).toBe(true);
    const away = Math.hypot(arrival.position[0] - hatch.position[0], arrival.position[1] - hatch.position[1]);
    expect(away).toBeGreaterThan(1);
    expect(away).toBeLessThanOrEqual(INTERACT_DISTANCE);
    // Facing east, the hatch lies to the west: not in view, so not at once a target again.
    expect(arrival.facing).toBe(90);
    expect(hatch.position[0]).toBeLessThan(arrival.position[0]);
  });
});

describe("the shelter", () => {
  const shelter = zones.shelter;

  it("is a room: level, walled in, with a ceiling", () => {
    expect(shelter.interior?.height).toBe(3.5);
    expect(new Set(shelter.terrain.heights).size).toBe(1);
    expect(shelter.buildings).toEqual([]);
    expect(shelter.containers).toEqual([]);
    // The door to repair is on the north wall, opposite the ladder.
    expect(shelter.props.map((prop) => prop.kind)).toEqual(["shelter_door"]);
    expect(shelter.props[0]?.position[1]).toBeLessThan(1);
  });

  it("puts whoever comes in with the ladder behind them, in reach but out of view", () => {
    const ladder = shelter.exits[0];
    const entry = shelter.entries[0];
    if (!ladder || !entry) {
      throw new Error("missing");
    }
    expect(ladder.shape).toBe("ladder");
    expect(entry.facing).toBe(0);
    // North is up the list: the ladder lies further south than the entry.
    expect(ladder.position[1]).toBeGreaterThan(entry.position[1]);
    expect(Math.hypot(ladder.position[0] - entry.position[0], ladder.position[1] - entry.position[1])).toBeGreaterThan(INTERACT_DISTANCE);
    expect(shelter.spawn.position).toEqual(entry.position);
  });

  it("is shelter everywhere in it", () => {
    const placed = interiorShelterZone(shelter, 0);
    if (!placed) {
      throw new Error("no shelter zone");
    }
    for (const [x, z] of [[0.3, 0.3], [8, 8], [15.7, 15.7], [0.3, 15.7]] as const) {
      expect(isWithinShelterZone(placed, x, 0.9, z)).toBe(true);
    }
    expect(placed.shelterZone.id).toBe("shelter");
    expect(interiorShelterZone(zones.dry_riverbed, 0)).toBeUndefined();
  });
});

describe("interiorShell", () => {
  const shell = interiorShell(16, 3.5, 2);

  it("stands its walls outside the room, their inner faces on its edges", () => {
    const [north, south, west, east] = shell.walls;
    expect((north?.center.z ?? 0) + (north?.halfExtents.z ?? 0)).toBeCloseTo(0);
    expect((south?.center.z ?? 0) - (south?.halfExtents.z ?? 0)).toBeCloseTo(16);
    expect((west?.center.x ?? 0) + (west?.halfExtents.x ?? 0)).toBeCloseTo(0);
    expect((east?.center.x ?? 0) - (east?.halfExtents.x ?? 0)).toBeCloseTo(16);
    for (const wall of shell.walls) {
      expect(wall.center.y - wall.halfExtents.y).toBeCloseTo(2);
      expect(wall.center.y + wall.halfExtents.y).toBeCloseTo(5.5);
    }
  });

  it("lays the ceiling on top of the walls, over the whole room", () => {
    expect(shell.ceiling.center.y - shell.ceiling.halfExtents.y).toBeCloseTo(5.5);
    expect(shell.ceiling.halfExtents.x).toBeGreaterThanOrEqual(8);
    expect(shell.ceiling.halfExtents.z).toBeGreaterThanOrEqual(8);
  });
});

describe("exitBox", () => {
  it("stands on the ground at the exit's place", () => {
    const hatch = zones.dry_riverbed.exits.find((exit) => exit.to === "shelter");
    if (!hatch) {
      throw new Error("no hatch");
    }
    const box = exitBox(hatch, 4);
    expect(box.center).toMatchObject({ x: hatch.position[0], z: hatch.position[1] });
    expect(box.center.y - box.halfExtents.y).toBeCloseTo(4);
    expect(box.halfExtents.y * 2).toBe(EXIT_LOOKS.hatch.size[1]);
    // Low enough to walk over.
    expect(EXIT_LOOKS.hatch.size[1]).toBeLessThan(0.2);
  });
});

describe("the zone format", () => {
  const base = { id: "room", nameKey: "zone.room.name", size: 16, terrain: { samples: 2, heights: [0, 0, 0, 0] }, spawn: { position: [8, 8], facing: 0 } };

  it("takes entry points, an interior, and the shape of an exit", () => {
    const result = parseZoneDefinition({
      ...base,
      interior: { height: 3 },
      entries: [{ id: "from_outside", position: [8, 12], facing: 0 }],
      exits: [{ id: "out", position: [8, 15], shape: "ladder", to: "outside", entry: "from_room" }],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.zone.exits[0]?.shape).toBe("ladder");
      expect(result.zone.interior?.height).toBe(3);
    }
  });

  it("draws an exit as a hatch unless told otherwise, and has no interior or entries by default", () => {
    const result = parseZoneDefinition({ ...base, exits: [{ id: "out", position: [8, 15], to: "outside", entry: "from_room" }] });
    expect(result.ok && result.zone.exits[0]?.shape).toBe("hatch");
    expect(result.ok && result.zone.interior).toBeUndefined();
    expect(result.ok && result.zone.entries).toEqual([]);
  });

  it("rejects an entry point outside the zone, one sharing an id, and a ceiling too low to stand under", () => {
    const outside = parseZoneDefinition({ ...base, entries: [{ id: "in", position: [8, 40], facing: 0 }] });
    const twice = parseZoneDefinition({ ...base, entries: [{ id: "out", position: [8, 8], facing: 0 }], exits: [{ id: "out", position: [8, 15], blocked: true }] });
    const low = parseZoneDefinition({ ...base, interior: { height: 1 } });
    expect(outside.ok).toBe(false);
    expect(twice.ok).toBe(false);
    expect(low.ok).toBe(false);
  });
});
