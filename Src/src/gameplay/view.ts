import { clamp } from "../core/math";
import { LOOK_DOWN_LIMIT_DEGREES, LOOK_UP_LIMIT_DEGREES } from "../data/tuning";

/**
 * Where a player is looking. It belongs to the simulation, not to the camera, because the
 * direction of movement depends on it and every player has their own.
 *
 * Conventions: at yaw 0 the view faces -Z. Positive yaw turns left (counter-clockwise seen
 * from above), positive pitch looks up.
 */
export interface View {
  /** Radians, kept within -PI..PI. */
  yaw: number;
  /** Radians, limited to the look-down and look-up limits. */
  pitch: number;
}

const DEGREES = Math.PI / 180;
export const MIN_PITCH = -LOOK_DOWN_LIMIT_DEGREES * DEGREES;
export const MAX_PITCH = LOOK_UP_LIMIT_DEGREES * DEGREES;

export function createView(yaw = 0, pitch = 0): View {
  return { yaw, pitch };
}

/** Wraps an angle into -PI..PI, so it never grows without bound. */
export function wrapAngle(angle: number): number {
  const turn = 2 * Math.PI;
  return angle - turn * Math.floor((angle + Math.PI) / turn);
}

/**
 * Turns the view. `lookX` is radians to the right and `lookY` radians downwards, the way a
 * mouse moves. Pitch stops at its limits.
 */
export function applyLook(view: View, lookX: number, lookY: number): void {
  view.yaw = wrapAngle(view.yaw - lookX);
  view.pitch = clamp(view.pitch - lookY, MIN_PITCH, MAX_PITCH);
}

/**
 * Turns a move input (x: right, y: forward) into a horizontal world direction relative to
 * where the view faces. The length is kept, so it stays at most 1.
 */
export function moveDirection(moveX: number, moveY: number, yaw: number): { x: number; z: number } {
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  // Forward is (-sin, -cos); right is (cos, -sin).
  return { x: moveX * cos - moveY * sin, z: -moveX * sin - moveY * cos };
}
