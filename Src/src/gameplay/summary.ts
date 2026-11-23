/**
 * The summary of a game for the end screen (UI design 12): how long it took, how many days
 * the player lasted, and how often they died.
 */

export interface PlaySummary {
  /** Time played as minutes and seconds, for showing as "12:40"; the seconds have two digits. */
  minutes: string;
  seconds: string;
  days: number;
  deaths: number;
}

/**
 * `playSeconds` is real time in play (not paused, not behind the title); `day` the day the
 * game has reached, counted from 1.
 */
export function playSummary(playSeconds: number, day: number, deaths: number): PlaySummary {
  const whole = Math.max(Math.floor(Number.isFinite(playSeconds) ? playSeconds : 0), 0);
  return {
    minutes: String(Math.floor(whole / 60)),
    seconds: String(whole % 60).padStart(2, "0"),
    days: Math.max(Math.floor(day), 1),
    deaths: Math.max(Math.floor(deaths), 0),
  };
}
