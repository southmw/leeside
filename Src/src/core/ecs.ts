import { World } from "miniplex";
import type { Object3D } from "three";

/**
 * Entity component definitions.
 *
 * Components are plain data so that state can be saved and, later, sent over the network.
 * `renderable` is the one exception: it points at a Three.js object and is never serialised.
 */

export interface Transform {
  x: number;
  y: number;
  z: number;
  /** Rotation around the vertical axis in radians. */
  rotationY: number;
}

export interface Renderable {
  object: Object3D;
}

/** Placeholder component: spins the entity at a constant rate. Removed once real gameplay exists. */
export interface Spin {
  /** Radians per second. */
  speed: number;
}

export interface Entity {
  transform?: Transform;
  renderable?: Renderable;
  spin?: Spin;
}

export type GameWorld = World<Entity>;

export function createWorld(): GameWorld {
  return new World<Entity>();
}

export function createTransform(x = 0, y = 0, z = 0, rotationY = 0): Transform {
  return { x, y, z, rotationY };
}
