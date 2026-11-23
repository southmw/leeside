import type { Container, GameWorld, Search } from "../core/ecs";
import { SEARCH_SECONDS } from "../data/tuning";
import type { Command } from "./commands";

/**
 * Searching (prototype design 4.6): a container is opened for the first time by holding the
 * interaction key for a moment, standing still. Letting go, moving, or losing the target
 * starts it over. A container already opened is opened again with a single press, as long as
 * something is left in it.
 */

export function createSearch(): Search {
  return { target: null, seconds: 0, held: false };
}

/** What a container is to someone standing at it. */
export type ContainerState = "closed" | "stocked" | "empty";

export function containerState(container: Pick<Container, "opened" | "items">): ContainerState {
  if (!container.opened) {
    return "closed";
  }
  return container.items.length > 0 ? "stocked" : "empty";
}

/** What the interaction key is aimed at: a container in one of its states, or a pile on the ground. */
export type TargetState = ContainerState | "pile";

export interface SearchSituation {
  /** Whether the interaction key is down this step. */
  interact: boolean;
  /** Whether the character is moving or wants to: walking, jumping, in the air. */
  moving: boolean;
  /** The container or pile that is the character's interaction target, or null. */
  target: { id: string; state: TargetState } | null;
  /** Whether the character lies collapsed. */
  dead: boolean;
}

/**
 * Advances a search by `dt` seconds. Returns the id of the container to open now (or of the
 * pile to pick up), or null. Holding counts only from a fresh press with the same container
 * as the target throughout. A pile, like a container already searched, takes a single press.
 */
export function stepSearch(search: Search, situation: SearchSituation, dt: number): string | null {
  const pressed = situation.interact && !search.held;
  search.held = situation.interact;
  const stop = (): null => {
    search.target = null;
    search.seconds = 0;
    return null;
  };
  const { target } = situation;
  if (situation.dead || !target || target.state === "empty") {
    return stop();
  }
  if (target.state === "stocked" || target.state === "pile") {
    stop();
    return pressed ? target.id : null;
  }
  if (pressed && !situation.moving) {
    search.target = target.id;
    search.seconds = 0;
  }
  if (!situation.interact || situation.moving || search.target !== target.id) {
    return stop();
  }
  search.seconds += Math.max(dt, 0);
  if (search.seconds < SEARCH_SECONDS) {
    return null;
  }
  stop();
  return target.id;
}

/** How far along a search is, 0 to 1, for the ring round the dot. */
export function searchProgress(search: Search): number {
  return Math.min(Math.max(search.seconds / SEARCH_SECONDS, 0), 1);
}

/**
 * Runs every player's search each step and asks, with a command, for a container to be opened
 * when one is due, or a pile to be picked up. Runs after the interaction targets have been picked.
 */
export function createSearchSystem(world: GameWorld, push: (command: Command) => void): (dt: number) => void {
  const containers = world.with("container", "interactable");
  const piles = world.with("pile", "interactable");
  const searchers = world.with("search", "input", "interaction", "id");
  return (dt) => {
    for (const searcher of searchers) {
      let target: SearchSituation["target"] = null;
      if (searcher.interaction.target !== null) {
        for (const entity of containers) {
          if (entity.interactable.id === searcher.interaction.target) {
            target = { id: entity.interactable.id, state: containerState(entity.container) };
          }
        }
        for (const entity of piles) {
          if (entity.interactable.id === searcher.interaction.target) {
            target = { id: entity.interactable.id, state: "pile" };
          }
        }
      }
      const { input, character } = searcher;
      const moving = input.moveX !== 0 || input.moveY !== 0 || input.jump || (character !== undefined && !character.grounded);
      const dead = searcher.health !== undefined && searcher.health.current <= 0;
      const open = stepSearch(searcher.search, { interact: input.interact, moving, target, dead }, dt);
      if (open !== null) {
        push(target?.state === "pile" ? { type: "pickUp", actor: searcher.id, pile: open } : { type: "openContainer", actor: searcher.id, container: open });
      }
    }
  };
}
