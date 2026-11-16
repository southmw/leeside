import { GRAVITY, JUMP_HEIGHT } from "../data/tuning";

/**
 * Which animation the character model plays, as plain logic. The model itself (loading,
 * mixing clips) lives in characterModel.ts.
 */

export type CharacterAnimation = "idle" | "run" | "jump";

export interface AnimationInput {
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

/**
 * Speed in m/s at which the run clip's feet match the ground when played at normal rate,
 * for a model scaled to the character's height. Found by eye; adjust if the feet slide.
 */
export const RUN_CLIP_SPEED = 6;
/** The run clip is never played slower or faster than this, however extreme the speed. */
const MIN_RUN_RATE = 0.5;
const MAX_RUN_RATE = 3;

/**
 * Losing the ground for a moment happens all the time on uneven terrain. The jump animation
 * only starts for a real jump (rising fast) or once the character has been in the air this long.
 */
const AIRBORNE_GRACE_SECONDS = 0.12;
const RISING_SPEED = 2;

/**
 * The part of the model's "Jump" clip in which it is off the ground, in seconds. Before it
 * the model crouches and after it the model settles; the game's jump has neither, since it
 * takes off the moment the button is pressed.
 */
export const JUMP_CLIP_AIR_START = 0.17;
export const JUMP_CLIP_AIR_END = 0.5;

export function chooseAnimation(input: AnimationInput): CharacterAnimation {
  if (!input.grounded && (input.velocityY > RISING_SPEED || input.airborneSeconds >= AIRBORNE_GRACE_SECONDS)) {
    return "jump";
  }
  return input.moving ? "run" : "idle";
}

/** Playback rate for the run clip so that the steps keep pace with the movement speed. */
export function runPlaybackRate(speed: number, clipSpeed: number = RUN_CLIP_SPEED): number {
  if (!(speed > 0) || !(clipSpeed > 0)) {
    return 1;
  }
  return Math.min(Math.max(speed / clipSpeed, MIN_RUN_RATE), MAX_RUN_RATE);
}

/** How long a jump from flat ground stays in the air: up and down again under gravity. */
export function jumpAirSeconds(height: number = JUMP_HEIGHT, gravity: number = GRAVITY): number {
  return 2 * Math.sqrt((2 * height) / gravity);
}

/**
 * Where in the jump clip the model should be after `airborneSeconds` in the air. The clip's
 * airborne part is stretched over the length of a normal jump; in a longer fall the model
 * holds the last airborne pose until it lands.
 */
export function jumpClipTime(airborneSeconds: number, airSeconds: number = jumpAirSeconds()): number {
  const progress = airSeconds > 0 ? Math.min(Math.max(airborneSeconds / airSeconds, 0), 1) : 1;
  return JUMP_CLIP_AIR_START + (JUMP_CLIP_AIR_END - JUMP_CLIP_AIR_START) * progress;
}
