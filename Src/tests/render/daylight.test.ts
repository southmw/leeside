import { describe, expect, it } from "vitest";
import { daylightAt, luminance, SUNRISE_HOUR, SUNSET_HOUR } from "../../src/render/daylight";

/** Total light falling on the ground, roughly. */
function brightness(hour: number): number {
  const light = daylightAt(hour);
  return light.sunIntensity + light.moonIntensity + light.ambientIntensity;
}

describe("daylightAt", () => {
  it("is brightest by day, dimmer at dusk and dimmest at night", () => {
    expect(brightness(12)).toBeGreaterThan(brightness(18.5));
    expect(brightness(18.5)).toBeGreaterThan(brightness(22));
  });

  it("keeps the night dark but not black", () => {
    for (const hour of [20, 0, 3]) {
      const night = daylightAt(hour);
      expect(night.sunIntensity).toBe(0);
      expect(night.moonIntensity).toBeGreaterThan(0.15);
      expect(night.ambientIntensity).toBeGreaterThan(0.15);
      expect(brightness(hour)).toBeLessThan(brightness(12) / 2);
      expect(luminance(night.skyTop)).toBeLessThan(0.15);
    }
  });

  it("is already light when the player sets out at 06:00", () => {
    expect(daylightAt(6).sunIntensity).toBeGreaterThan(0.8);
    expect(luminance(daylightAt(6).skyHorizon)).toBeGreaterThan(0.4);
  });

  it("reddens the sky and the sunlight at dusk", () => {
    for (const hour of [18, 18.5]) {
      const dusk = daylightAt(hour);
      expect(dusk.skyHorizon[0]).toBeGreaterThan(dusk.skyHorizon[2] + 0.3);
      expect(dusk.sunColor[0]).toBeGreaterThan(dusk.sunColor[2] + 0.3);
    }
    const noon = daylightAt(12);
    expect(noon.skyTop[2]).toBeGreaterThan(noon.skyTop[0]);
  });

  it("has no moonlight by day", () => {
    expect(daylightAt(12).moonIntensity).toBe(0);
  });

  it("changes gradually: no jump from one minute to the next, midnight included", () => {
    let previous = daylightAt(-1 / 60);
    for (let minute = 0; minute <= 24 * 60; minute += 1) {
      const now = daylightAt(minute / 60);
      // Sunrise is the fastest change, about 0.08 a minute; a step in the table would be 0.5 or more.
      expect(Math.abs(brightness(minute / 60) - brightness((minute - 1) / 60))).toBeLessThan(0.12);
      for (const key of ["skyTop", "skyHorizon", "sunColor", "ambientColor"] as const) {
        for (let channel = 0; channel < 3; channel += 1) {
          expect(Math.abs((now[key][channel] as number) - (previous[key][channel] as number))).toBeLessThan(0.03);
        }
      }
      previous = now;
    }
  });

  it("gives the same result for hours that wrap round", () => {
    expect(daylightAt(24)).toEqual(daylightAt(0));
    expect(daylightAt(30)).toEqual(daylightAt(6));
    expect(daylightAt(-6)).toEqual(daylightAt(18));
  });
});

describe("the sun", () => {
  it("is up between sunrise and sunset and down otherwise", () => {
    expect(daylightAt(SUNRISE_HOUR + 0.1).sunElevation).toBeGreaterThan(0);
    expect(daylightAt(SUNSET_HOUR - 0.1).sunElevation).toBeGreaterThan(0);
    expect(daylightAt(SUNRISE_HOUR - 0.5).sunElevation).toBeLessThan(0);
    expect(daylightAt(SUNSET_HOUR + 0.5).sunElevation).toBeLessThan(0);
    expect(daylightAt(0).sunDirection[1]).toBeLessThan(0);
  });

  it("stands highest at midday", () => {
    const midday = (SUNRISE_HOUR + SUNSET_HOUR) / 2;
    expect(daylightAt(midday).sunElevation).toBeGreaterThan(daylightAt(9).sunElevation);
    expect(daylightAt(midday).sunElevation).toBeGreaterThan(daylightAt(16).sunElevation);
    expect(daylightAt(midday).sunElevation).toBeGreaterThan(50);
  });

  it("rises in the east (+X) and sets in the west (-X)", () => {
    expect(daylightAt(7).sunDirection[0]).toBeGreaterThan(0.5);
    expect(daylightAt(17.5).sunDirection[0]).toBeLessThan(-0.5);
  });

  it("points in a direction of length 1", () => {
    for (const hour of [0, 6, 9, 12, 18, 21]) {
      const [x, y, z] = daylightAt(hour).sunDirection;
      expect(Math.hypot(x, y, z)).toBeCloseTo(1);
    }
  });
});
