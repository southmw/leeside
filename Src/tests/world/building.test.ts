import { beforeAll, describe, expect, it } from "vitest";
import { CHARACTER_HEIGHT } from "../../src/data/tuning";
import { CHARACTER_SKIN, initPhysics, PhysicsWorld } from "../../src/physics/physicsWorld";
import {
  buildingAt,
  buildingBoxes,
  DOOR_HEIGHT,
  isInsideBuilding,
  WALL_THICKNESS,
  yawFromDegrees,
} from "../../src/world/building";
import { resolveStart } from "../../src/world/startPoint";
import { heightAt } from "../../src/world/terrain";
import type { ZoneBuilding } from "../../src/world/zoneDefinition";
import { loadZone } from "../../src/world/zoneLoader";
import { loadDryRiverbed } from "../../src/world/zones/dryRiverbed";

/** 10 m wide (east-west), 8 m deep, 3 m high, at (100, 50), with a 1.6 m door in the east wall. */
const house: ZoneBuilding = {
  id: "house",
  position: [100, 50],
  rotation: 0,
  size: [10, 8, 3],
  door: { side: "east", width: 1.6 },
  shelter: true,
};
const turned = (rotation: number): ZoneBuilding => ({ ...house, rotation });

describe("yawFromDegrees", () => {
  it("turns clockwise degrees into counter-clockwise radians", () => {
    expect(yawFromDegrees(0)).toBeCloseTo(0);
    expect(yawFromDegrees(90)).toBeCloseTo(-Math.PI / 2);
  });
});

describe("buildingBoxes", () => {
  const boxes = buildingBoxes(house, 2);
  const walls = boxes.filter((box) => box.kind === "wall");
  const roof = boxes.find((box) => box.kind === "roof");

  it("makes three whole walls, three pieces around the doorway, and a roof", () => {
    expect(walls).toHaveLength(6);
    expect(boxes.filter((box) => box.kind === "roof")).toHaveLength(1);
  });

  it("stands the walls on the ground, reaching the wall height", () => {
    const whole = walls.filter((box) => box.center.y + box.halfExtents.y - 2 > 2.99 && box.halfExtents.y > 1.5);
    expect(whole.length).toBe(5);
    for (const box of whole) {
      expect(box.center.y + box.halfExtents.y).toBeCloseTo(2 + 3);
      expect(box.center.y - box.halfExtents.y).toBeLessThan(2);
    }
  });

  it("puts the outer faces of the walls on the footprint", () => {
    const west = Math.min(...walls.map((box) => box.center.x - box.halfExtents.x));
    const east = Math.max(...walls.map((box) => box.center.x + box.halfExtents.x));
    const north = Math.min(...walls.map((box) => box.center.z - box.halfExtents.z));
    const south = Math.max(...walls.map((box) => box.center.z + box.halfExtents.z));
    expect([west, east, north, south]).toEqual([95, 105, 46, 54]);
  });

  it("leaves a doorway of the right width and height in the door wall", () => {
    // East wall pieces are the ones centred on the east face.
    const eastPieces = walls.filter((box) => Math.abs(box.center.x - (105 - WALL_THICKNESS / 2)) < 1e-9);
    expect(eastPieces).toHaveLength(3);

    const lintel = eastPieces.find((box) => Math.abs(box.center.z - 50) < 1e-9);
    expect(lintel?.halfExtents.z).toBeCloseTo(0.8);
    expect((lintel?.center.y ?? 0) - (lintel?.halfExtents.y ?? 0)).toBeCloseTo(2 + DOOR_HEIGHT);

    const sides = eastPieces.filter((box) => box !== lintel);
    const gapNorth = Math.max(...sides.filter((box) => box.center.z < 50).map((box) => box.center.z + box.halfExtents.z));
    const gapSouth = Math.min(...sides.filter((box) => box.center.z > 50).map((box) => box.center.z - box.halfExtents.z));
    expect(gapNorth).toBeCloseTo(49.2);
    expect(gapSouth).toBeCloseTo(50.8);
  });

  it("covers the walls with a roof that overhangs", () => {
    expect(roof?.center).toEqual({ x: 100, y: 2 + 3 + WALL_THICKNESS / 2, z: 50 });
    expect(roof?.halfExtents.x).toBeGreaterThan(5);
    expect(roof?.halfExtents.z).toBeGreaterThan(4);
  });

  it("turns with the building: a quarter turn clockwise moves the east door to the south", () => {
    const rotated = buildingBoxes(turned(90), 0).filter((box) => box.kind === "wall");
    const lintel = rotated.find((box) => box.center.y - box.halfExtents.y > 2);
    expect(lintel?.center.x).toBeCloseTo(100);
    expect(lintel?.center.z).toBeCloseTo(50 + 5 - WALL_THICKNESS / 2);
    for (const box of rotated) {
      expect(box.yaw).toBeCloseTo(-Math.PI / 2);
    }
  });

  it("can put the door in any wall", () => {
    for (const side of ["north", "east", "south", "west"] as const) {
      const made = buildingBoxes({ ...house, door: { side, width: 1.6 } }, 0);
      expect(made.filter((box) => box.kind === "wall")).toHaveLength(6);
    }
  });
});

