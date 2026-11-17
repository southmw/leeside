import { describe, expect, it } from "vitest";
import { OPEN_CUTOFF_HZ, windMix, windStrength } from "../../src/audio/windMix";
import {
  WIND_APPROACH_STRENGTH,
  WIND_CALM_VOLUME,
  WIND_INDOOR_CUTOFF_HZ,
  WIND_INDOOR_VOLUME,
  WIND_STORM_RATE,
  WIND_STORM_VOLUME,
} from "../../src/data/tuning";
import { createWeather, readWeather, stormEnd, stormOfDay } from "../../src/gameplay/weather";

describe("windStrength", () => {
  it("is nothing in clear weather and everything in a full storm", () => {
    expect(windStrength(0, 0)).toBe(0);
    expect(windStrength(1, 1)).toBe(1);
  });

  it("grows evenly as a storm comes nearer", () => {
    expect(windStrength(0, 0.5)).toBeCloseTo(WIND_APPROACH_STRENGTH / 2);
    expect(windStrength(0, 1)).toBeCloseTo(WIND_APPROACH_STRENGTH);
  });

  it("follows the storm once it is stronger than its approach", () => {
    expect(windStrength(0.1, 1)).toBeCloseTo(WIND_APPROACH_STRENGTH);
    expect(windStrength(0.6, 1)).toBe(0.6);
  });

  it("keeps out-of-range values within 0 and 1", () => {
    expect(windStrength(-1, -1)).toBe(0);
    expect(windStrength(3, 3)).toBe(1);
  });
});

describe("windMix", () => {
  it("is a light wind in clear weather, played as recorded", () => {
    expect(windMix(0, 0, false)).toEqual({ volume: WIND_CALM_VOLUME, cutoffHz: OPEN_CUTOFF_HZ, rate: 1 });
  });

  it("is at full volume, and faster, in a full storm", () => {
    const storm = windMix(1, 1, false);
    expect(storm.volume).toBe(WIND_STORM_VOLUME);
    expect(storm.rate).toBeCloseTo(WIND_STORM_RATE);
  });

  it("is quieter and muffled indoors, by the same share in any weather", () => {
    for (const [intensity, approach] of [
      [0, 0],
      [0, 0.7],
      [1, 1],
    ] as const) {
      const outside = windMix(intensity, approach, false);
      const inside = windMix(intensity, approach, true);
      expect(inside.volume).toBeCloseTo(outside.volume * WIND_INDOOR_VOLUME);
      expect(inside.cutoffHz).toBe(WIND_INDOOR_CUTOFF_HZ);
      expect(inside.rate).toBe(outside.rate);
    }
  });

  it("is louder indoors in a storm than outdoors in clear weather", () => {
    expect(windMix(1, 1, true).volume).toBeGreaterThan(windMix(0, 0, false).volume);
  });

  it("tells a storm from clear weather indoors as well", () => {
    expect(windMix(1, 1, true).volume).toBeGreaterThan(windMix(0, 0, true).volume * 1.5);
  });

  it("never falls and never jumps through a day's storm until it dies down", () => {
    const seed = 7;
    const weather = createWeather(seed);
    const storm = stormOfDay(seed, 1);
    const volumeAt = (time: number): number => {
      const reading = readWeather(weather, time);
      return windMix(reading.intensity, reading.approach, false).volume;
    };
    const peak = storm.start + storm.warningSeconds + storm.stormSeconds;
    let previous = volumeAt(storm.start - 1);
    expect(previous).toBe(WIND_CALM_VOLUME);
    for (let time = storm.start; time <= peak - 0.1; time += 0.1) {
      const now = volumeAt(time);
      expect(now).toBeGreaterThanOrEqual(previous - 1e-9);
      // A tenth of a second never changes the volume by more than a few hundredths (of 2).
      expect(now - previous).toBeLessThan(0.06);
      previous = now;
    }
    expect(previous).toBe(WIND_STORM_VOLUME);
    expect(volumeAt(stormEnd(storm) + 1)).toBe(WIND_CALM_VOLUME);
  });
});
