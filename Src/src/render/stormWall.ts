import type { WeatherReading } from "../gameplay/weather";

/**
 * The wall of dust that announces a storm, as plain numbers: where it stands and how solid
 * it looks. It comes from the south, reaches the player as the warning ends, and passes on
 * north while the storm closes in around the player. No Three.js here.
 */

export interface StormWall {
  /**
   * How far south of the player the wall's face stands, in metres. Negative once it has
   * passed: the wall is then that far to the north, and the player is inside the storm.
   */
  distance: number;
  /** How solid the wall looks, 0 (not there) to 1. */
  opacity: number;
}

/**
 * Where the wall is when the warning begins, and how high it stands, in metres. Far enough
 * that it starts as a low band on the horizon (under 5 degrees) and towers only in the last
 * seconds: its size on screen is how the player reads the time left.
 */
export const WALL_START_DISTANCE = 2500;
export const WALL_HEIGHT = 200;
/**
 * How near the wall's face has come when the warning ends. It covers the rest as the storm
 * breaks. Between the start and this it closes in by the same share each second, not the
 * same distance: at a steady speed it would sit on the horizon for most of the warning and
 * then fill the sky all at once, and nobody would see it coming.
 */
export const WALL_ARRIVAL_DISTANCE = 25;
/**
 * Bends the closing-in so the wall is about 500 m off at half time. Closing in by exactly the
 * same share each second had it filling the sky by half time, with nothing left to watch.
 */
const CLOSING_CURVE = 1.5;
/** The wall takes shape over this share of the warning instead of popping up. */
const APPEAR_SHARE = 0.1;
/** Once past the player the wall moves on north at this speed, in m/s, while it thins out. */
const PASSING_SPEED = 60;

const NONE: StormWall = { distance: WALL_START_DISTANCE, opacity: 0 };

export function stormWallAt(weather: WeatherReading): StormWall {
  if (weather.phase === "warning") {
    return {
      // Its height on screen grows all through the warning, which is how the time left is read.
      distance: WALL_START_DISTANCE * (WALL_ARRIVAL_DISTANCE / WALL_START_DISTANCE) ** (weather.approach ** CLOSING_CURVE),
      opacity: Math.min(weather.approach / APPEAR_SHARE, 1),
    };
  }
  if (weather.phase === "storm") {
    const sinceArrival = weather.phaseSeconds - weather.secondsLeft;
    // The dust in the air takes over from the wall as the storm reaches full strength.
    return { distance: WALL_ARRIVAL_DISTANCE - PASSING_SPEED * sinceArrival, opacity: 1 - weather.intensity };
  }
  return NONE;
}