describe("isInsideBuilding", () => {
  it("is true within the footprint and false outside", () => {
    expect(isInsideBuilding(house, 100, 50)).toBe(true);
    expect(isInsideBuilding(house, 104.9, 53.9)).toBe(true);
    expect(isInsideBuilding(house, 105.1, 50)).toBe(false);
    expect(isInsideBuilding(house, 100, 54.1)).toBe(false);
  });

  it("follows the building's rotation", () => {
    // After a quarter turn the long side runs north-south.
    expect(isInsideBuilding(turned(90), 100, 54.5)).toBe(true);
    expect(isInsideBuilding(turned(90), 104.5, 50)).toBe(false);
  });

  it("finds which building a point is in", () => {
    const other = { ...house, id: "other", position: [200, 50] as [number, number] };
    expect(buildingAt([house, other], 201, 51)?.id).toBe("other");
    expect(buildingAt([house, other], 150, 50)).toBeUndefined();
  });
});

describe("resolveStart", () => {
  const zone = loadDryRiverbed();

  it("uses the zone's start point by default", () => {
    expect(resolveStart(zone)).toEqual({ east: 192, south: 330, facing: 0 });
    expect(resolveStart(zone, null, null)).toEqual({ east: 192, south: 330, facing: 0 });
  });

  it("accepts a position and a direction", () => {
    expect(resolveStart(zone, "160, 150", "270")).toEqual({ east: 160, south: 150, facing: 270 });
  });

  it("wraps the direction into 0 to 360", () => {
    expect(resolveStart(zone, null, "-90").facing).toBe(270);
    expect(resolveStart(zone, null, "450").facing).toBe(90);
  });

  it("ignores values that do not parse or lie outside the zone", () => {
    for (const at of ["", "abc", "10", "10,20,30", "500,10", "-5,10", "10,NaN"]) {
      expect(resolveStart(zone, at)).toEqual({ east: 192, south: 330, facing: 0 });
    }
    expect(resolveStart(zone, null, "north").facing).toBe(0);
  });
});

