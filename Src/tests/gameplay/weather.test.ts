import { describe, expect, it } from "vitest";
import {
  DAY_SECONDS,
  STORM_FADE_SECONDS,
  STORM_RISE_SECONDS,
  STORM_SECONDS_MAX,
  STORM_SECONDS_MIN,
  STORM_WARNING_SECONDS,
  STORM_WARNING_START_MAX,
  STORM_WARNING_START_MIN,
} from "../../src/data/tuning";
import {
  callStorm,
  calmWeather,
  createWeather,
  introStorm,
  readWeather,
  stormEnd,
  stormOfDay,
} from "../../src/gameplay/weather";

const SEED = 20261117;

describe("stormOfDay", () => {
  it("announces the storm 90 to 180 seconds after setting out, every day", () => {
    for (let day = 1; day <= 300; day += 1) {
      const storm = stormOfDay(SEED, day);
      const sinceDawn = storm.start - (day - 1) * DAY_SECONDS;
      expect(sinceDawn).toBeGreaterThanOrEqual(STORM_WARNING_START_MIN);
      expect(sinceDawn).toBeLessThan(STORM_WARNING_START_MAX);
      expect(storm.stormSeconds).toBeGreaterThanOrEqual(STORM_SECONDS_MIN);
      expect(storm.stormSeconds).toBeLessThan(STORM_SECONDS_MAX);
      expect(storm.warningSeconds).toBe(STORM_WARNING_SECONDS);
      // Over well before the next day begins.
      expect(stormEnd(storm)).toBeLessThan(day * DAY_SECONDS);
    }
  });

  it("is the same for the same seed and day", () => {
    expect(stormOfDay(SEED, 3)).toEqual(stormOfDay(SEED, 3));
  });

  it("differs from day to day and from seed to seed", () => {
    const starts = new Set(Array.from({ length: 20 }, (_, index) => Math.round(stormOfDay(SEED, index + 1).start % DAY_SECONDS)));
    expect(starts.size).toBeGreaterThan(10);
    expect(stormOfDay(SEED, 1).start).not.toBe(stormOfDay(SEED + 1, 1).start);
  });

  it("spreads the starts over the whole range", () => {
    const sinceDawn = Array.from({ length: 300 }, (_, index) => stormOfDay(SEED, index + 1).start - index * DAY_SECONDS);
    expect(Math.min(...sinceDawn)).toBeLessThan(STORM_WARNING_START_MIN + 10);
    expect(Math.max(...sinceDawn)).toBeGreaterThan(STORM_WARNING_START_MAX - 10);
  });
});

