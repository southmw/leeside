import type { GameWorld } from "../core/ecs";

/** Placeholder system: rotates every entity that has `transform` and `spin`. */
export function createSpinSystem(world: GameWorld): (dt: number) => void {
  const spinning = world.with("transform", "spin");
  return (dt) => {
    for (const entity of spinning) {
      entity.transform.rotationY += entity.spin.speed * dt;
    }
  };
}
