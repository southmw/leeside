/**
 * What the sky and the light look like at each hour of the day, as plain numbers: no
 * Three.js here, so it can be tested without a browser. render/sky.ts turns it into lights
 * and a sky.
 *
 * The look is set at a handful of hours (the table below) and blended in between. Colours
 * are 0xRRGGBB as they appear on screen.
 */

export type Rgb = readonly [number, number, number];

export interface Daylight {
  /** Unit vector pointing from the ground towards the sun. Below the horizon (y < 0) at night. */
  sunDirection: readonly [number, number, number];
  /** Degrees above the horizon; negative at night. */
  sunElevation: number;
  /** Colour and strength of the sunlight. The strength is 0 while the sun is down. */
  sunColor: Rgb;
  sunIntensity: number;
  /** Strength of the moonlight, which comes from a fixed direction and keeps the night readable. */
  moonIntensity: number;
  /** Light that reaches everything, whichever way it faces. */
  ambientColor: Rgb;
  ambientIntensity: number;
  /** The sky straight up and at the horizon. */
  skyTop: Rgb;
  skyHorizon: Rgb;
}

/** The sun rises and sets at these hours and stands highest halfway between. */
export const SUNRISE_HOUR = 5.25;
export const SUNSET_HOUR = 18.75;
/** How high the sun stands at midday, in degrees. */
const MAX_SUN_ELEVATION = 62;
/** The sunlight is at full strength from this many degrees above the horizon. */
const SUN_FADE_DEGREES = 5;
/** How far towards the south (+Z) the sun's path leans; 0 would take it straight overhead. */
const SOUTH_LEAN = 0.6;

export const MOON_COLOR = 0x9fb6e0;
/** Where the moonlight comes from: high in the south-east, so slopes still show at night. */
export const MOON_DIRECTION: readonly [number, number, number] = [0.45, 0.8, 0.4];

interface Key {
  hour: number;
  sunColor: number;
  sunIntensity: number;
  moonIntensity: number;
  ambientColor: number;
  ambientIntensity: number;
  skyTop: number;
  skyHorizon: number;
}

/** Moonlight at its strongest, deep in the night. */
const NIGHT_MOON_INTENSITY = 0.24;

const NIGHT = {
  sunColor: 0xff5a30,
  sunIntensity: 0,
  // Lowered twice after seeing it (from 0.55 and 0.5): the night should feel dark, with
  // shapes still readable.
  moonIntensity: NIGHT_MOON_INTENSITY,
  ambientColor: 0x5a6b8c,
  ambientIntensity: 0.22,
  skyTop: 0x0b1220,
  skyHorizon: 0x1c2a3f,
};
// A dusty sky over a dry plain: pale blue above, haze the colour of sand at the horizon.
const DAY = {
  sunColor: 0xfff2d6,
  sunIntensity: 2.6,
  moonIntensity: 0,
  ambientColor: 0xffffff,
  ambientIntensity: 0.45,
  skyTop: 0x7fa3c4,
  skyHorizon: 0xd9c9a8,
};

/** In order of hour. The first and last are the same night, so midnight blends like any other time. */
const KEYS: readonly Key[] = [
  { hour: 0, ...NIGHT },
  { hour: 4.5, ...NIGHT },
  // First light: the horizon warms before the sun is up.
  { hour: 5.25, sunColor: 0xff9a60, sunIntensity: 0.5, moonIntensity: 0.15, ambientColor: 0x8a8090, ambientIntensity: 0.48, skyTop: 0x3b4a6b, skyHorizon: 0xd98a5a },
  // Setting out at 06:00 is in this warm early light.
  { hour: 6, sunColor: 0xffd9a8, sunIntensity: 2.0, moonIntensity: 0, ambientColor: 0xd9cdc0, ambientIntensity: 0.46, skyTop: 0x6f9fd0, skyHorizon: 0xf0c9a0 },
  { hour: 8.5, ...DAY },
  { hour: 16.5, ...DAY },
  // Dusk (18:00): the sky reddens. The reddest moment is just before the sun is gone.
  { hour: 18, sunColor: 0xff9a50, sunIntensity: 1.8, moonIntensity: 0, ambientColor: 0xc9a090, ambientIntensity: 0.45, skyTop: 0x6a6f9a, skyHorizon: 0xff8a4a },
  { hour: 18.75, sunColor: 0xff5a30, sunIntensity: 0.6, moonIntensity: 0.1, ambientColor: 0x8a6a78, ambientIntensity: 0.44, skyTop: 0x3a3a66, skyHorizon: 0xe0503a },
  // Night falls at 19:00; the last glow is gone half an hour later.
  { hour: 19.5, ...NIGHT, skyHorizon: 0x3a3350 },
  { hour: 20.5, ...NIGHT },
  { hour: 24, ...NIGHT },
];

function toRgb(hex: number): Rgb {
  return [((hex >> 16) & 0xff) / 255, ((hex >> 8) & 0xff) / 255, (hex & 0xff) / 255];
}

function mix(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

function mixColor(from: number, to: number, t: number): Rgb {
  const a = toRgb(from);
  const b = toRgb(to);
  return [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
}

/** Where the sun is at `hour`: it rises in the east (+X), leans south (+Z) and sets in the west (-X). */
function sunAt(hour: number): { direction: readonly [number, number, number]; elevation: number } {
  // 0 at sunrise, 1 at sunset; beyond those the same curve carries the sun under the horizon.
  const along = (hour - SUNRISE_HOUR) / (SUNSET_HOUR - SUNRISE_HOUR);
  const elevation = MAX_SUN_ELEVATION * Math.sin(Math.PI * along);
  const radians = (elevation * Math.PI) / 180;
  const east = Math.cos(Math.PI * along);
  const south = Math.sin(Math.PI * along) * SOUTH_LEAN;
  const flat = Math.hypot(east, south) || 1;
  const level = Math.cos(radians);
  return { direction: [(east / flat) * level, Math.sin(radians), (south / flat) * level], elevation };
}

/** The sky and light at `hour` (0 up to 24, with fractions; other values wrap round). */
export function daylightAt(hour: number): Daylight {
  const wrapped = ((hour % 24) + 24) % 24;
  let next = KEYS.findIndex((key) => key.hour > wrapped);
  if (next <= 0) {
    next = KEYS.length - 1;
  }
  const from = KEYS[next - 1] as Key;
  const to = KEYS[next] as Key;
  const t = to.hour > from.hour ? (wrapped - from.hour) / (to.hour - from.hour) : 0;
  const sun = sunAt(wrapped);
  return {
    sunDirection: sun.direction,
    sunElevation: sun.elevation,
    sunColor: mixColor(from.sunColor, to.sunColor, t),
    // The sunlight fades out over the last few degrees above the horizon, so it neither
    // shines from under the ground nor switches off in one step.
    sunIntensity: mix(from.sunIntensity, to.sunIntensity, t) * Math.min(Math.max(sun.elevation / SUN_FADE_DEGREES, 0), 1),
    moonIntensity: mix(from.moonIntensity, to.moonIntensity, t),
    ambientColor: mixColor(from.ambientColor, to.ambientColor, t),
    ambientIntensity: mix(from.ambientIntensity, to.ambientIntensity, t),
    skyTop: mixColor(from.skyTop, to.skyTop, t),
    skyHorizon: mixColor(from.skyHorizon, to.skyHorizon, t),
  };
}

/** How bright a colour looks, 0 to 1. */
export function luminance(color: Rgb): number {
  return 0.2126 * color[0] + 0.7152 * color[1] + 0.0722 * color[2];
}
