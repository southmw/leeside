import { describe, expect, it } from "vitest";
import { canPause, CONTROLS, shouldPauseOnLeave, simulationRuns } from "../../src/app/pause";
import { advanceClock, createClock } from "../../src/gameplay/clock";
import { MESSAGES } from "../../src/locales/i18n";

const inPlay = { playing: true, windowOpen: false, travelling: false, paused: false };

describe("canPause", () => {
  it("is true in play with nothing open", () => {
    expect(canPause(inPlay)).toBe(true);
  });

  it("is false behind the title, with a window open, on the way between zones, and when paused already", () => {
    expect(canPause({ ...inPlay, playing: false })).toBe(false);
    expect(canPause({ ...inPlay, windowOpen: true })).toBe(false);
    expect(canPause({ ...inPlay, travelling: true })).toBe(false);
    expect(canPause({ ...inPlay, paused: true })).toBe(false);
  });
});

describe("shouldPauseOnLeave", () => {
  const leaving = { playing: true, centreWindowOpen: false, travelling: false, paused: false };

  it("pauses a game in play when the page is left, also with the bag open at the side", () => {
    expect(shouldPauseOnLeave(leaving)).toBe(true);
  });

  it("leaves alone a game that is not in play, one already paused, and one waiting on a window in the middle", () => {
    expect(shouldPauseOnLeave({ ...leaving, playing: false })).toBe(false);
    expect(shouldPauseOnLeave({ ...leaving, paused: true })).toBe(false);
    expect(shouldPauseOnLeave({ ...leaving, centreWindowOpen: true })).toBe(false);
    expect(shouldPauseOnLeave({ ...leaving, travelling: true })).toBe(false);
  });
});

describe("a paused game", () => {
  it("does not let game time pass", () => {
    const clock = createClock();
    const step = (paused: boolean): void => {
      if (simulationRuns(paused)) {
        advanceClock(clock, 1 / 60);
      }
    };
    for (let tick = 0; tick < 120; tick += 1) {
      step(false);
    }
    const before = clock.elapsed;
    expect(before).toBeCloseTo(2);
    for (let tick = 0; tick < 600; tick += 1) {
      step(true);
    }
    expect(clock.elapsed).toBe(before);
    step(false);
    expect(clock.elapsed).toBeGreaterThan(before);
  });
});

describe("the controls screen", () => {
  it("has a text for every action it lists, and for the keys that are not letters", () => {
    for (const { action, keys } of CONTROLS) {
      expect(MESSAGES.en).toHaveProperty([action]);
      for (const key of keys) {
        if (key.startsWith("controls.")) {
          expect(MESSAGES.en).toHaveProperty([key]);
        }
      }
    }
  });
});
