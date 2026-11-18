import { describe, expect, it } from "vitest";
import { createTransform, createWorld } from "../../src/core/ecs";
import {
  createShelterSystem,
  isWithinShelterZone,
  SHELTER_DEPTH_BELOW_FLOOR,
  shelterZoneAt,
} from "../../src/gameplay/shelter";
import { buildingShelterZone, isInsideBuilding } from "../../src/world/building";
import type { ZoneBuilding } from "../../src/world/zoneDefinition";
import { loadDryRiverbed } from "../../src/world/zones/dryRiverbed";

/** 10 m wide (east-west), 8 m deep, 3 m high, at (100, 50), standing on ground 2 m up. */
const house: ZoneBuilding = {
  id: "house",
  position: [100, 50],
  rotation: 0,
  size: [10, 8, 3],
  door: { side: "east", width: 1.6 },
  shelter: true,
};
const GROUND = 2;
/** Height of a standing character's centre above the ground. */
const STANDING = 0.9;
const zoneOf = (building: ZoneBuilding) => {
  const zone = buildingShelterZone(building, GROUND);
  if (!zone) {
    throw new Error("expected a shelter zone");
  }
  return zone;
};

describe("buildingShelterZone", () => {
  it("covers the building's footprint up to the top of its walls", () => {
    const zone = zoneOf(house);
    expect(zone.shelterZone).toEqual({ id: "house", halfWidth: 5, halfDepth: 4, height: 3 });
    expect(zone.transform).toMatchObject({ x: 100, y: GROUND, z: 50 });
  });

  it("gives none for a building that is no shelter", () => {
    expect(buildingShelterZone({ ...house, shelter: false }, GROUND)).toBeUndefined();
  });
});

describe("isWithinShelterZone", () => {
  const zone = zoneOf(house);
  const y = GROUND + STANDING;

  it("is true inside and false outside", () => {
    expect(isWithinShelterZone(zone, 100, y, 50)).toBe(true);
    expect(isWithinShelterZone(zone, 104.9, y, 53.9)).toBe(true);
    expect(isWithinShelterZone(zone, 105.1, y, 50)).toBe(false);
    expect(isWithinShelterZone(zone, 100, y, 54.1)).toBe(false);
    expect(isWithinShelterZone(zone, 94.9, y, 50)).toBe(false);
    expect(isWithinShelterZone(zone, 100, y, 45.9)).toBe(false);
  });

  it("counts the edge as inside", () => {
    expect(isWithinShelterZone(zone, 105, y, 50)).toBe(true);
    expect(isWithinShelterZone(zone, 95, y, 46)).toBe(true);
    expect(isWithinShelterZone(zone, 105.001, y, 50)).toBe(false);
  });

  it("reaches from a little below the floor to the top of the walls, not onto the roof", () => {
    expect(isWithinShelterZone(zone, 100, GROUND - SHELTER_DEPTH_BELOW_FLOOR, 50)).toBe(true);
    expect(isWithinShelterZone(zone, 100, GROUND - SHELTER_DEPTH_BELOW_FLOOR - 0.01, 50)).toBe(false);
    expect(isWithinShelterZone(zone, 100, GROUND + 3, 50)).toBe(true);
    // Standing on the roof (0.3 m thick) the character's centre is well above the walls.
    expect(isWithinShelterZone(zone, 100, GROUND + 3.3 + STANDING, 50)).toBe(false);
  });

  it("turns with the building", () => {
    // After a quarter turn the long side runs north-south.
    const quarter = zoneOf({ ...house, rotation: 90 });
    expect(isWithinShelterZone(quarter, 100, y, 54.5)).toBe(true);
    expect(isWithinShelterZone(quarter, 104.5, y, 50)).toBe(false);

    // Turned 30 degrees: the corner of the unturned house is outside, a turned corner inside.
    const turned = zoneOf({ ...house, rotation: 30 });
    expect(isWithinShelterZone(turned, 104.8, y, 53.8)).toBe(false);
    const yaw = turned.transform.rotationY;
    const cornerX = 100 + 4.8 * Math.cos(yaw) + 3.8 * Math.sin(yaw);
    const cornerZ = 50 - 4.8 * Math.sin(yaw) + 3.8 * Math.cos(yaw);
    expect(isWithinShelterZone(turned, cornerX, y, cornerZ)).toBe(true);
  });

  it("agrees with the building's footprint at any rotation", () => {
    for (const rotation of [0, 15, 90, 200, 340]) {
      const building = { ...house, rotation };
      const turned = zoneOf(building);
      for (let x = 92; x <= 108; x += 0.7) {
        for (let z = 42; z <= 58; z += 0.7) {
          expect(isWithinShelterZone(turned, x, y, z)).toBe(isInsideBuilding(building, x, z));
        }
      }
    }
  });
});

describe("shelterZoneAt", () => {
  const zones = [zoneOf(house), zoneOf({ ...house, id: "other", position: [200, 50] })];

  it("names the zone a point is in, or none", () => {
    expect(shelterZoneAt(zones, 101, GROUND + STANDING, 51)).toBe("house");
    expect(shelterZoneAt(zones, 201, GROUND + STANDING, 51)).toBe("other");
    expect(shelterZoneAt(zones, 150, GROUND + STANDING, 50)).toBeNull();
    expect(shelterZoneAt([], 100, GROUND + STANDING, 50)).toBeNull();
  });
});

describe("shelter system", () => {
  it("keeps each player's own answer up to date as they move", () => {
    const world = createWorld();
    world.add(zoneOf(house));
    const indoors = world.add({ transform: createTransform(100, GROUND + STANDING, 50), shelter: { zone: null } });
    const outdoors = world.add({ transform: createTransform(120, GROUND + STANDING, 50), shelter: { zone: null } });
    const system = createShelterSystem(world);

    system();
    expect(indoors.shelter.zone).toBe("house");
    expect(outdoors.shelter.zone).toBeNull();

    // One walks out through the door in the east wall, the other in.
    indoors.transform.x = 106;
    outdoors.transform.x = 104;
    system();
    expect(indoors.shelter.zone).toBeNull();
    expect(outdoors.shelter.zone).toBe("house");
  });

  it("stops counting a zone that has been taken out of the world", () => {
    const world = createWorld();
    const zone = world.add(zoneOf(house));
    const player = world.add({ transform: createTransform(100, GROUND + STANDING, 50), shelter: { zone: null } });
    const system = createShelterSystem(world);
    system();
    expect(player.shelter.zone).toBe("house");
    world.remove(zone);
    system();
    expect(player.shelter.zone).toBeNull();
  });
});

describe("the dry riverbed", () => {
  it("has a shelter zone for each of its three houses", () => {
    const zones = loadDryRiverbed().buildings.map((building) => buildingShelterZone(building, 0));
    expect(zones.map((zone) => zone?.shelterZone.id)).toEqual(["house_a", "house_b", "house_c"]);
  });
});
