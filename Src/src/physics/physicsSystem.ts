import type { GameWorld } from "../core/ecs";
import type { PhysicsWorld } from "./physicsWorld";

export interface PhysicsSystem {
  /** Steps the physics once and copies the resulting poses onto the entities. */
  update(): void;
  dispose(): void;
}

/**
 * Runs the physics step inside the fixed timestep and keeps entities in line with it:
 * the pose of every entity with `body` is written to its `transform`, and a body is removed
 * from the physics world when its entity goes away.
 */
export function createPhysicsSystem(world: GameWorld, physics: PhysicsWorld): PhysicsSystem {
  const bodies = world.with("body", "transform");
  const unsubscribeRemoved = world.with("body").onEntityRemoved.subscribe((entity) => {
    physics.removeBody(entity.body.handle);
  });

  return {
    update(): void {
      physics.step();
      for (const entity of bodies) {
        physics.readPose(entity.body.handle, entity.transform);
        // A character's capsule never turns in the physics world; its facing is game state.
        if (entity.character) {
          entity.transform.rotationY = entity.character.facing;
        }
      }
    },
    dispose(): void {
      unsubscribeRemoved();
    },
  };
}
