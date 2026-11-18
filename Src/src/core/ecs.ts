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

/**
 * A place out of the weather: an upright box whose floor is centred on the entity's
 * `transform` and which turns with it (gameplay/shelter.ts).
 */
export interface ShelterZone {
  /** Id of the building (or other place) that gives the shelter. */
  id: string;
  /** Half the size of the footprint in metres, along the zone's own axes. */
  halfWidth: number;
  halfDepth: number;
  /** How high above the floor the zone reaches, in metres. */
  height: number;
}

/** What can take health away. */
export type DamageCause = "storm" | "cold";

/** What an entity can take before it dies (gameplay/health.ts). */
export interface Health {
  current: number;
  max: number;
  /** What took health last, for telling the player what they died of. Unset until hurt. */
  lastHurtBy?: DamageCause;
}

/** How warm an entity's body is (gameplay/temperature.ts): 0 is comfortable, -100 the coldest. */
export interface Temperature {
  value: number;
}

/** Whether an entity is out of the weather, as of the latest step. */
export interface Shelter {
  /** Id of the shelter zone the entity is in; null out in the open. */
  zone: string | null;
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
  health?: Health;
  temperature?: Temperature;
  /** Kept up to date for entities the weather can hurt (players). */
  shelter?: Shelter;
  /** Makes the entity a place of shelter; needs a `transform`. */
  shelterZone?: ShelterZone;
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
