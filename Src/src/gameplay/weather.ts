import { createRandom } from "../core/random";
import {
  DAY_SECONDS,
  INTRO_STORM_SECONDS,
  INTRO_STORM_WARNING_SECONDS,
  STORM_FADE_SECONDS,
  STORM_RISE_SECONDS,
  STORM_SECONDS_MAX,
  STORM_SECONDS_MIN,
  STORM_WARNING_SECONDS,
  STORM_WARNING_START_MAX,
  STORM_WARNING_START_MIN,
} from "../data/tuning";

/**
 * The weather, as plain numbers and pure functions of the game clock: one sandstorm a day,
 * announced, arriving, and dying down. When it comes is fixed by a seed and the day, so the
 * same seed gives the same weather on every machine.
 */

export type WeatherPhase = "clear" | "warning" | "storm" | "fading";

/** One storm, in seconds of game time since the start of day 1 (the clock's `elapsed`). */
export interface Storm {
  /** When the warning begins. */
  start: number;
  warningSeconds: number;
  stormSeconds: number;
  fadeSeconds: number;
}

export interface Weather {
  /** Decides each day's storm. */
  seed: number;
  /** A storm called by hand (the introduction, development tools); it replaces the day's own while it lasts. */
  called?: Storm;
  /** A day (1 is the first) whose own storm does not come, or undefined. */
  calmDay?: number;
}

export interface WeatherReading {
  phase: WeatherPhase;
  /** How strong the storm is right now, 0 to 1. Damage, visibility and sound follow this. 0 until it arrives. */
  intensity: number;
  /** How near the storm has come during the warning, 0 to 1; 1 while it rages, falling back to 0 as it dies down. */
  approach: number;
  /** Seconds of game time until the next phase. Infinite in clear weather with no storm ahead today. */
  secondsLeft: number;
  /** How long the current phase lasts in all, in seconds. Infinite in clear weather. */
  phaseSeconds: number;
}

export function createWeather(seed: number): Weather {
  return { seed: seed >>> 0 };
}

/** The storm of a day (1 is the first), the same every time for the same seed. */
export function stormOfDay(seed: number, day: number): Storm {
  // Mixing the day into the seed gives each day its own, unrelated, numbers.
  const random = createRandom((seed ^ Math.imul(day, 0x9e3779b1)) >>> 0);
  const dayStart = (day - 1) * DAY_SECONDS;
  return {
    start: dayStart + random.range(STORM_WARNING_START_MIN, STORM_WARNING_START_MAX),
    warningSeconds: STORM_WARNING_SECONDS,
    stormSeconds: random.range(STORM_SECONDS_MIN, STORM_SECONDS_MAX),
    fadeSeconds: STORM_FADE_SECONDS,
  };
}

/** The introduction's storm, announced at `now`: a long warning and a short storm. */
export function introStorm(now: number): Storm {
  return {
    start: now,
    warningSeconds: INTRO_STORM_WARNING_SECONDS,
    stormSeconds: INTRO_STORM_SECONDS,
    fadeSeconds: STORM_FADE_SECONDS,
  };
}

/** When a storm is over, in the clock's seconds. */
export function stormEnd(storm: Storm): number {
  return storm.start + storm.warningSeconds + storm.stormSeconds + storm.fadeSeconds;
}

const CLEAR: WeatherReading = {
  phase: "clear",
  intensity: 0,
  approach: 0,
  secondsLeft: Number.POSITIVE_INFINITY,
  phaseSeconds: Number.POSITIVE_INFINITY,
};

/** Smooth start and stop between 0 and 1, so nothing switches on or off abruptly. */
function ease(t: number): number {
  const clamped = Math.min(Math.max(t, 0), 1);
  return clamped * clamped * (3 - 2 * clamped);
}

/** What a storm is doing at `elapsed`, or undefined outside it. */
function readStorm(storm: Storm, elapsed: number): WeatherReading | undefined {
  const since = elapsed - storm.start;
  if (since < 0) {
    return undefined;
  }
  if (since < storm.warningSeconds) {
    return {
      phase: "warning",
      intensity: 0,
      approach: since / storm.warningSeconds,
      secondsLeft: storm.warningSeconds - since,
      phaseSeconds: storm.warningSeconds,
    };
  }
  const raging = since - storm.warningSeconds;
  if (raging < storm.stormSeconds) {
    return {
      phase: "storm",
      intensity: ease(raging / STORM_RISE_SECONDS),
      approach: 1,
      secondsLeft: storm.stormSeconds - raging,
      phaseSeconds: storm.stormSeconds,
    };
  }
  const fading = raging - storm.stormSeconds;
  if (fading < storm.fadeSeconds) {
    const left = 1 - ease(fading / storm.fadeSeconds);
    return { phase: "fading", intensity: left, approach: left, secondsLeft: storm.fadeSeconds - fading, phaseSeconds: storm.fadeSeconds };
  }
  return undefined;
}

/** The weather at `elapsed` seconds of game time (the clock's `elapsed`). */
export function readWeather(weather: Weather, elapsed: number): WeatherReading {
  const called = weather.called ? readStorm(weather.called, elapsed) : undefined;
  if (called) {
    return called;
  }
  const day = Math.floor(Math.max(elapsed, 0) / DAY_SECONDS) + 1;
  if (day === weather.calmDay) {
    return CLEAR;
  }
  const storm = stormOfDay(weather.seed, day);
  const own = readStorm(storm, elapsed);
  if (own) {
    return own;
  }
  // Clear: counting down to today's storm if it is still to come.
  return elapsed < storm.start ? { ...CLEAR, secondsLeft: storm.start - elapsed } : CLEAR;
}

/**
 * Calls a storm now. With `warning` it is announced first, as a day's own storm is;
 * without, it arrives at once. `like` gives the lengths (a day's storm, the introduction's).
 */
export function callStorm(weather: Weather, now: number, like: Storm, warning = true): void {
  weather.called = { ...like, start: now, warningSeconds: warning ? like.warningSeconds : 0 };
}

/** Ends any storm at once and keeps the rest of the day `now` falls in clear. */
export function calmWeather(weather: Weather, now: number): void {
  delete weather.called;
  weather.calmDay = Math.floor(Math.max(now, 0) / DAY_SECONDS) + 1;
}
