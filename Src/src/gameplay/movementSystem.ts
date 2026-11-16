import type { GameWorld } from "../core/ecs";
import { MOVE_SPEED } from "../data/tuning";
import type { PlayerActions } from "../input/actions";
import type { PhysicsWorld, Vec3 } from "../physics/physicsWorld";
import { settleVertical, stepVertical } from "./verticalMotion";
import { moveDirection } from "./view";

/**
 * How far a character wants to walk this step, in world space. Forward is the direction its
 * view faces (`yaw`; -Z at 0). The input vector never exceeds length 1, so diagonal movement
 * is not faster.
 */
export function desiredMovement(
  actions: Pick<PlayerActions, "moveX" | "moveY">,
  dt: number,
  yaw = 0,
  speed: number = MOVE_SPEED,
): Vec3 {
  const direction = moveDirection(actions.moveX, actions.moveY, yaw);
  return { x: direction.x * speed * dt, y: 0, z: direction.z * speed * dt };
}

/**
 * Moves every character by its own input, plus jumping and gravity. The physics world
 * shortens the movement where something is in the way; the new position takes effect in the
 * physics step that follows, so this system must run before the physics system.
 */
export function createMovementSystem(world: GameWorld, physics: PhysicsWorld): (dt: number) => void {
  const characters = world.with("character", "input", "body");
  return (dt) => {
    for (const { character, input, body, view } of characters) {
      const desired = desiredMovement(input, dt, view?.yaw);
      const wasGrounded = character.grounded;
      desired.y = stepVertical(character, input.jump, dt);
      const result = physics.moveCharacter(body.handle, desired, wasGrounded);
      if (result) {
        settleVertical(character, desired.y, result.y, result.grounded);
      }
    }
  };
}
