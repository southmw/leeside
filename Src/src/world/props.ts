import { yawFromDegrees } from "./building";
import { DEFAULT_PROP_SET, propModelFor, type PropSetId } from "./propModels";
import type { ZoneProp } from "./zoneDefinition";

/**
 * Props of the prototype: cars, a tent, a well, barriers. Each is a single box, which is
 * its collider. Kinds with a model (world/propModels.ts) are drawn with it; the rest are
 * drawn as the box.
 */

export interface PropShape {
  /**
   * Size in metres: width, height, length (length runs north-south before rotation). A prop
   * drawn with a model uses the model's size instead (world/propModels.ts).
   */
  size: readonly [number, number, number];
  /** Placeholder colour. */
  color: number;
}

export const PROP_SHAPES: Readonly<Record<ZoneProp["kind"], PropShape>> = {
  car: { size: [1.9, 1.5, 4.4], color: 0x6b7f8c },
  // On its roof: a little lower and wider than a car on its wheels.
  overturned_car: { size: [2.1, 1.3, 4.4], color: 0x7a5a48 },
  tent: { size: [2.6, 1.7, 3.2], color: 0x7d8a5e },
  well: { size: [1.8, 1.0, 1.8], color: 0x8f8a80 },
  // Rubble across a blocked exit: too high to jump (the reach is about 1.2 m).
  barrier: { size: [12, 2.6, 1.6], color: 0x6f6252 },
};

export interface PropBox {
  center: { x: number; y: number; z: number };
  halfExtents: { x: number; y: number; z: number };
  /** Rotation around the vertical axis in radians, counter-clockwise seen from above. */
  yaw: number;
  color: number;
}

/** How far a prop's box reaches below the ground, so it does not hover on uneven ground. */
export const PROP_SUNK = 0.3;

/** Size of a prop in metres (width, height, length): its model's in `set`, or else its kind's box. */
export function propSize(
  prop: Pick<ZoneProp, "id" | "kind">,
  set: PropSetId = DEFAULT_PROP_SET,
): readonly [number, number, number] {
  return propModelFor(prop, set)?.size ?? PROP_SHAPES[prop.kind].size;
}

/** The box of a prop standing on ground of height `groundHeight`. */
export function propBox(prop: ZoneProp, groundHeight: number, set: PropSetId = DEFAULT_PROP_SET): PropBox {
  const { color } = PROP_SHAPES[prop.kind];
  const [width, height, length] = propSize(prop, set);
  return {
    center: { x: prop.position[0], y: groundHeight + (height - PROP_SUNK) / 2, z: prop.position[1] },
    halfExtents: { x: width / 2, y: (height + PROP_SUNK) / 2, z: length / 2 },
    yaw: yawFromDegrees(prop.rotation),
    color,
  };
}

/** Radius of the circle a prop fits in, for keeping other things clear of it. */
export function propRadius(prop: ZoneProp, set: PropSetId = DEFAULT_PROP_SET): number {
  const [width, , length] = propSize(prop, set);
  return Math.hypot(width, length) / 2;
}
