import type { WeatherReading } from "../gameplay/weather";

/**
 * The weather during a performance measurement. The game's clock stands still then, so the
 * weather is tied to how far the measurement has got instead: clear for the first half, then
 * a storm announced, raging and dying down. Every run sees the same weather at the same
 * place on the route, and the result covers both clear weather and a storm.
 */

/** Shares of the measurement at which each phase begins. */
const WARNING_FROM = 0.5;
const STORM_FROM = 0.62;
const FADING_FROM = 0.92;
/** The storm reaches full strength over this share of the measurement. */
const RISE_SHARE = 0.05;

const CLEAR: WeatherReading = {
  phase: "clear",
  intensity: 0,
  approach: 0,
  secondsLeft: Number.POSITIVE_INFINITY,
  phaseSeconds: Number.POSITIVE_INFINITY,
};

/** The weather at `progress` (0 to 1) of a measurement lasting `seconds`. */
export function benchWeather(progress: number, seconds: number): WeatherReading {
  const at = Math.min(Math.max(progress, 0), 1);
  const phase = (from: number, to: number): { phaseSeconds: number; secondsLeft: number; done: number } => ({
    phaseSeconds: (to - from) * seconds,
    secondsLeft: (to - at) * seconds,
    done: (at - from) / (to - from),
  });
  if (at < WARNING_FROM) {
    return CLEAR;
  }
  if (at < STORM_FROM) {
    const { phaseSeconds, secondsLeft, done } = phase(WARNING_FROM, STORM_FROM);
    return { phase: "warning", intensity: 0, approach: done, secondsLeft, phaseSeconds };
  }
  if (at < FADING_FROM) {
    const { phaseSeconds, secondsLeft } = phase(STORM_FROM, FADING_FROM);
    return { phase: "storm", intensity: Math.min((at - STORM_FROM) / RISE_SHARE, 1), approach: 1, secondsLeft, phaseSeconds };
  }
  const { phaseSeconds, secondsLeft, done } = phase(FADING_FROM, 1);
  return { phase: "fading", intensity: 1 - done, approach: 1 - done, secondsLeft, phaseSeconds };
}
