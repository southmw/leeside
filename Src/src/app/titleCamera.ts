/**
 * The camera behind the title screen: it looks the way the player will face and sways
 * slowly from side to side, so the scene is alive without being distracting.
 */

/** How far the view swings to either side, in radians (about 17 degrees). */
const SWAY_ANGLE = 0.3;
/** Seconds for one full swing there and back. */
const SWAY_PERIOD = 40;
/** The view is tilted slightly down, in radians. */
export const TITLE_CAMERA_PITCH = -0.12;

/**
 * Where the title camera sits relative to the character: further back than in play, and
 * far enough to the right that the character stands in the left third of the picture.
 */
export const TITLE_CAMERA_RIG = { distance: 7, shoulderOffset: 3.4 } as const;

/** Yaw of the title camera after `seconds`, swinging around `baseYaw`. Starts at `baseYaw`. */
export function titleCameraYaw(baseYaw: number, seconds: number): number {
  return baseYaw + SWAY_ANGLE * Math.sin((2 * Math.PI * seconds) / SWAY_PERIOD);
}
