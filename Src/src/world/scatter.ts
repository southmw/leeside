import { createRandom } from "../core/random";
import { CRATE_RADIUS } from "./containers";
import { DEFAULT_PROP_SET, type PropSetId } from "./propModels";
import { propRadius } from "./props";
import type { ZoneDefinition } from "./zoneDefinition";

/**
 * Scattered clutter (rocks). Where each piece lies is computed from a fixed seed, so it is
 * the same for every player and every run, and nothing lands on a building, a prop, a crate
 * or the starting point.
 */

export interface ScatterItem {
  x: number;
  z: number;
  /** Rough radius in metres. */
  size: number;
  /** Rotation around the vertical axis in radians. */
  yaw: number;
}

/** Rock sizes: most are small, a few are large enough to be obstacles. */
export const ROCK_MIN_SIZE = 0.25;
export const ROCK_MAX_SIZE = 1.5;
/** Clutter keeps this far from the zone's edge, buildings, props and the starting point, in metres. */
const EDGE_MARGIN = 3;
const BUILDING_MARGIN = 3;
const PROP_MARGIN = 2;
/** Enough room to walk round a crate. Cabinets are indoors and trunks are part of a prop. */
const CRATE_MARGIN = 1;
const START_CLEARANCE = 6;
/** Gives up on placing a piece after this many tries, so a crowded zone cannot hang the game. */
const MAX_TRIES_PER_ITEM = 30;

type ScatterDefinition = ZoneDefinition["scatter"][number];

/** A circle to keep clear. */
interface Clearance {
  x: number;
  z: number;
  radius: number;
}

function clearances(zone: ZoneDefinition, set: PropSetId): Clearance[] {
  return [
    ...zone.buildings.map((building) => ({
      x: building.position[0],
      z: building.position[1],
      radius: Math.hypot(building.size[0], building.size[1]) / 2 + BUILDING_MARGIN,
    })),
    ...zone.props.map((prop) => ({
      x: prop.position[0],
      z: prop.position[1],
      radius: propRadius(prop, set) + PROP_MARGIN,
    })),
    ...zone.containers.flatMap((container) =>
      container.kind === "crate"
        ? [{ x: container.position[0], z: container.position[1], radius: CRATE_RADIUS + CRATE_MARGIN }]
        : [],
    ),
    { x: zone.spawn.position[0], z: zone.spawn.position[1], radius: START_CLEARANCE },
  ];
}

/**
 * Positions, sizes and rotations for one scatter entry of a zone. Props differ in size from
 * one set of models to another, so what is kept clear depends on `set`.
 */
export function scatterItems(
  zone: ZoneDefinition,
  scatter: ScatterDefinition,
  set: PropSetId = DEFAULT_PROP_SET,
): ScatterItem[] {
  const random = createRandom(scatter.seed);
  const keepClear = clearances(zone, set);
  const items: ScatterItem[] = [];

  for (let index = 0; index < scatter.count; index += 1) {
    for (let attempt = 0; attempt < MAX_TRIES_PER_ITEM; attempt += 1) {
      const x = random.range(EDGE_MARGIN, zone.size - EDGE_MARGIN);
      const z = random.range(EDGE_MARGIN, zone.size - EDGE_MARGIN);
      // Squaring the roll makes small rocks common and large ones rare.
      const roll = random.next();
      const size = ROCK_MIN_SIZE + (ROCK_MAX_SIZE - ROCK_MIN_SIZE) * roll * roll;
      const yaw = random.range(0, 2 * Math.PI);
      const blocked = keepClear.some((area) => Math.hypot(x - area.x, z - area.z) < area.radius + size);
      if (!blocked) {
        items.push({ x, z, size, yaw });
        break;
      }
    }
  }
  return items;
}
