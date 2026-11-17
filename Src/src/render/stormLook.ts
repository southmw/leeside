import { STORM_VISIBILITY } from "../data/tuning";
import { type Daylight, luminance, type Rgb } from "./daylight";

/**
 * What a storm does to the look of the scene, as plain numbers: dust closes the view in to a
 * few metres, colours the sky and the air like sand, and dims the sun. No Three.js here.
 */

export interface SceneLook extends Daylight {
  /** Colour of the haze things fade into with distance. */
  fogColor: Rgb;
  /**
   * How far one can see: beyond this many metres from the player's character nothing is
   * visible any more. The haze begins at a tenth of it.
   */
  fogFar: number;
  /** The colour of dust in the air under this daylight, which the storm wall has too. */
  dust: Rgb;
}

/**
 * In clear weather the haze only softens the far distance: it is complete beyond the zone's
 * far corner, so the edge of the terrain melts into the horizon instead of ending in a line.
 */
export const CLEAR_VISIBILITY = 1400;

/** Sand in the air, in full daylight. */
const DUST: Rgb = [0.72, 0.56, 0.36];
/** How much of the dust's colour is left in the dark of night; it is lit by what light there is. */
const DUST_NIGHT_SHARE = 0.1;
/** Luminance of the horizon by day, against which the time of day is judged. */
const DAY_HORIZON_LUMINANCE = 0.78;
/** How much of the sunlight and moonlight a storm at full strength takes away. */
const STORM_LIGHT_LOSS = 0.65;
/**
 * Dust scatters the light it blocks, so the light that reaches everything grows by this share
 * as the direct light goes. It keeps the ground from turning much darker than the air above it.
 */
const STORM_AMBIENT_GAIN = 0.35;
/**
 * In a storm after dark the light that reaches everything is raised to this. Dimming the
 * little light a night has left nothing to see at all, not even the player's own character;
 * the dust is taken to glow faintly with what light it scatters. It does not apply by day.
 */
const STORM_NIGHT_AMBIENT = 1.5;
/** Sunlight strength that counts as full day (the daylight table's daytime value). */
const FULL_DAYLIGHT = 2.6;
/** How far the light that reaches everything takes on the dust's colour. */
const STORM_AMBIENT_TINT = 0.7;

function mix(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

function mixColor(from: Rgb, to: Rgb, t: number): Rgb {
  return [mix(from[0], to[0], t), mix(from[1], to[1], t), mix(from[2], to[2], t)];
}

/** The dust's colour under this daylight: sand by day, redder at dusk, nearly black at night. */
export function dustColor(daylight: Daylight): Rgb {
  const light = Math.min(luminance(daylight.skyHorizon) / DAY_HORIZON_LUMINANCE, 1);
  // Falling off faster than the light itself: at night the dust is all but black.
  const share = Math.max(DUST_NIGHT_SHARE, light ** 1.5);
  // A little of the horizon's own colour, so a storm at dusk glows red rather than plain sand.
  const tinted = mixColor(DUST, daylight.skyHorizon, 0.25);
  return [tinted[0] * share, tinted[1] * share, tinted[2] * share];
}

/**
 * What the storm's coming does before it arrives, at the end of the warning: how strong a
 * storm the air already looks like. The light dims, the sky browns and the far distance
 * hazes over, most of it in the warning's second half.
 */
const APPROACH_STRENGTH = 0.3;

/** The storm strength the scene is drawn with: the storm itself, or what its approach amounts to. */
export function apparentStrength(intensity: number, approach: number): number {
  const near = Math.min(Math.max(approach, 0), 1);
  return Math.max(Math.min(Math.max(intensity, 0), 1), APPROACH_STRENGTH * near * near);
}

/** How far one can see at a storm strength of 0 to 1. */
export function visibilityAt(intensity: number): number {
  const strength = Math.min(Math.max(intensity, 0), 1);
  // Halving and halving again: the view closes in evenly to the eye, rather than nothing
  // seeming to happen until the last moment.
  return CLEAR_VISIBILITY * (STORM_VISIBILITY / CLEAR_VISIBILITY) ** strength;
}

/**
 * The scene's look under `daylight` in a storm of strength `intensity` (0 is clear weather).
 * `approach` is how near a storm still on its way has come (0 to 1).
 */
export function sceneLook(daylight: Daylight, intensity: number, approach = 0): SceneLook {
  const strength = apparentStrength(intensity, approach);
  const dust = dustColor(daylight);
  const visibility = visibilityAt(strength);
  // The sky fills with dust sooner than the view closes in: half strength already hides it.
  const sky = Math.min(strength * 2, 1);
  const light = 1 - STORM_LIGHT_LOSS * strength;
  // 1 once the sun is down, 0 in full daylight.
  const darkness = 1 - Math.min(daylight.sunIntensity / FULL_DAYLIGHT, 1);
  return {
    ...daylight,
    sunIntensity: daylight.sunIntensity * light,
    moonIntensity: daylight.moonIntensity * light,
    ambientColor: mixColor(daylight.ambientColor, DUST, STORM_AMBIENT_TINT * strength),
    ambientIntensity: Math.max(daylight.ambientIntensity * (1 + STORM_AMBIENT_GAIN * strength), STORM_NIGHT_AMBIENT * strength * darkness),
    skyTop: mixColor(daylight.skyTop, dust, sky),
    skyHorizon: mixColor(daylight.skyHorizon, dust, sky),
    fogColor: mixColor(daylight.skyHorizon, dust, sky),
    fogFar: visibility,
    dust,
  };
}
