/** Small pure math helpers shared by gameplay and rendering code. */

/** Restricts `value` to the inclusive range [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  if (min > max) {
    throw new RangeError(`clamp: min (${min}) is greater than max (${max})`);
  }
  return Math.min(Math.max(value, min), max);
}

/** Linear interpolation from `a` to `b`. `t` is not clamped. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Rotation around the vertical (Y) axis, in radians, of a quaternion: the heading of the
 * rotated forward (+Z) vector. Any tilt in the quaternion is ignored.
 */
export function yawFromQuaternion(q: { x: number; y: number; z: number; w: number }): number {
  return Math.atan2(2 * (q.x * q.z + q.w * q.y), 1 - 2 * (q.x * q.x + q.y * q.y));
}

/** Wraps an angle in radians into -PI..PI. */
export function wrapAngle(angle: number): number {
  const turn = 2 * Math.PI;
  return angle - turn * Math.floor((angle + Math.PI) / turn);
}

/**
 * Interpolates between two angles in radians along the shorter way round, so going from
 * just below PI to just above -PI is a small step and not almost a full turn back.
 */
export function lerpAngle(a: number, b: number, t: number): number {
  return a + wrapAngle(b - a) * t;
}

/**
 * Turns an angle towards a target by at most `maxStep` radians, the shorter way round.
 * The result stays within -PI..PI.
 */
export function turnTowards(current: number, target: number, maxStep: number): number {
  const difference = wrapAngle(target - current);
  if (Math.abs(difference) <= maxStep) {
    return wrapAngle(target);
  }
  return wrapAngle(current + Math.sign(difference) * maxStep);
}
