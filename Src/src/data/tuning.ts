/**
 * Game numbers in one place, so balancing means editing this file only.
 * The values come from DOC/06 (prototype design), chapter 3; change both together.
 */

/** Downward acceleration in m/s². Stronger than Earth's so jumps feel snappy. */
export const GRAVITY = 20;

/** Player capsule: total height and radius in metres. */
export const CHARACTER_HEIGHT = 1.8;
export const CHARACTER_RADIUS = 0.35;

/** Player movement speed in m/s. The prototype has a single speed: no walking or sprinting. */
export const MOVE_SPEED = 6.5;
