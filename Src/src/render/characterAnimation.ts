/**
 * Which animation the character model plays, as plain logic. The model itself (loading,
 * mixing clips) lives in characterModel.ts.
 */

export type CharacterAnimation = "idle" | "run" | "jump" | "death";

export interface AnimationInput {
  /** Whether the character has collapsed (health at zero). Nothing else matters then. */
  dead: boolean;
  /** Whether the character is trying to move. */
  moving: boolean;
  /** Movement speed in m/s while moving. */
  speed: number;
  /** Whether the character stands on the ground. */
  grounded: boolean;
  /** Upward speed in m/s; positive while rising. */
  velocityY: number;
  /** How long the character has been off the ground, in seconds. 0 while grounded. */
  airborneSeconds: number;
}

/** The run clip is never played slower or faster than this, however extreme the speed. */
const MIN_RUN_RATE = 0.5;
const MAX_RUN_RATE = 3;

/**
 * Losing the ground for a moment happens all the time on uneven terrain. The jump animation
 * only starts for a real jump (rising fast) or once the character has been in the air this long.
 */
const AIRBORNE_GRACE_SECONDS = 0.12;
const RISING_SPEED = 2;

export function chooseAnimation(input: AnimationInput): CharacterAnimation {
  if (input.dead) {
    return "death";
  }
  if (!input.grounded && (input.velocityY > RISING_SPEED || input.airborneSeconds >= AIRBORNE_GRACE_SECONDS)) {
    return "jump";
  }
  return input.moving ? "run" : "idle";
}

/** Playback rate for the run clip so that the steps keep pace with the movement speed. */
export function runPlaybackRate(speed: number, clipSpeed: number): number {
  if (!(speed > 0) || !(clipSpeed > 0)) {
    return 1;
  }
  return Math.min(Math.max(speed / clipSpeed, MIN_RUN_RATE), MAX_RUN_RATE);
}
