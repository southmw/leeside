import type { GameWorld } from "../core/ecs";
import type { PlayerActions } from "./actions";

/** Anything that can report the local player's actions for the current step. */
export interface ActionSource {
  sample(): PlayerActions;
}

/**
 * Copies the local devices' actions onto every entity marked `localPlayer`.
 * Remote players will get their `input` from the network instead; the rest of the
 * simulation reads `entity.input` and cannot tell the difference.
 */
export function createInputSystem(world: GameWorld, source: ActionSource): () => void {
  const localPlayers = world.with("localPlayer", "input");
  return () => {
    const actions = source.sample();
    for (const entity of localPlayers) {
      Object.assign(entity.input, actions);
    }
  };
}
