import { beforeAll, describe, expect, it } from "vitest";
import { CHARACTER_HEIGHT, MOVE_SPEED } from "../../src/data/tuning";
import { CHARACTER_SKIN, initPhysics, PhysicsWorld } from "../../src/physics/physicsWorld";
import { boundaryWalls } from "../../src/world/boundary";
import { propModelFor } from "../../src/world/propModels";
import { PROP_SHAPES, propBox, propRadius, propSize } from "../../src/world/props";
import { ROCK_MAX_SIZE, ROCK_MIN_SIZE, scatterItems } from "../../src/world/scatter";
import { heightAt } from "../../src/world/terrain";
import type { ZoneDefinition } from "../../src/world/zoneDefinition";
import { loadZone, ROCK_COLLIDER_MIN_SIZE } from "../../src/world/zoneLoader";
import { loadDryRiverbed } from "../../src/world/zones/dryRiverbed";

const zone = loadDryRiverbed();
const rocksEntry = zone.scatter[0] as ZoneDefinition["scatter"][number];

/** Position of a named place: a building, a prop, an exit, or the start. */
function place(id: string): readonly [number, number] {
  if (id === "start") {
    return zone.spawn.position;
  }
  const found = [...zone.buildings, ...zone.props, ...zone.exits].find((item) => item.id === id);
  if (!found) {
    throw new Error(`No place called ${id}`);
  }
  return found.position;
}
const distance = (a: string, b: string): number => {
  const [ax, az] = place(a);
  const [bx, bz] = place(b);
  return Math.hypot(ax - bx, az - bz);
};

describe("dry riverbed layout (prototype design 5)", () => {
  it("has every place of the design at its coordinates", () => {
    const expected: Record<string, [number, number]> = {
      start: [360, 619],
      car_line: [375, 491],
      house_a: [281, 281],
      abandoned_car: [469, 356],
      overturned_car: [244, 563],
      house_b: [563, 206],
      house_c: [131, 431],
      camp: [206, 150],
      dry_well: [403, 113],
      north_exit: [356, 8],
      east_exit: [713, 188],
    };
    for (const [id, position] of Object.entries(expected)) {
      expect(place(id), id).toEqual(position);
    }
  });

  it.each([
    ["start", "car_line", 129],
    ["car_line", "house_a", 230],
    ["house_a", "house_b", 292],
    ["house_a", "house_c", 212],
    ["house_a", "camp", 151],
    ["overturned_car", "house_c", 174],
  ] as const)("keeps %s to %s at about %i m, as in the design's distance table", (from, to, metres) => {
    expect(Math.abs(distance(from, to) - metres)).toBeLessThanOrEqual(5);
  });

  it.each([
    ["start", "car_line", 11],
    ["car_line", "house_a", 19],
    ["house_a", "house_b", 24],
    ["house_a", "house_c", 17],
    ["house_a", "camp", 12],
    ["overturned_car", "house_c", 14],
  ] as const)("takes %s to %s about %i seconds at walking speed", (from, to, seconds) => {
    expect(Math.abs(distance(from, to) / MOVE_SPEED - seconds)).toBeLessThanOrEqual(1);
  });

  it("is 720 m from edge to edge: one minute at walking speed", () => {
    expect(zone.size).toBe(720);
    expect(zone.size / MOVE_SPEED).toBeCloseTo(60);
  });

  it("closes the north and east exits and opens the way to the shelter in house A", () => {
    const byId = Object.fromEntries(zone.exits.map((exit) => [exit.id, exit]));
    expect(byId.north_exit?.blocked).toBe(true);
    expect(byId.east_exit?.blocked).toBe(true);
    expect(byId.to_shelter).toMatchObject({ blocked: false, to: "shelter", position: [281, 281] });
  });

  it("puts rubble across each blocked exit", () => {
    const rubble = zone.props.filter((prop) => prop.kind === "barrier");
    for (const exit of zone.exits.filter((candidate) => candidate.blocked)) {
      const nearest = Math.min(...rubble.map((prop) => Math.hypot(prop.position[0] - exit.position[0], prop.position[1] - exit.position[1])));
      expect(nearest).toBeLessThan(5);
    }
  });

  it("has the cars, the camp and the well", () => {
    const kinds = zone.props.map((prop) => prop.kind);
    expect(kinds.filter((kind) => kind === "car")).toHaveLength(3);
    expect(kinds).toContain("overturned_car");
    expect(kinds).toContain("tent");
    expect(kinds).toContain("well");
  });
});

