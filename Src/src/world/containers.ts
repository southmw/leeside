import { rotateOffset, WALL_THICKNESS, yawFromDegrees } from "./building";
import { DEFAULT_PROP_SET, type PropSetId } from "./propModels";
import { PROP_SUNK, type PropBox, propSize } from "./props";
import type { ZoneContainer, ZoneDefinition } from "./zoneDefinition";

/**
 * Containers: the things the player searches (prototype design 5.2). This file works out
 * where each one is from the zone definition; what is in them is another matter (step 2.14).
 *
 * A trunk is part of its car and has no shape of its own. Cabinets and crates are plain boxes
 * for now, drawn and collided with like the props.
 */

export interface ContainerShape {
  /** Size in metres: width (along the wall, for a cabinet), height, depth. */
  size: readonly [number, number, number];
  /** Placeholder colour. */
  color: number;
}

export const CONTAINER_SHAPES: Readonly<Record<"cabinet" | "crate", ContainerShape>> = {
  cabinet: { size: [1.0, 1.2, 0.5], color: 0x8a6a45 },
  crate: { size: [0.9, 0.6, 0.6], color: 0xa58a4e },
};

/** How far from a container's interaction point someone is put to use it, in metres. */
const APPROACH_DISTANCE = 1.2;

export interface PlacedContainer {
  id: string;
  kind: ZoneContainer["kind"];
  /** Where to be near to use it. `y` is the height of the ground or floor it stands on. */
  point: { x: number; y: number; z: number };
  /** Level unit vector from the container towards where someone using it stands. */
  front: { x: number; z: number };
  /** The box it is drawn as and collides with. A trunk has none: the car is there already. */
  box?: PropBox;
}

function boxOn(
  shape: ContainerShape,
  x: number,
  z: number,
  ground: number,
  halfX: number,
  halfZ: number,
  yaw: number,
): PropBox {
  const height = shape.size[1];
  return {
    center: { x, y: ground + (height - PROP_SUNK) / 2, z },
    halfExtents: { x: halfX, y: (height + PROP_SUNK) / 2, z: halfZ },
    yaw,
    color: shape.color,
  };
}

/**
 * Where a container of `zone` is. `groundAt` gives the terrain's height at a place; props'
 * sizes, and with them where a car's back end is, depend on the set of models in use.
 */
export function placeContainer(
  container: ZoneContainer,
  zone: Pick<ZoneDefinition, "buildings" | "props">,
  groundAt: (east: number, south: number) => number,
  set: PropSetId = DEFAULT_PROP_SET,
): PlacedContainer {
  const { id, kind } = container;

  if (container.kind === "trunk") {
    const prop = zone.props.find((candidate) => candidate.id === container.prop);
    if (!prop) {
      throw new Error(`Container "${id}": no prop "${container.prop}"`);
    }
    const [east, south] = prop.position;
    const yaw = yawFromDegrees(prop.rotation);
    // The cars' models have their back at -Z (the brake lights are there); so do the boxes.
    const back = rotateOffset(0, -propSize(prop, set)[2] / 2, yaw);
    return {
      id,
      kind,
      point: { x: east + back.x, y: groundAt(east, south), z: south + back.z },
      front: rotateOffset(0, -1, yaw),
    };
  }

  if (container.kind === "cabinet") {
    const building = zone.buildings.find((candidate) => candidate.id === container.building);
    if (!building) {
      throw new Error(`Container "${id}": no building "${container.building}"`);
    }
    const shape = CONTAINER_SHAPES.cabinet;
    const [width, , depth] = shape.size;
    const [east, south] = building.position;
    const yaw = yawFromDegrees(building.rotation);
    // Distance from the building's centre to the cabinet's, which stands against the wall's inner face.
    const inset = WALL_THICKNESS + depth / 2;
    const halfWidth = building.size[0] / 2 - inset;
    const halfDepth = building.size[1] / 2 - inset;
    const along = container.offset;
    const local = {
      north: { x: along, z: -halfDepth, frontX: 0, frontZ: 1, alongX: true },
      south: { x: along, z: halfDepth, frontX: 0, frontZ: -1, alongX: true },
      west: { x: -halfWidth, z: along, frontX: 1, frontZ: 0, alongX: false },
      east: { x: halfWidth, z: along, frontX: -1, frontZ: 0, alongX: false },
    }[container.wall];
    const offset = rotateOffset(local.x, local.z, yaw);
    const x = east + offset.x;
    const z = south + offset.z;
    // The floor of a building is the ground under its centre, where the terrain is levelled.
    const ground = groundAt(east, south);
    return {
      id,
      kind,
      point: { x, y: ground, z },
      front: rotateOffset(local.frontX, local.frontZ, yaw),
      box: boxOn(shape, x, z, ground, local.alongX ? width / 2 : depth / 2, local.alongX ? depth / 2 : width / 2, yaw),
    };
  }

  const shape = CONTAINER_SHAPES.crate;
  const [width, , depth] = shape.size;
  const [east, south] = container.position;
  const yaw = yawFromDegrees(container.rotation);
  const ground = groundAt(east, south);
  return {
    id,
    kind,
    point: { x: east, y: ground, z: south },
    front: rotateOffset(0, 1, yaw),
    box: boxOn(shape, east, south, ground, width / 2, depth / 2, yaw),
  };
}

/** Radius of the circle a crate fits in, for keeping other things clear of it. */
export const CRATE_RADIUS = Math.hypot(CONTAINER_SHAPES.crate.size[0], CONTAINER_SHAPES.crate.size[2]) / 2;

/**
 * A spot in front of a container from which it can be used, and the direction to face it
 * (degrees clockwise from north). For jumping there while developing and for tests.
 */
export function containerApproach(placed: PlacedContainer): { east: number; south: number; facing: number } {
  const reach = APPROACH_DISTANCE + (placed.box ? Math.min(placed.box.halfExtents.x, placed.box.halfExtents.z) : 0);
  const facing = (Math.atan2(-placed.front.x, placed.front.z) * 180) / Math.PI;
  return {
    east: placed.point.x + placed.front.x * reach,
    south: placed.point.z + placed.front.z * reach,
    facing: (facing + 360) % 360,
  };
}