describe("readWeather", () => {
  const weather = createWeather(SEED);
  const storm = stormOfDay(SEED, 1);
  const arrives = storm.start + storm.warningSeconds;
  const fades = arrives + storm.stormSeconds;

  it("is clear until the warning, counting down to it", () => {
    const morning = readWeather(weather, 10);
    expect(morning).toMatchObject({ phase: "clear", intensity: 0, approach: 0 });
    expect(morning.secondsLeft).toBeCloseTo(storm.start - 10);
  });

  it("goes through warning, storm and fading, each for its length", () => {
    expect(readWeather(weather, storm.start - 0.01).phase).toBe("clear");
    expect(readWeather(weather, storm.start).phase).toBe("warning");
    expect(readWeather(weather, arrives - 0.01).phase).toBe("warning");
    expect(readWeather(weather, arrives).phase).toBe("storm");
    expect(readWeather(weather, fades - 0.01).phase).toBe("storm");
    expect(readWeather(weather, fades).phase).toBe("fading");
    expect(readWeather(weather, fades + STORM_FADE_SECONDS - 0.01).phase).toBe("fading");
    expect(readWeather(weather, fades + STORM_FADE_SECONDS).phase).toBe("clear");
  });

  it("says how long the phase lasts and how much of it is left", () => {
    const warning = readWeather(weather, storm.start + 12);
    expect(warning.phaseSeconds).toBe(STORM_WARNING_SECONDS);
    expect(warning.secondsLeft).toBeCloseTo(STORM_WARNING_SECONDS - 12);
    expect(readWeather(weather, arrives + 5).secondsLeft).toBeCloseTo(storm.stormSeconds - 5);
  });

  it("brings the storm nearer through the warning without it being felt yet", () => {
    expect(readWeather(weather, storm.start).approach).toBe(0);
    expect(readWeather(weather, storm.start + 15).approach).toBeCloseTo(0.5);
    expect(readWeather(weather, arrives - 0.01).approach).toBeGreaterThan(0.99);
    expect(readWeather(weather, storm.start + 15).intensity).toBe(0);
  });

  it("rises to full strength in the first seconds of the storm and stays there", () => {
    expect(readWeather(weather, arrives).intensity).toBe(0);
    const rising = readWeather(weather, arrives + STORM_RISE_SECONDS / 2).intensity;
    expect(rising).toBeGreaterThan(0.3);
    expect(rising).toBeLessThan(0.7);
    expect(readWeather(weather, arrives + STORM_RISE_SECONDS).intensity).toBe(1);
    expect(readWeather(weather, fades - 1)).toMatchObject({ intensity: 1, approach: 1 });
  });

  it("dies down smoothly to nothing", () => {
    expect(readWeather(weather, fades).intensity).toBe(1);
    const half = readWeather(weather, fades + STORM_FADE_SECONDS / 2);
    expect(half.intensity).toBeCloseTo(0.5);
    expect(half.approach).toBeCloseTo(0.5);
    expect(readWeather(weather, fades + STORM_FADE_SECONDS - 0.01).intensity).toBeLessThan(0.01);
  });

  it("never jumps in strength from one tick to the next", () => {
    let previous = readWeather(weather, storm.start - 1).intensity;
    for (let time = storm.start - 1; time < stormEnd(storm) + 1; time += 1 / 60) {
      const now = readWeather(weather, time).intensity;
      expect(Math.abs(now - previous)).toBeLessThan(0.02);
      previous = now;
    }
  });

  it("is clear for the rest of the day and storms again the next", () => {
    const afternoon = readWeather(weather, stormEnd(storm) + 30);
    expect(afternoon.phase).toBe("clear");
    expect(afternoon.secondsLeft).toBe(Number.POSITIVE_INFINITY);
    const tomorrow = stormOfDay(SEED, 2);
    expect(readWeather(weather, tomorrow.start + 1).phase).toBe("warning");
  });
});

describe("storms called by hand", () => {
  it("announces a called storm first", () => {
    const weather = createWeather(SEED);
    callStorm(weather, 5, stormOfDay(SEED, 1));
    expect(readWeather(weather, 5).phase).toBe("warning");
    expect(readWeather(weather, 5 + STORM_WARNING_SECONDS).phase).toBe("storm");
  });

  it("or lets it arrive at once", () => {
    const weather = createWeather(SEED);
    callStorm(weather, 5, stormOfDay(SEED, 1), false);
    expect(readWeather(weather, 5).phase).toBe("storm");
    expect(readWeather(weather, 5 + STORM_RISE_SECONDS).intensity).toBe(1);
  });

  it("has the introduction's long warning and short storm", () => {
    const weather = createWeather(SEED);
    callStorm(weather, 0, introStorm(0));
    expect(readWeather(weather, 0)).toMatchObject({ phase: "warning", phaseSeconds: 75 });
    expect(readWeather(weather, 74.9).phase).toBe("warning");
    expect(readWeather(weather, 75)).toMatchObject({ phase: "storm", phaseSeconds: 40 });
    expect(readWeather(weather, 115).phase).toBe("fading");
    // Over by 130 s. By then the day's own storm may already be announced, but it is not raging.
    expect(["clear", "warning"]).toContain(readWeather(weather, 130).phase);
  });

  it("goes back to the day's own weather when the called storm is over", () => {
    const weather = createWeather(SEED);
    callStorm(weather, 0, introStorm(0));
    const own = stormOfDay(SEED, 1);
    // The introduction's storm ends at 130 s; the day's own is announced at 90 to 180 s.
    const later = Math.max(own.start, 130) + 1;
    expect(readWeather(weather, later).phase).toBe("warning");
  });

  it("can be made calm: the storm stops and does not come back that day", () => {
    const weather = createWeather(SEED);
    const own = stormOfDay(SEED, 1);
    callStorm(weather, 5, own, false);
    calmWeather(weather, 10);
    expect(readWeather(weather, 10).phase).toBe("clear");
    expect(readWeather(weather, own.start + 40).phase).toBe("clear");
    expect(readWeather(weather, stormOfDay(SEED, 2).start + 1).phase).toBe("warning");
  });
});