describe("props", () => {
  it("stands a prop on the ground, sunk in a little", () => {
    const box = propBox({ id: "tent", kind: "tent", position: [10, 20], rotation: 0 }, 2);
    const [, height] = PROP_SHAPES.tent.size;
    expect(box.center.x).toBe(10);
    expect(box.center.z).toBe(20);
    expect(box.center.y + box.halfExtents.y).toBeCloseTo(2 + height);
    expect(box.center.y - box.halfExtents.y).toBeLessThan(2);
  });

  it("turns with the prop's rotation", () => {
    const box = propBox({ id: "car", kind: "car", position: [0, 0], rotation: 90 }, 0);
    expect(box.yaw).toBeCloseTo(-Math.PI / 2);
  });

  it("makes blocked-exit rubble too high to jump over", () => {
    expect(PROP_SHAPES.barrier.size[1]).toBeGreaterThan(1.5);
  });

  it("knows the radius a prop fits in", () => {
    const [width, , length] = PROP_SHAPES.tent.size;
    expect(propRadius({ id: "tent", kind: "tent", position: [0, 0], rotation: 0 })).toBeCloseTo(Math.hypot(width, length) / 2);
  });

  it("gives a prop drawn with a model the size of that model", () => {
    const car: ZoneDefinition["props"][number] = { id: "car_line", kind: "car", position: [0, 0], rotation: 0 };
    const size = propModelFor(car)?.size;
    expect(size).toBeDefined();
    expect(propSize(car)).toEqual(size);
    const box = propBox(car, 0);
    expect(box.halfExtents.x * 2).toBeCloseTo(size?.[0] ?? 0);
    expect(box.halfExtents.z * 2).toBeCloseTo(size?.[2] ?? 0);
  });

  it("makes cars large next to a 1.8 m person, as in the pack they come from", () => {
    const [width, , length] = propSize({ id: "car_line", kind: "car" });
    expect(length).toBeGreaterThan(5.5);
    expect(width).toBeGreaterThan(2.2);
  });
});

describe("scatter", () => {
  const rocks = scatterItems(zone, rocksEntry);

  it("is the same every time for the same seed", () => {
    expect(scatterItems(zone, rocksEntry)).toEqual(rocks);
  });

  it("changes with the seed", () => {
    const other = scatterItems(zone, { ...rocksEntry, seed: rocksEntry.seed + 1 });
    expect(other).not.toEqual(rocks);
  });

  it("places about as many as asked for", () => {
    expect(rocks.length).toBeGreaterThan(rocksEntry.count * 0.95);
    expect(rocks.length).toBeLessThanOrEqual(rocksEntry.count);
  });

  it("stays inside the zone and within the size range", () => {
    for (const rock of rocks) {
      expect(rock.x).toBeGreaterThan(0);
      expect(rock.x).toBeLessThan(zone.size);
      expect(rock.z).toBeGreaterThan(0);
      expect(rock.z).toBeLessThan(zone.size);
      expect(rock.size).toBeGreaterThanOrEqual(ROCK_MIN_SIZE);
      expect(rock.size).toBeLessThanOrEqual(ROCK_MAX_SIZE);
    }
  });

  it("does not overlap any building", () => {
    for (const building of zone.buildings) {
      const reach = Math.hypot(building.size[0], building.size[1]) / 2;
      for (const rock of rocks) {
        const gap = Math.hypot(rock.x - building.position[0], rock.z - building.position[1]) - reach - rock.size;
        expect(gap).toBeGreaterThan(0);
      }
    }
  });

  it("keeps clear of props and of the starting point", () => {
    for (const prop of zone.props) {
      for (const rock of rocks) {
        const gap = Math.hypot(rock.x - prop.position[0], rock.z - prop.position[1]) - propRadius(prop) - rock.size;
        expect(gap).toBeGreaterThan(0);
      }
    }
    const [startX, startZ] = zone.spawn.position;
    for (const rock of rocks) {
      expect(Math.hypot(rock.x - startX, rock.z - startZ)).toBeGreaterThan(5);
    }
  });

  it("has mostly small rocks and a few large ones", () => {
    const large = rocks.filter((rock) => rock.size >= ROCK_COLLIDER_MIN_SIZE).length;
    expect(large).toBeGreaterThan(10);
    expect(large).toBeLessThan(rocks.length / 2);
  });
});

