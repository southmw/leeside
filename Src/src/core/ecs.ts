import { World } from "miniplex";
import type { Object3D } from "three";
import type { PlayerActions } from "../input/actions";

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

/** Links the entity to a body in the physics world, which then drives its `transform`. */
export interface Body {
  /** Handle from PhysicsWorld. A plain number, so the component stays serialisable. */
  handle: number;
}

export interface Entity {
  transform?: Transform;
  renderable?: Renderable;
  body?: Body;
  /** Marks an entity that walks under the control of its `input` (players, later enemies). */
  character?: true;
  /**
   * This step's actions for a player-controlled entity. Each player entity owns its own copy,
   * so systems never assume there is only one player.
   */
  input?: PlayerActions;
  /** Marks the entity controlled from this machine's devices. */
  localPlayer?: true;
}

export type GameWorld = World<Entity>;

export function createWorld(): GameWorld {
  return new World<Entity>();
}

export function createTransform(x = 0, y = 0, z = 0, rotationY = 0): Transform {
  return { x, y, z, rotationY };
}