describe("the dry riverbed's buildings", () => {
  const zone = loadDryRiverbed();

  it("has the three houses of the design, at their positions, all giving shelter", () => {
    const byId = Object.fromEntries(zone.buildings.map((building) => [building.id, building]));
    expect(Object.keys(byId).sort()).toEqual(["house_a", "house_b", "house_c"]);
    expect(byId.house_a?.position).toEqual([150, 150]);
    expect(byId.house_b?.position).toEqual([300, 110]);
    expect(byId.house_c?.position).toEqual([70, 230]);
    expect(zone.buildings.every((building) => building.shelter)).toBe(true);
  });

  it("stands every house on level ground", () => {
    const terrain = { samples: zone.terrain.samples, size: zone.size, heights: zone.terrain.heights };
    for (const building of zone.buildings) {
      const [east, south] = building.position;
      const centre = heightAt(terrain, east, south);
      const reach = Math.hypot(building.size[0], building.size[1]) / 2 + 1;
      for (let angle = 0; angle < 2 * Math.PI; angle += Math.PI / 8) {
        const height = heightAt(terrain, east + Math.cos(angle) * reach, south + Math.sin(angle) * reach);
        expect(Math.abs(height - centre)).toBeLessThan(0.05);
      }
    }
  });
});

describe("loadZone", () => {
  beforeAll(async () => {
    await initPhysics();
  });

  const fakeScene = () => {
    const objects = new Set<unknown>();
    return { objects, add: (object: unknown) => objects.add(object), remove: (object: unknown) => objects.delete(object) };
  };

  it("adds the terrain and every box of every building, as picture and as collider", () => {
    const physics = new PhysicsWorld();
    const scene = fakeScene();
    const definition = loadDryRiverbed();
    loadZone(definition, physics, scene);

    // Terrain, plus 7 boxes per building.
    const expected = 1 + definition.buildings.length * 7;
    expect(physics.bodyCount).toBe(expected);
    expect(scene.objects.size).toBe(expected);
    physics.dispose();
  });

  it("takes everything out again on unload", () => {
    const physics = new PhysicsWorld();
    const scene = fakeScene();
    const zone = loadZone(loadDryRiverbed(), physics, scene);
    const player = physics.addCharacter({ x: 0, y: 5, z: 0 });

    zone.unload();
    expect(scene.objects.size).toBe(0);
    expect(physics.bodyCount).toBe(1);
    expect(physics.readPose(player, { x: 0, y: 0, z: 0, rotationY: 0 })).toBe(true);

    // Loading again after unloading gives the same counts: nothing is left behind.
    loadZone(loadDryRiverbed(), physics, scene);
    expect(physics.bodyCount).toBe(1 + 1 + 3 * 7);
    physics.dispose();
  });

  describe("walking into a house", () => {
    const definition = loadDryRiverbed();
    const houseA = definition.buildings.find((building) => building.id === "house_a") as ZoneBuilding;

    /** Starts a character east of house A at the given south coordinate and walks it west for 3 seconds. */
    function walkWestFrom(south: number) {
      const physics = new PhysicsWorld();
      const zone = loadZone(definition, physics, fakeScene());
      const start = { x: 162, y: heightAt(zone.terrain, 162, south) + CHARACTER_HEIGHT / 2 + CHARACTER_SKIN, z: south };
      const handle = physics.addCharacter(start);
      physics.step();
      const pose = { x: 0, y: 0, z: 0, rotationY: 0 };
      for (let tick = 0; tick < 180; tick += 1) {
        physics.moveCharacter(handle, { x: -6.5 / 60, y: 0, z: 0 }, true);
        physics.step();
      }
      physics.readPose(handle, pose);
      physics.dispose();
      return pose;
    }

    it("gets in through the doorway", () => {
      const pose = walkWestFrom(150);
      expect(isInsideBuilding(houseA, pose.x, pose.z)).toBe(true);
      // Stopped by the far (west) wall, not somewhere in the doorway.
      expect(pose.x).toBeLessThan(146.5);
      expect(pose.x).toBeGreaterThan(145.3);
    });

    it("is stopped by the wall beside the doorway", () => {
      const pose = walkWestFrom(152.5);
      expect(isInsideBuilding(houseA, pose.x, pose.z)).toBe(false);
      expect(pose.x).toBeGreaterThan(155.3);
      expect(pose.x).toBeLessThan(155.5);
    });
  });
});
