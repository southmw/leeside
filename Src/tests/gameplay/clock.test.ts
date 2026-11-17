import { describe, expect, it } from "vitest";
import { DAY_SECONDS } from "../../src/data/tuning";
import {
  advanceClock,
  createClock,
  displayTime,
  parseTimeOfDay,
  phaseAt,
  readClock,
  setHour,
  startNextDay,
} from "../../src/gameplay/clock";

/** One game hour in real seconds: a day of 8 minutes has 24 of them. */
const HOUR = DAY_SECONDS / 24;

describe("clock", () => {
  it("starts on day 1 at 06:00", () => {
    const time = readClock(createClock());
    expect(time.day).toBe(1);
    expect(time.hour).toBeCloseTo(6);
    expect(time.phase).toBe("day");
  });

  it("runs one game hour in 20 seconds and a day in 8 minutes", () => {
    expect(HOUR).toBe(20);
    const clock = createClock();
    advanceClock(clock, 20);
    expect(readClock(clock).hour).toBeCloseTo(7);
    advanceClock(clock, 460 - 0.001);
    expect(readClock(clock).day).toBe(1);
    advanceClock(clock, 0.002);
    expect(readClock(clock).day).toBe(2);
    expect(readClock(clock).hour).toBeCloseTo(6, 3);
  });

  it("reaches dusk four minutes after setting out", () => {
    const clock = createClock();
    advanceClock(clock, 4 * 60);
    expect(readClock(clock).hour).toBeCloseTo(18);
    expect(readClock(clock).phase).toBe("dusk");
  });

  it("keeps the day number through midnight, until the next 06:00", () => {
    const clock = createClock();
    advanceClock(clock, 19 * HOUR);
    expect(readClock(clock).hour).toBeCloseTo(1);
    expect(readClock(clock).day).toBe(1);
    advanceClock(clock, 5 * HOUR);
    expect(readClock(clock).day).toBe(2);
  });

  it("runs faster, slower or not at all with its scale", () => {
    const fast = createClock(6, 30);
    advanceClock(fast, 1);
    expect(readClock(fast).hour).toBeCloseTo(7.5);
    const stopped = createClock(6, 0);
    advanceClock(stopped, 100);
    expect(readClock(stopped).hour).toBeCloseTo(6);
  });

  it("never runs backwards", () => {
    const clock = createClock();
    advanceClock(clock, -50);
    expect(clock.elapsed).toBe(0);
    expect(createClock(6, -3).scale).toBe(0);
  });
});

describe("phaseAt", () => {
  it("is day from 05:00 to 18:00, dusk until 19:00 and night until 05:00", () => {
    expect(phaseAt(5)).toBe("day");
    expect(phaseAt(12)).toBe("day");
    expect(phaseAt(17.99)).toBe("day");
    expect(phaseAt(18)).toBe("dusk");
    expect(phaseAt(18.99)).toBe("dusk");
    expect(phaseAt(19)).toBe("night");
    expect(phaseAt(0)).toBe("night");
    expect(phaseAt(4.99)).toBe("night");
  });
});

describe("setHour", () => {
  it("moves to an hour within the same day", () => {
    const clock = createClock();
    advanceClock(clock, DAY_SECONDS + 3 * HOUR); // Day 2, 09:00.
    setHour(clock, 18);
    expect(readClock(clock)).toMatchObject({ day: 2, phase: "dusk" });
    expect(readClock(clock).hour).toBeCloseTo(18);
  });

  it("treats the small hours as the end of the day, not its beginning", () => {
    const clock = createClock();
    setHour(clock, 2);
    expect(readClock(clock).day).toBe(1);
    expect(readClock(clock).hour).toBeCloseTo(2);
    expect(clock.elapsed).toBeCloseTo(20 * HOUR);
  });

  it("starts a clock at a given hour", () => {
    expect(readClock(createClock(18)).hour).toBeCloseTo(18);
    expect(readClock(createClock(18)).day).toBe(1);
  });
});

describe("startNextDay", () => {
  it("goes to 06:00 of the following day from any time", () => {
    const clock = createClock();
    advanceClock(clock, 13 * HOUR);
    startNextDay(clock);
    expect(readClock(clock).day).toBe(2);
    expect(readClock(clock).hour).toBeCloseTo(6);
    startNextDay(clock);
    expect(readClock(clock).day).toBe(3);
  });
});

describe("parseTimeOfDay", () => {
  it("reads hours and minutes", () => {
    expect(parseTimeOfDay("18:00")).toBe(18);
    expect(parseTimeOfDay("6:30")).toBe(6.5);
    expect(parseTimeOfDay("00:00")).toBe(0);
    expect(parseTimeOfDay("21")).toBe(21);
  });

  it("rejects what is not a time of day", () => {
    for (const text of ["24:00", "12:60", "noon", "", "-1", "7:5", null, undefined]) {
      expect(parseTimeOfDay(text)).toBeUndefined();
    }
  });
});

describe("displayTime", () => {
  it("shows two digits each and steps of ten minutes", () => {
    expect(displayTime(6)).toEqual({ hours: "06", minutes: "00" });
    expect(displayTime(7 + 40 / 60)).toEqual({ hours: "07", minutes: "40" });
    expect(displayTime(7 + 49 / 60)).toEqual({ hours: "07", minutes: "40" });
    expect(displayTime(23.99)).toEqual({ hours: "23", minutes: "50" });
    expect(displayTime(0)).toEqual({ hours: "00", minutes: "00" });
  });

  it("is not thrown off by an hour that is a hair short", () => {
    expect(displayTime(18 - 1e-9)).toEqual({ hours: "18", minutes: "00" });
    expect(displayTime(18 + 20 / 60)).toEqual({ hours: "18", minutes: "20" });
    const clock = createClock();
    for (const [hour, minutes] of [[18, 20], [7, 40], [23, 50], [0, 10]] as const) {
      setHour(clock, hour + minutes / 60);
      expect(displayTime(readClock(clock).hour)).toEqual({
        hours: String(hour).padStart(2, "0"),
        minutes: String(minutes),
      });
    }
  });
});
