import {
  WIND_APPROACH_STRENGTH,
  WIND_CALM_VOLUME,
  WIND_INDOOR_CUTOFF_HZ,
  WIND_INDOOR_VOLUME,
  WIND_STORM_RATE,
  WIND_STORM_VOLUME,
} from "../data/tuning";

/**
 * How the wind should sound, as plain numbers: pure functions of the weather and of whether
 * the listener is indoors. Playing it is audio.ts's job.
 */

/** The pitch above which nothing is muffled: outdoors the filter lets everything through. Hz. */
export const OPEN_CUTOFF_HZ = 20000;

export interface WindMix {
  /** Volume of the wind: 1 plays the recording as it is, and a storm plays it louder. */
  volume: number;
  /** Everything above this pitch is muffled, in Hz. */
  cutoffHz: number;
  /** How fast the recording plays; 1 is as recorded. */
  rate: number;
}

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

/**
 * How hard the wind blows, 0 to 1: the storm's strength, or what its approach amounts to.
 * Unlike the picture (render/stormLook.ts), which changes mostly late in the warning, the
 * sound grows evenly from the warning's first second: it is what tells of the storm when the
 * player is not looking south.
 */
export function windStrength(intensity: number, approach: number): number {
  return Math.max(clamp01(intensity), WIND_APPROACH_STRENGTH * clamp01(approach));
}

/** The wind's sound in weather of this `intensity` and `approach` (both 0 to 1), outdoors or in. */
export function windMix(intensity: number, approach: number, indoors: boolean): WindMix {
  const strength = windStrength(intensity, approach);
  const outdoors = WIND_CALM_VOLUME + (WIND_STORM_VOLUME - WIND_CALM_VOLUME) * strength;
  return {
    volume: indoors ? outdoors * WIND_INDOOR_VOLUME : outdoors,
    cutoffHz: indoors ? WIND_INDOOR_CUTOFF_HZ : OPEN_CUTOFF_HZ,
    rate: 1 + (WIND_STORM_RATE - 1) * strength,
  };
}
