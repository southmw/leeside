import type { GameWorld } from "../core/ecs";
import { turnTowards } from "../core/math";
import { CHARACTER_TURN_RATE, MOVE_SPEED } from "../data/tuning";
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

/** The facing (0 faces -Z, counter-clockwise from above) that points along a horizontal direction. */
export function facingOf(x: number, z: number): number {
  return Math.atan2(-x, -z);
}

/**
 * Moves every character by its own input, plus jumping and gravity. The physics world
 * shortens the movement where something is in the way; the new position takes effect in the
 * physics step that follows, so this system must run before the physics system.
 * `speed` overrides the walking speed, for trying out values (`?speed`).
 */
export function createMovementSystem(
  world: GameWorld,
  physics: PhysicsWorld,
  speed: number = MOVE_SPEED,
): (dt: number) => void {
  const characters = world.with("character", "input", "body");
  return (dt) => {
    for (const { character, input, body, view } of characters) {
      const desired = desiredMovement(input, dt, view?.yaw, speed);
      if (desired.x !== 0 || desired.z !== 0) {
        character.facing = turnTowards(character.facing, facingOf(desired.x, desired.z), CHARACTER_TURN_RATE * dt);
      }
      const wasGrounded = character.grounded;
      desired.y = stepVertical(character, input.jump, dt);
      const result = physics.moveCharacter(body.handle, desired, wasGrounded);
      if (result) {
        settleVertical(character, desired.y, result.y, result.grounded);
      }
    }
  };
}
