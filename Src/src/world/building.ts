import type { ShelterZone, Transform } from "../core/ecs";
import type { ZoneBuilding } from "./zoneDefinition";

/**
 * Turns a building from a zone definition into the boxes it is made of: four walls with a
 * doorway in one of them, and a roof. Pure arithmetic; the same boxes become the picture and
 * the colliders. Prototype buildings are plain boxes, to be replaced by models later.
 */

/** Thickness of walls and roof in metres. */
export const WALL_THICKNESS = 0.3;
/** Height of a doorway. Taller than the character (1.8 m) with room to spare. */
export const DOOR_HEIGHT = 2.2;
/** How far walls reach below the ground, so no gap shows where the ground is not quite level. */
const WALL_DEPTH_BELOW_GROUND = 0.5;
/** How far the roof sticks out past the walls. */
const ROOF_OVERHANG = 0.3;

export interface BuildingBox {
  kind: "wall" | "roof";
  /** Centre in world coordinates. */
  center: { x: number; y: number; z: number };
  halfExtents: { x: number; y: number; z: number };
  /** Rotation around the vertical axis in radians, counter-clockwise seen from above. */
  yaw: number;
}

/** A zone direction (degrees clockwise from north) as a yaw (radians counter-clockwise from above). */
export function yawFromDegrees(degreesClockwise: number): number {
  return (-degreesClockwise * Math.PI) / 180;
}

/** Rotates a point given relative to a building (x: east, z: south, before rotation) into world offsets. */
export function rotateOffset(localX: number, localZ: number, yaw: number): { x: number; z: number } {
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  return { x: localX * cos + localZ * sin, z: -localX * sin + localZ * cos };
}

/** The reverse of `rotateOffset`: a world offset from the building's centre, in the building's own axes. */
function unrotate(worldX: number, worldZ: number, yaw: number): { x: number; z: number } {
  return rotateOffset(worldX, worldZ, -yaw);
}

/**
 * The boxes of one building standing on ground of height `groundHeight`.
 * `size` is the outer footprint: width (east-west before rotation), depth, and wall height.
 */
export function buildingBoxes(building: ZoneBuilding, groundHeight: number): BuildingBox[] {
  const [width, depth, height] = building.size;
  const [east, south] = building.position;
  const yaw = yawFromDegrees(building.rotation);
  const t = WALL_THICKNESS;
  const boxes: BuildingBox[] = [];

  /** Adds a box given in the building's own axes, spanning `bottom` to `top` above the ground. */
  const add = (
    kind: BuildingBox["kind"],
    localX: number,
    localZ: number,
    halfX: number,
    halfZ: number,
    bottom: number,
    top: number,
  ): void => {
    const offset = rotateOffset(localX, localZ, yaw);
    boxes.push({
      kind,
      center: { x: east + offset.x, y: groundHeight + (bottom + top) / 2, z: south + offset.z },
      halfExtents: { x: halfX, y: (top - bottom) / 2, z: halfZ },
      yaw,
    });
  };

  // The north and south walls run the full width; the east and west walls fit between them.
  const walls = {
    north: { alongX: true, x: 0, z: -depth / 2 + t / 2, length: width },
    south: { alongX: true, x: 0, z: depth / 2 - t / 2, length: width },
    east: { alongX: false, x: width / 2 - t / 2, z: 0, length: depth - 2 * t },
    west: { alongX: false, x: -width / 2 + t / 2, z: 0, length: depth - 2 * t },
  } as const;

  for (const [side, wall] of Object.entries(walls)) {
    /** A piece of this wall: `centre` and `length` are measured along the wall from its middle. */
    const piece = (centre: number, length: number, bottom: number, top: number): void => {
      if (length <= 0 || top <= bottom) {
        return;
      }
      if (wall.alongX) {
        add("wall", wall.x + centre, wall.z, length / 2, t / 2, bottom, top);
      } else {
        add("wall", wall.x, wall.z + centre, t / 2, length / 2, bottom, top);
      }
    };

    if (side !== building.door.side) {
      piece(0, wall.length, -WALL_DEPTH_BELOW_GROUND, height);
      continue;
    }
    // The wall with the doorway: a piece on either side of the opening and one above it.
    const opening = Math.min(building.door.width, wall.length);
    const sideLength = (wall.length - opening) / 2;
    const sideCentre = opening / 2 + sideLength / 2;
    piece(-sideCentre, sideLength, -WALL_DEPTH_BELOW_GROUND, height);
    piece(sideCentre, sideLength, -WALL_DEPTH_BELOW_GROUND, height);
    piece(0, opening, Math.min(DOOR_HEIGHT, height), height);
  }

  add("roof", 0, 0, width / 2 + ROOF_OVERHANG, depth / 2 + ROOF_OVERHANG, height, height + t);
  return boxes;
}

/**
 * The shelter a building gives, standing on ground of height `groundHeight`: everything within
 * its outer walls, up to the top of the walls. Undefined for a building that gives none.
 */
export function buildingShelterZone(
  building: ZoneBuilding,
  groundHeight: number,
): { shelterZone: ShelterZone; transform: Transform } | undefined {
  if (!building.shelter) {
    return undefined;
  }
  const [width, depth, height] = building.size;
  const [east, south] = building.position;
  return {
    shelterZone: { id: building.id, halfWidth: width / 2, halfDepth: depth / 2, height },
    transform: { x: east, y: groundHeight, z: south, rotationY: yawFromDegrees(building.rotation) },
  };
}

/** Whether a point is within a building's outer walls, whatever its height. */
export function isInsideBuilding(building: ZoneBuilding, x: number, z: number): boolean {
  const [width, depth] = building.size;
  const local = unrotate(x - building.position[0], z - building.position[1], yawFromDegrees(building.rotation));
  return Math.abs(local.x) <= width / 2 && Math.abs(local.z) <= depth / 2;
}

/** The building a point is inside, if any. */
export function buildingAt(buildings: readonly ZoneBuilding[], x: number, z: number): ZoneBuilding | undefined {
  return buildings.find((building) => isInsideBuilding(building, x, z));
}
