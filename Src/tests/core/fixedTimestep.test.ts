import { describe, expect, it } from "vitest";
import { FixedTimestep, MAX_FRAME_SECONDS, TICK_SECONDS } from "../../src/core/fixedTimestep";

describe("FixedTimestep", () => {
  it("runs one step for one tick of time", () => {
    const step = new FixedTimestep();
    const result = step.advance(TICK_SECONDS);
    expect(result.ticks).toBe(1);
    expect(result.alpha).toBeCloseTo(0);
  });

  it("carries leftover time into the next frame", () => {
    const step = new FixedTimestep();
    const first = step.advance(TICK_SECONDS / 2);
    expect(first.ticks).toBe(0);
    expect(first.alpha).toBeCloseTo(0.5);

    const second = step.advance(TICK_SECONDS / 2);
    expect(second.ticks).toBe(1);
    expect(second.alpha).toBeCloseTo(0);
  });

  it("runs several steps for a slow frame", () => {
    const step = new FixedTimestep();
    expect(step.advance(0.1).ticks).toBe(6);
  });

  it("drops time beyond the frame cap instead of replaying it", () => {
    const step = new FixedTimestep();
    const result = step.advance(5);
    expect(result.ticks).toBe(Math.round(MAX_FRAME_SECONDS / TICK_SECONDS));
  });

  it("ignores negative and invalid frame times", () => {
    const step = new FixedTimestep();
    expect(step.advance(-1).ticks).toBe(0);
    expect(step.advance(Number.NaN).ticks).toBe(0);
    expect(step.advance(Number.POSITIVE_INFINITY).ticks).toBe(0);
  });

  it("yields exactly 60 steps for 60 frames at 60 Hz", () => {
    const step = new FixedTimestep();
    let ticks = 0;
    for (let i = 0; i < 60; i += 1) {
      ticks += step.advance(1 / 60).ticks;
    }
    expect(ticks).toBe(60);
  });

  it("advances the same amount whatever the frame rate", () => {
    const totalSeconds = 2;
    for (const fps of [30, 60, 75, 144, 240]) {
      const step = new FixedTimestep();
      let ticks = 0;
      const frames = Math.round(totalSeconds * fps);
      for (let i = 0; i < frames; i += 1) {
        ticks += step.advance(1 / fps).ticks;
      }
      expect(Math.abs(ticks - totalSeconds / TICK_SECONDS)).toBeLessThanOrEqual(1);
    }
  });

  it("keeps alpha within 0 (inclusive) and 1 (exclusive)", () => {
    const step = new FixedTimestep();
    for (const frame of [0.001, 0.007, 0.0166, 0.02, 0.033, 0.1]) {
      const { alpha } = step.advance(frame);
      expect(alpha).toBeGreaterThanOrEqual(0);
      expect(alpha).toBeLessThan(1);
    }
  });

  it("forgets leftover time on reset", () => {
    const step = new FixedTimestep();
    step.advance(TICK_SECONDS * 0.9);
    step.reset();
    expect(step.advance(TICK_SECONDS * 0.5).ticks).toBe(0);
  });

  it("rejects a non-positive tick length", () => {
    expect(() => new FixedTimestep(0)).toThrow(RangeError);
  });
});
