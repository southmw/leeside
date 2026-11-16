import { GRAVITY, JUMP_HEIGHT } from "../data/tuning";

/**
 * Jumping and falling for a character, as plain arithmetic. The physics world then decides
 * how much of the resulting movement actually fits (see movementSystem).
 */

/** The part of the `character` component this module reads and writes. */
export interface VerticalState {
  /** Upward speed in m/s. Negative while falling. */
  velocityY: number;
  /** Whether the character stood on something after its latest move. */
  grounded: boolean;
  /** Whether the jump button was down on the previous step, so one press gives one jump. */
  jumpHeld: boolean;
}

/** Take-off speed that reaches `height` under `gravity`: v = sqrt(2 g h). */
export function jumpSpeed(height: number = JUMP_HEIGHT, gravity: number = GRAVITY): number {
  return Math.sqrt(2 * gravity * height);
}

/**
 * Advances jumping and falling by one step and returns the vertical distance to move.
 *
 * A jump starts only from the ground and only on a new press of the button: holding it does
 * not jump again on landing, and pressing it in the air does nothing. The distance uses the
 * exact formula for constant acceleration, so the jump height does not depend on the step
 * length.
 *
 * A character standing on the ground is not pushed down at all. Measured with Rapier 0.21:
 * pressing a walking character into the floor every step makes it lose whole steps of
 * movement and slowly sink in. The physics world keeps it on the ground instead (ground
 * snapping), and reports when the ground is gone, at which point falling starts here.
 */
export function stepVertical(
  state: VerticalState,
  jumpDown: boolean,
  dt: number,
  gravity: number = GRAVITY,
  jumpHeight: number = JUMP_HEIGHT,
): number {
  const jumpPressed = jumpDown && !state.jumpHeld;
  state.jumpHeld = jumpDown;

  if (state.grounded) {
    if (!jumpPressed) {
      state.velocityY = 0;
      return 0;
    }
    state.velocityY = jumpSpeed(jumpHeight, gravity);
    state.grounded = false;
  }

  const distance = state.velocityY * dt - 0.5 * gravity * dt * dt;
  state.velocityY -= gravity * dt;
  return distance;
}

/**
 * Takes in what the physics world allowed: `moved` is the vertical distance actually covered
 * out of the `wanted` one, and `onGround` whether the character ended up standing.
 */
export function settleVertical(state: VerticalState, wanted: number, moved: number, onGround: boolean): void {
  // Rising but stopped short: the head hit something, so the jump ends there.
  if (state.velocityY > 0 && moved < wanted * 0.5) {
    state.velocityY = 0;
  }
  // Never grounded while still rising, even if the feet have not cleared the ground yet.
  state.grounded = onGround && state.velocityY <= 0;
}