describe("boundaryWalls", () => {
  it("puts the inner face of each wall exactly on an edge", () => {
    const walls = boundaryWalls(100);
    expect(walls).toHaveLength(4);
    const [north, south, west, east] = walls;
    expect((north?.center.z ?? 0) + (north?.halfExtents.z ?? 0)).toBeCloseTo(0);
    expect((south?.center.z ?? 0) - (south?.halfExtents.z ?? 0)).toBeCloseTo(100);
    expect((west?.center.x ?? 0) + (west?.halfExtents.x ?? 0)).toBeCloseTo(0);
    expect((east?.center.x ?? 0) - (east?.halfExtents.x ?? 0)).toBeCloseTo(100);
  });

  it("closes the corners", () => {
    const [north] = boundaryWalls(100);
    expect((north?.center.x ?? 0) - (north?.halfExtents.x ?? 0)).toBeLessThan(0);
    expect((north?.center.x ?? 0) + (north?.halfExtents.x ?? 0)).toBeGreaterThan(100);
  });
});

describe("the loaded zone", () => {
  beforeAll(async () => {
    await initPhysics();
  });

  const fakeScene = () => {
    const objects = new Set<unknown>();
    return { objects, add: (object: unknown) => objects.add(object), remove: (object: unknown) => objects.delete(object) };
  };

  it("has a collider for everything solid and leaves nothing behind on unload", () => {
    const physics = new PhysicsWorld();
    const scene = fakeScene();
    const loaded = loadZone(zone, physics, scene);
    const largeRocks = scatterItems(zone, rocksEntry).filter((rock) => rock.size >= ROCK_COLLIDER_MIN_SIZE).length;

    // Terrain, 7 boxes per building, one per prop, the large rocks, and 4 boundary walls.
    expect(physics.bodyCount).toBe(1 + zone.buildings.length * 7 + zone.props.length + largeRocks + 4);
    // Terrain, building boxes, props, and one mesh for all rocks. Boundary walls are invisible.
    expect(scene.objects.size).toBe(1 + zone.buildings.length * 7 + zone.props.length + 1);
    expect(loaded.rockCount).toBeGreaterThan(1000);

    loaded.unload();
    expect(physics.bodyCount).toBe(0);
    expect(scene.objects.size).toBe(0);
    physics.dispose();
  });

  /** Walks a character from a point in a direction for some seconds and returns where it ends up. */
  function walk(fromX: number, fromZ: number, stepX: number, stepZ: number, seconds: number) {
    const physics = new PhysicsWorld();
    const loaded = loadZone(zone, physics, fakeScene());
    const handle = physics.addCharacter({
      x: fromX,
      y: heightAt(loaded.terrain, fromX, fromZ) + CHARACTER_HEIGHT / 2 + CHARACTER_SKIN,
      z: fromZ,
    });
    physics.step();
    const pose = { x: 0, y: 0, z: 0, rotationY: 0 };
    for (let tick = 0; tick < seconds * 60; tick += 1) {
      physics.moveCharacter(handle, { x: (stepX * MOVE_SPEED) / 60, y: 0, z: (stepZ * MOVE_SPEED) / 60 }, true);
      physics.step();
    }
    physics.readPose(handle, pose);
    physics.dispose();
    return pose;
  }

  it.each([
    ["south", 360, 705, 0, 1],
    ["north", 100, 15, 0, -1],
    ["west", 15, 300, -1, 0],
    ["east", 705, 500, 1, 0],
  ] as const)("cannot be left across the %s edge", (_edge, x, z, stepX, stepZ) => {
    const pose = walk(x, z, stepX, stepZ, 4);
    expect(pose.x).toBeGreaterThan(0);
    expect(pose.x).toBeLessThan(zone.size);
    expect(pose.z).toBeGreaterThan(0);
    expect(pose.z).toBeLessThan(zone.size);
  });

  it("stops the character at a car", () => {
    // Walking north along the riverbed straight at the first car of the line.
    const pose = walk(375, 510, 0, -1, 3);
    expect(pose.z).toBeGreaterThan(491);
  });

  it("stops the character at the rubble across the north exit", () => {
    const pose = walk(356, 30, 0, -1, 4);
    expect(pose.z).toBeGreaterThan(10);
  });
});
