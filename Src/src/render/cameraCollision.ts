import {
  CAMERA_DISTANCE,
  CAMERA_FOLLOW_RATE,
  CAMERA_MIN_DISTANCE,
  CAMERA_PIVOT_HEIGHT,
  CAMERA_PULL_IN_SPEED,
  CAMERA_RECOVER_SPEED,
  CAMERA_SHOULDER_OFFSET,
} from "../data/tuning";
import { viewAxes, type Point } from "./cameraRig";

/**
 * Keeps the camera out of walls and the ground. Everything here is arithmetic over the
 * result of a sweep, which the caller supplies, so it can be tested without physics.
 */

/**
 * Sweeps a small sphere from `origin` along the unit vector `direction` for at most
 * `maxDistance`, and returns how far it got before touching something, or undefined if
 * nothing was in the way.
 */
export type Sweep = (origin: Point, direction: Point, maxDistance: number) => number | undefined;

/** Distance to use when something may be in the way: stop where the sweep stopped, but not closer than `min`. */
export function limitDistance(desired: number, hit: number | undefined, min = 0): number {
  if (hit === undefined || hit >= desired) {
    return desired;
  }
  return Math.max(min, hit);
}

export interface CameraFit {
  /** How far behind the shoulder point the camera can sit. */
  distance: number;
  /** How far to the right of the character the shoulder point can be. */
  shoulderOffset: number;
}

/**
 * Finds the camera distance and shoulder offset that fit the surroundings. Two sweeps: first
 * sideways from above the character to the shoulder point, because that point can itself be
 * inside a wall the character stands next to; then backwards from there to the camera.
 * `wantedDistance` is how far back the player wants the camera (the wheel zoom).
 */
export function fitCamera(
  character: Point,
  yaw: number,
  pitch: number,
  sweep: Sweep,
  wantedDistance: number = CAMERA_DISTANCE,
): CameraFit {
  const { forward, right } = viewAxes(yaw, pitch);
  const head = { x: character.x, y: character.y + CAMERA_PIVOT_HEIGHT, z: character.z };

  const shoulderOffset = limitDistance(
    CAMERA_SHOULDER_OFFSET,
    sweep(head, { x: right.x, y: 0, z: right.z }, CAMERA_SHOULDER_OFFSET),
  );
  const shoulder = { x: head.x + right.x * shoulderOffset, y: head.y, z: head.z + right.z * shoulderOffset };
  const distance = limitDistance(
    wantedDistance,
    sweep(shoulder, { x: -forward.x, y: -forward.y, z: -forward.z }, wantedDistance),
    CAMERA_MIN_DISTANCE,
  );
  return { distance, shoulderOffset };
}

/**
 * Moves the camera distance towards what fits.
 *
 * - Nothing in the way: move back out gradually, so the view does not jump when an obstacle
 *   has passed.
 * - Something between the character and the camera, but the camera's own spot is free: only
 *   the view is blocked, so glide in. An object that merely crosses the line of sight (walking
 *   past a crate) is gone again before the camera has moved much, and nothing jumps.
 * - The camera's own spot is inside something (`blockedHere`): move in at once, or the
 *   screen would show the inside of a wall or the underside of the ground.
 */
export function updateCameraDistance(
  current: number,
  target: number,
  blockedHere: boolean,
  dtSeconds: number,
  pullInSpeed: number = CAMERA_PULL_IN_SPEED,
  recoverSpeed: number = CAMERA_RECOVER_SPEED,
  followRate: number = CAMERA_FOLLOW_RATE,
): number {
  const dt = Math.max(dtSeconds, 0);
  // A large gap (a long zoom) is closed faster than the fixed speed, in proportion to its size.
  const gap = Math.abs(target - current);
  if (target >= current) {
    return Math.min(target, current + Math.max(recoverSpeed, gap * followRate) * dt);
  }
  if (blockedHere) {
    return target;
  }
  return Math.max(target, current - Math.max(pullInSpeed, gap * followRate) * dt);
}

/**
 * Moves the shoulder offset towards what fits: in at once, out gradually. The offset is
 * short, so an immediate change is not noticeable the way it is for the distance.
 */
export function easeCameraLength(
  current: number,
  target: number,
  dtSeconds: number,
  speed: number = CAMERA_RECOVER_SPEED,
): number {
  if (target <= current) {
    return target;
  }
  return Math.min(target, current + speed * Math.max(dtSeconds, 0));
}
