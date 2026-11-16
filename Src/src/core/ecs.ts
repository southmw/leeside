import { World } from "miniplex";
import type { Object3D } from "three";
import type { VerticalState } from "../gameplay/verticalMotion";
import type { View } from "../gameplay/view";
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

/** Movement state of a walking entity: jumping and falling, and which way its body faces. */
export interface Character extends VerticalState {
  /**
   * Direction the body faces, in radians, counter-clockwise seen from above; 0 faces -Z.
   * It turns towards the direction of movement and is copied to `transform.rotationY`.
   */
  facing: number;
}

export function createCharacter(facing = 0): Character {
  return { velocityY: 0, grounded: false, jumpHeld: false, facing };
}

export interface Entity {
  transform?: Transform;
  renderable?: Renderable;
  body?: Body;
  /** An entity that walks and jumps under the control of its `input` (players, later enemies). */
  character?: Character;
  /**
   * This step's actions for a player-controlled entity. Each player entity owns its own copy,
   * so systems never assume there is only one player.
   */
  input?: PlayerActions;
  /** Where a player looks. Movement is relative to it, and the camera follows the local player's. */
  view?: View;
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
