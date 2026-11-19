import { describe, expect, it } from "vitest";
import { INTERACT_DISTANCE } from "../../src/data/tuning";
import { pickInteractionTarget } from "../../src/gameplay/interaction";
import { isInsideBuilding, WALL_THICKNESS, yawFromDegrees } from "../../src/world/building";
import { CONTAINER_SHAPES, containerApproach, placeContainer, type PlacedContainer } from "../../src/world/containers";
import { PROP_SET_IDS } from "../../src/world/propModels";
import { propSize } from "../../src/world/props";
import { scatterItems } from "../../src/world/scatter";
import { zonePlaces } from "../../src/world/startPoint";
import { parseZoneDefinition, type ZoneDefinition } from "../../src/world/zoneDefinition";
import { loadDryRiverbed } from "../../src/world/zones/dryRiverbed";

const GROUND = 3;
const flat = (): number => GROUND;

/** A 64 m zone with one house (door east), one car and room for containers. */
const zoneWith = (containers: unknown[]): unknown => ({
  id: "test",
  nameKey: "zone.test.name",
  size: 64,
  terrain: { samples: 2, heights: [0, 0, 0, 0] },
  spawn: { position: [5, 5], facing: 0 },
  buildings: [{ id: "house", position: [40, 40], rotation: 0, size: [10, 8, 3], door: { side: "east", width: 1.6 }, shelter: true }],
  props: [
    { id: "car", kind: "car", position: [20, 20], rotation: 0 },
    { id: "tent", kind: "tent", position: [10, 50], rotation: 0 },
  ],
  containers,
});
const parsed = (containers: unknown[]): ZoneDefinition => {
  const result = parseZoneDefinition(zoneWith(containers));
  if (!result.ok) {
    throw new Error(result.errors.join("\n"));
  }
  return result.zone;
};
const errorsOf = (containers: unknown[]): string[] => {
  const result = parseZoneDefinition(zoneWith(containers));
  return result.ok ? [] : result.errors;
};
const place = (zone: ZoneDefinition, id: string): PlacedContainer => {
  const container = zone.containers.find((candidate) => candidate.id === id);
  if (!container) {
    throw new Error(`no container ${id}`);
  }
  return placeContainer(container, zone, flat);
};

describe("the container format", () => {
  it("accepts the three kinds", () => {
    const zone = parsed([
      { id: "trunk", kind: "trunk", prop: "car" },
      { id: "cabinet", kind: "cabinet", building: "house", wall: "west", offset: 1 },
      { id: "crate", kind: "crate", position: [30, 10] },
    ]);
    expect(zone.containers.map((container) => container.kind)).toEqual(["trunk", "cabinet", "crate"]);
  });

  it("refuses a trunk on a prop that is missing or is no car", () => {
    expect(errorsOf([{ id: "trunk", kind: "trunk", prop: "nothing" }]).join()).toContain('no prop with id "nothing"');
    expect(errorsOf([{ id: "trunk", kind: "trunk", prop: "tent" }]).join()).toContain("has no trunk");
  });

  it("refuses a cabinet in a missing building, on the door's wall, or beyond the end of its wall", () => {
    expect(errorsOf([{ id: "c", kind: "cabinet", building: "nothing", wall: "west", offset: 0 }]).join()).toContain("no building");
    expect(errorsOf([{ id: "c", kind: "cabinet", building: "house", wall: "east", offset: 2 }]).join()).toContain("doorway");
    expect(errorsOf([{ id: "c", kind: "cabinet", building: "house", wall: "west", offset: 3.5 }]).join()).toContain("beyond the end");
  });

  it("refuses an id used twice and a crate outside the zone", () => {
    expect(errorsOf([{ id: "car", kind: "crate", position: [30, 10] }]).join()).toContain("duplicate id");
    expect(errorsOf([{ id: "crate", kind: "crate", position: [70, 10] }]).join()).toContain("outside the zone");
  });
});

