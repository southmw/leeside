import { describe, expect, it } from "vitest";
import { benchWeather } from "../../src/bench/benchWeather";

describe("benchWeather", () => {
  it("is clear for the first half of the measurement", () => {
    expect(benchWeather(0, 60).phase).toBe("clear");
    expect(benchWeather(0.49, 60)).toMatchObject({ phase: "clear", intensity: 0, approach: 0 });
  });

  it("then announces a storm, lets it rage and die down, in that order", () => {
    const phases = Array.from({ length: 101 }, (_, index) => benchWeather(index / 100, 60).phase);
    const order = phases.filter((phase, index) => phase !== phases[index - 1]);
    expect(order).toEqual(["clear", "warning", "storm", "fading"]);
  });

  it("spends a good part of the measurement in a storm at full strength", () => {
    const full = Array.from({ length: 1000 }, (_, index) => benchWeather(index / 1000, 60)).filter((reading) => reading.intensity === 1);
    expect(full.length / 1000).toBeGreaterThan(0.2);
  });

  it("brings the storm nearer through the warning and ends at nothing", () => {
    expect(benchWeather(0.5, 60).approach).toBe(0);
    expect(benchWeather(0.56, 60).approach).toBeCloseTo(0.5);
    expect(benchWeather(1, 60).intensity).toBeCloseTo(0);
  });

  it("tells the seconds of each phase for the measurement's length", () => {
    const warning = benchWeather(0.5, 60);
    expect(warning.phaseSeconds).toBeCloseTo(7.2);
    expect(warning.secondsLeft).toBeCloseTo(7.2);
    expect(benchWeather(0.5, 10).phaseSeconds).toBeCloseTo(1.2);
  });

  it("never jumps in strength", () => {
    let previous = 0;
    for (let step = 0; step <= 6000; step += 1) {
      const now = benchWeather(step / 6000, 60).intensity;
      expect(Math.abs(now - previous)).toBeLessThan(0.02);
      previous = now;
    }
  });

  it("copes with progress outside 0 to 1", () => {
    expect(benchWeather(-1, 60).phase).toBe("clear");
    expect(benchWeather(2, 60).phase).toBe("fading");
  });
});
