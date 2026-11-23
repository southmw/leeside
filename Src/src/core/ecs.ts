import { World } from "miniplex";
import type { Object3D } from "three";
import type { ItemId } from "../data/items";
import type { Inventory, ItemStack } from "../gameplay/inventory";
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
export type DamageCause = "storm" | "cold" | "thirst";

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

/** How much an entity has left before it must drink (gameplay/thirst.ts): 100 down to 0. */
export interface Thirst {
  value: number;
}

/** Whether an entity is out of the weather, as of the latest step. */
export interface Shelter {
  /** Id of the shelter zone the entity is in; null out in the open. */
  zone: string | null;
}

/**
 * What an interaction target is for: searching a container, picking up what lies on the
 * ground, leaving for another zone, or (the shelter's door) seeing how far its repair is.
 */
export type InteractionKind = "search" | "pickup" | "travel" | "repair";

/** A way out of the zone (prototype design 5.5): the zone it leads to and the entry point there. */
export interface ExitLink {
  to: string;
  entry: string;
}

/**
 * Something a character can use when near and looking its way (gameplay/interaction.ts). The
 * spot to be near is the entity's `transform`, whose `y` is the ground or floor it stands on.
 */
export interface Interactable {
  /** Id from the zone definition. */
  id: string;
  kind: InteractionKind;
  /**
   * Handle (PhysicsWorld) of the solid thing this is: a cabinet's or crate's own box, a
   * trunk's car. It does not count as being in the way of itself. Unset if it has no body.
   */
  solid?: number;
}

export type ContainerKind = "trunk" | "cabinet" | "crate";

/**
 * Something to search (gameplay/loot.ts, gameplay/search.ts): whether it has been opened and
 * what is left in it. The state outlives the entity: it is kept when a zone is taken down and
 * handed to the entity again when the zone comes back.
 */
export interface Container {
  kind: ContainerKind;
  opened: boolean;
  /** One entry per kind of thing; no stack limit in here. */
  items: ItemStack[];
}

/**
 * Things lying on the ground where someone threw them out (prototype design 4.7). One entry
 * per kind of thing, no stack limit. The entity is an `interactable` too, and goes when the
 * last thing is picked up.
 */
export interface Pile {
  items: ItemStack[];
  /** Set on the bag a death left behind (prototype design 2.4): there is one at most, and nothing thrown out joins it. */
  dropped?: true;
}

/**
 * A player's quick slots (prototype design 4.5, gameplay/quickSlots.ts). A slot names a kind
 * of item, or nothing; the things themselves stay in the bag.
 */
export interface QuickSlots {
  slots: Array<ItemId | null>;
  /** Whether each slot's key was down in the last step, to tell a press from a hold. */
  held: boolean[];
}

/** A player's search under way (gameplay/search.ts). */
export interface Search {
  /** Id of the container being searched; null when none is. */
  target: string | null;
  /** How long the key has been held on it. */
  seconds: number;
  /** Whether the interaction key was down in the last step, to tell a press from a hold. */
  held: boolean;
}

/** What an entity could use right now, as of the latest step. */
export interface Interaction {
  /** Id of the interactable; null when there is none in reach and in view. */
  target: string | null;
}

export interface Entity {
  /**
   * A name that stays the same for as long as the entity exists, by which commands (and later
   * save files and other machines) refer to it. Players have one.
   */
  id?: string;
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
  thirst?: Thirst;
  /** Kept up to date for entities the weather can hurt (players). */
  shelter?: Shelter;
  /** Makes the entity a place of shelter; needs a `transform`. */
  shelterZone?: ShelterZone;
  /** What the entity carries: a player's bag (gameplay/inventory.ts). */
  inventory?: Inventory;
  /** Makes the entity a container to search; it is an `interactable` too. */
  container?: Container;
  /** Makes the entity a way into another zone; it is an `interactable` too. */
  exit?: ExitLink;
  /** Makes the entity a pile of things on the ground; it is an `interactable` too. */
  pile?: Pile;
  /** Kept for entities that can search (players). */
  search?: Search;
  /** A player's quick slots. */
  quickSlots?: QuickSlots;
  /** Makes the entity something to interact with; needs a `transform`. */
  interactable?: Interactable;
  /** Kept up to date for entities that can interact (players); needs a `view`. */
  interaction?: Interaction;
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
