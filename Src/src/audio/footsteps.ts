import type { Random } from "../core/random";

/**
 * When a character's footsteps sound, as plain logic: one step for every stride walked on
 * the ground, and one on landing. Playing them is audio.ts's job.
 */

/** How many different footstep recordings there are (audio.ts loads this many). */
export const FOOTSTEP_VARIANTS = 8;

/**
 * Uneven ground lets go of the character for a moment all the time. Only having been in the
 * air this long counts as a jump or a fall, which ends in the sound of landing.
 */
const LANDING_AIRBORNE_SECONDS = 0.2;
/** Moving further than this in one step is not walking (a teleport): no footstep. Metres. */
const TELEPORT_DISTANCE = 2;
/** Slower than this is standing still, in metres per step of the simulation. */
const STILL_DISTANCE = 0.001;
/** Each step differs a little in loudness and pitch; the same sound over and over is tiring. */
const STEP_VOLUME_MIN = 0.75;
const STEP_PITCH_SPREAD = 0.08;

export interface Footsteps {
  /** Metres walked since the last step. */
  travelled: number;
  /** How long the character has been off the ground, in seconds. */
  airborneSeconds: number;
  /** The recording played last, so that the next one is another. -1 before the first. */
  lastVariant: number;
}

export interface FootstepSound {
  /** Which recording, from 0 to `FOOTSTEP_VARIANTS` - 1. */
  variant: number;
  /** Loudness, 0 to 1. */
  volume: number;
  /** How fast the recording plays; 1 is as recorded. */
  rate: number;
}

export function createFootsteps(): Footsteps {
  return { travelled: 0, airborneSeconds: 0, lastVariant: -1 };
}

function sound(state: Footsteps, random: Random, volume: number): FootstepSound {
  // Any recording but the last one.
  let variant = random.int(0, FOOTSTEP_VARIANTS - 2);
  if (variant >= state.lastVariant && state.lastVariant >= 0) {
    variant += 1;
  }
  state.lastVariant = variant;
  return { variant, volume, rate: 1 + random.range(-STEP_PITCH_SPREAD, STEP_PITCH_SPREAD) };
}

/**
 * Advances by one simulation step of `dt` seconds in which the character moved `moved` metres
 * over the ground. `stride` is the distance between two footsteps in metres. Returns the
 * footstep to play now, if any.
 */
export function advanceFootsteps(
  state: Footsteps,
  dt: number,
  moved: number,
  grounded: boolean,
  stride: number,
  random: Random,
): FootstepSound | undefined {
  if (!grounded) {
    state.airborneSeconds += dt;
    return undefined;
  }
  const landed = state.airborneSeconds >= LANDING_AIRBORNE_SECONDS;
  state.airborneSeconds = 0;
  if (landed) {
    // Both feet come down: the stride starts afresh from here.
    state.travelled = 0;
    return sound(state, random, 1);
  }
  if (!(moved > STILL_DISTANCE) || moved > TELEPORT_DISTANCE || !(stride > 0)) {
    // From standing, the first foot comes down after half a stride.
    state.travelled = stride / 2;
    return undefined;
  }
  state.travelled += moved;
  if (state.travelled < stride) {
    return undefined;
  }
  state.travelled -= stride;
  return sound(state, random, random.range(STEP_VOLUME_MIN, 1));
}
