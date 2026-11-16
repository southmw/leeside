import type { GameWorld } from "../core/ecs";
import { applyLook } from "./view";

/** Turns every player's view by its own look input. Runs before movement, which depends on it. */
export function createLookSystem(world: GameWorld): () => void {
  const viewers = world.with("view", "input");
  return () => {
    for (const { view, input } of viewers) {
      if (input.lookX !== 0 || input.lookY !== 0) {
        applyLook(view, input.lookX, input.lookY);
      }
    }
  };
}
