import type { GameWorld } from "../core/ecs";
import { MOVE_SPEED } from "../data/tuning";
import type { PlayerActions } from "../input/actions";
import type { PhysicsWorld, Vec3 } from "../physics/physicsWorld";
import { settleVertical, stepVertical } from "./verticalMotion";

/**
 * How far a character wants to walk this step, in world space. Forward is -Z and right is +X
 * until the camera decides the direction (step 1.4). The input vector never exceeds length 1,
 * so diagonal movement is not faster.
 */
export function desiredMovement(
  actions: Pick<PlayerActions, "moveX" | "moveY">,
  dt: number,
  speed: number = MOVE_SPEED,
): Vec3 {
  return { x: actions.moveX * speed * dt, y: 0, z: -actions.moveY * speed * dt };
}

/**
 * Moves every character by its own input, plus jumping and gravity. The physics world
 * shortens the movement where something is in the way; the new position takes effect in the
 * physics step that follows, so this system must run before the physics system.
 */
export function createMovementSystem(world: GameWorld, physics: PhysicsWorld): (dt: number) => void {
  const characters = world.with("character", "input", "body");
  return (dt) => {
    for (const { character, input, body } of characters) {
      const desired = desiredMovement(input, dt);
      const wasGrounded = character.grounded;
      desired.y = stepVertical(character, input.jump, dt);
      const result = physics.moveCharacter(body.handle, desired, wasGrounded);
      if (result) {
        settleVertical(character, desired.y, result.y, result.grounded);
      }
    }
  };
}