describe("placeContainer", () => {
  const zone = parsed([
    { id: "trunk", kind: "trunk", prop: "car" },
    { id: "west", kind: "cabinet", building: "house", wall: "west", offset: -2 },
    { id: "south", kind: "cabinet", building: "house", wall: "south", offset: -2 },
    { id: "crate", kind: "crate", position: [30, 10], rotation: 90 },
  ]);

  it("puts a trunk at the middle of its car's back end, which is the north end unrotated", () => {
    const trunk = place(zone, "trunk");
    const length = propSize({ id: "car", kind: "car" })[2];
    expect(trunk.point.x).toBeCloseTo(20);
    expect(trunk.point.z).toBeCloseTo(20 - length / 2);
    expect(trunk.point.y).toBe(GROUND);
    expect(trunk.front.x).toBeCloseTo(0);
    expect(trunk.front.z).toBeCloseTo(-1);
    expect(trunk.box).toBeUndefined();
  });

  it("turns a trunk with its car", () => {
    const turned = parsed([{ id: "trunk", kind: "trunk", prop: "car" }]);
    const car = turned.props[0];
    if (!car) {
      throw new Error("no car");
    }
    // 90 degrees clockwise: what pointed north now points east.
    car.rotation = 90;
    const trunk = place(turned, "trunk");
    const length = propSize(car)[2];
    expect(trunk.point.x).toBeCloseTo(20 + length / 2);
    expect(trunk.point.z).toBeCloseTo(20);
    expect(trunk.front.x).toBeCloseTo(1);
  });

  it("stands a cabinet against the inside of its wall, facing the room", () => {
    const [width, height, depth] = CONTAINER_SHAPES.cabinet.size;
    const west = place(zone, "west");
    // The house is 10 m wide, centred on x = 40: its west wall's inner face is at 35 + thickness.
    expect(west.point.x).toBeCloseTo(35 + WALL_THICKNESS + depth / 2);
    expect(west.point.z).toBeCloseTo(38);
    expect(west.front).toEqual({ x: 1, z: 0 });
    expect(west.box?.halfExtents.x).toBeCloseTo(depth / 2);
    expect(west.box?.halfExtents.z).toBeCloseTo(width / 2);
    // Its top is at its height above the floor.
    expect((west.box?.center.y ?? 0) + (west.box?.halfExtents.y ?? 0)).toBeCloseTo(GROUND + height);

    const south = place(zone, "south");
    expect(south.point.x).toBeCloseTo(38);
    expect(south.point.z).toBeCloseTo(44 - WALL_THICKNESS - depth / 2);
    expect(south.front.z).toBeCloseTo(-1);
    expect(south.box?.halfExtents.x).toBeCloseTo(width / 2);
  });

  it("turns a cabinet with its building", () => {
    const turned = parsed([{ id: "west", kind: "cabinet", building: "house", wall: "west", offset: 0 }]);
    const house = turned.buildings[0];
    if (!house) {
      throw new Error("no house");
    }
    house.rotation = 90;
    const cabinet = place(turned, "west");
    // The west wall has gone round to the north.
    expect(cabinet.point.x).toBeCloseTo(40);
    expect(cabinet.point.z).toBeLessThan(40);
    expect(cabinet.front.z).toBeCloseTo(1);
    expect(cabinet.box?.yaw).toBeCloseTo(yawFromDegrees(90));
  });

  it("stands a crate where it is put, turned as asked", () => {
    const crate = place(zone, "crate");
    expect(crate.point).toEqual({ x: 30, y: GROUND, z: 10 });
    expect(crate.box?.yaw).toBeCloseTo(yawFromDegrees(90));
    // Its front, south when unrotated, has turned to the west.
    expect(crate.front.x).toBeCloseTo(-1);
  });

  it("gives a spot in front of each from which it is the target", () => {
    for (const container of zone.containers) {
      const placed = placeContainer(container, zone, flat);
      const spot = containerApproach(placed);
      const distance = Math.hypot(spot.east - placed.point.x, spot.south - placed.point.z);
      expect(distance).toBeLessThan(INTERACT_DISTANCE);
      const target = pickInteractionTarget({ x: spot.east, feetY: GROUND, z: spot.south }, yawFromDegrees(spot.facing), [
        { id: placed.id, ...placed.point },
      ]);
      expect(target).toBe(placed.id);
      // Facing the other way it is not.
      const away = pickInteractionTarget({ x: spot.east, feetY: GROUND, z: spot.south }, yawFromDegrees(spot.facing + 180), [
        { id: placed.id, ...placed.point },
      ]);
      expect(away).toBeNull();
    }
  });
});

describe("the dry riverbed's containers", () => {
  const zone = loadDryRiverbed();
  const placedIn = (set: (typeof PROP_SET_IDS)[number]): PlacedContainer[] =>
    zone.containers.map((container) => placeContainer(container, zone, flat, set));

  it("has four trunks, six cabinets and four crates", () => {
    const count = (kind: string): number => zone.containers.filter((container) => container.kind === kind).length;
    expect(count("trunk")).toBe(4);
    expect(count("cabinet")).toBe(6);
    expect(count("crate")).toBe(4);
  });

  it("has two cabinets in every house and every cabinet inside its house", () => {
    for (const building of zone.buildings) {
      const cabinets = placedIn("quaternius").filter((placed) => placed.id.startsWith(`${building.id}_cabinet`));
      expect(cabinets).toHaveLength(2);
      for (const cabinet of cabinets) {
        expect(isInsideBuilding(building, cabinet.point.x, cabinet.point.z)).toBe(true);
      }
    }
  });

  it("keeps the middle of house A free, where the way down to the shelter is", () => {
    const [east, south] = zone.buildings.find((building) => building.id === "house_a")?.position ?? [0, 0];
    for (const cabinet of placedIn("quaternius").filter((placed) => placed.id.startsWith("house_a"))) {
      expect(Math.hypot(cabinet.point.x - east, cabinet.point.z - south)).toBeGreaterThan(2);
    }
  });

  it.each(PROP_SET_IDS)("keeps any two containers further apart than the reach (%s)", (set) => {
    // Any two are far enough apart that standing at one, the other is out of reach.
    const placed = placedIn(set);
    for (const one of placed) {
      for (const other of placed) {
        if (one !== other) {
          expect(Math.hypot(one.point.x - other.point.x, one.point.z - other.point.z)).toBeGreaterThan(INTERACT_DISTANCE);
        }
      }
    }
  });

  it.each(PROP_SET_IDS)("has no rock on a crate (%s)", (set) => {
    const crates = placedIn(set).filter((placed) => placed.kind === "crate");
    for (const scatter of zone.scatter) {
      for (const rock of scatterItems(zone, scatter, set)) {
        for (const crate of crates) {
          expect(Math.hypot(rock.x - crate.point.x, rock.z - crate.point.z)).toBeGreaterThan(rock.size + 0.5);
        }
      }
    }
  });

  it("lists a place to stand for every container", () => {
    const places = zonePlaces(zone);
    for (const container of zone.containers) {
      expect(places.some((spot) => spot.id === container.id)).toBe(true);
    }
  });
});
