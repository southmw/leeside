import { DAY_SECONDS, DAY_START_HOUR, DUSK_START_HOUR, NIGHT_END_HOUR, NIGHT_START_HOUR } from "../data/tuning";

/**
 * The game's clock, as plain numbers and pure functions: how far time has run, and what day,
 * hour and part of the day that makes. A day begins at the hour the player sets out, so the
 * day number goes up at dawn, not at midnight.
 */

const HOURS_PER_DAY = 24;
/** The clock on screen moves in steps of this many game minutes. One game minute is a third of a second, too fast to read. */
export const DISPLAY_STEP_MINUTES = 10;

export interface Clock {
  /** Seconds of game time since the start of day 1. Never negative. */
  elapsed: number;
  /** How many seconds of game time pass per second of play. 1 is normal; 0 stops the clock. */
  scale: number;
}

export type DayPhase = "day" | "dusk" | "night";

export interface ClockTime {
  /** 1 on the first day. */
  day: number;
  /** Hour of the day, 0 up to but not including 24, with fractions. */
  hour: number;
  phase: DayPhase;
}

/** A clock at the start of day 1, or `startHour` o'clock of that day if given. */
export function createClock(startHour: number = DAY_START_HOUR, scale = 1): Clock {
  const clock: Clock = { elapsed: 0, scale: Math.max(scale, 0) };
  setHour(clock, startHour);
  return clock;
}

/** Lets `dtSeconds` of play pass. */
export function advanceClock(clock: Clock, dtSeconds: number): void {
  clock.elapsed += Math.max(dtSeconds, 0) * clock.scale;
}

/** How far into its day the clock is, in hours since the day began (0 up to 24). */
function hoursIntoDay(clock: Clock): number {
  return ((clock.elapsed % DAY_SECONDS) / DAY_SECONDS) * HOURS_PER_DAY;
}

export function phaseAt(hour: number): DayPhase {
  if (hour >= NIGHT_START_HOUR || hour < NIGHT_END_HOUR) {
    return "night";
  }
  return hour >= DUSK_START_HOUR ? "dusk" : "day";
}

export function readClock(clock: Clock): ClockTime {
  const hour = (DAY_START_HOUR + hoursIntoDay(clock)) % HOURS_PER_DAY;
  return { day: Math.floor(clock.elapsed / DAY_SECONDS) + 1, hour, phase: phaseAt(hour) };
}

/**
 * Moves the clock to `hour` o'clock within the day it is in. Hours before the day's start
 * (such as 02:00 when days begin at 06:00) are the small hours at the end of that day.
 */
export function setHour(clock: Clock, hour: number): void {
  const wrapped = ((hour % HOURS_PER_DAY) + HOURS_PER_DAY) % HOURS_PER_DAY;
  const intoDay = (wrapped - DAY_START_HOUR + HOURS_PER_DAY) % HOURS_PER_DAY;
  const dayStart = Math.floor(clock.elapsed / DAY_SECONDS) * DAY_SECONDS;
  clock.elapsed = dayStart + (intoDay / HOURS_PER_DAY) * DAY_SECONDS;
}

/** Moves the clock to the start of the next day (the morning after a return to the shelter). */
export function startNextDay(clock: Clock): void {
  clock.elapsed = (Math.floor(clock.elapsed / DAY_SECONDS) + 1) * DAY_SECONDS;
}

/**
 * The hour a start condition such as `?time=18:30` names, or undefined if it is missing or
 * not a time of day. A bare hour ("18") is accepted too.
 */
export function parseTimeOfDay(text: string | null | undefined): number | undefined {
  const match = /^\s*(\d{1,2})(?::(\d{2}))?\s*$/.exec(text ?? "");
  if (!match) {
    return undefined;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2] ?? "0");
  return hours < HOURS_PER_DAY && minutes < 60 ? hours + minutes / 60 : undefined;
}

/** The hour as it is shown on screen: two digits each, minutes rounded down to the display step. */
export function displayTime(hour: number): { hours: string; minutes: string } {
  // An hour that is a hair short of a step (18:20 held as 18.333333) still shows that step.
  const totalMinutes = Math.floor(hour * 60 + 1e-6);
  const stepped = Math.floor(totalMinutes / DISPLAY_STEP_MINUTES) * DISPLAY_STEP_MINUTES;
  const hours = Math.floor(stepped / 60) % HOURS_PER_DAY;
  return { hours: String(hours).padStart(2, "0"), minutes: String(stepped % 60).padStart(2, "0") };
}
