import { describe, expect, it } from "vitest";
import { STORM_VISIBILITY } from "../../src/data/tuning";
import { daylightAt, luminance } from "../../src/render/daylight";
import { CLEAR_VISIBILITY, dustColor, sceneLook, visibilityAt } from "../../src/render/stormLook";

const noon = daylightAt(12);
const night = daylightAt(0);

describe("visibilityAt", () => {
  it("is far in clear weather and 25 m in a full storm", () => {
    expect(visibilityAt(0)).toBe(CLEAR_VISIBILITY);
    expect(visibilityAt(1)).toBeCloseTo(STORM_VISIBILITY);
    expect(STORM_VISIBILITY).toBe(25);
  });

  it("closes in steadily as the storm strengthens", () => {
    let previous = visibilityAt(0);
    for (let step = 1; step <= 20; step += 1) {
      const now = visibilityAt(step / 20);
      expect(now).toBeLessThan(previous);
      // Each step takes off the same share, so there is no sudden drop at either end.
      expect(now / previous).toBeCloseTo(visibilityAt(0.05) / visibilityAt(0), 5);
      previous = now;
    }
  });

  it("stays within its limits for strengths that make no sense", () => {
    expect(visibilityAt(-1)).toBe(CLEAR_VISIBILITY);
    expect(visibilityAt(5)).toBeCloseTo(STORM_VISIBILITY);
  });
});

describe("sceneLook", () => {
  it("leaves the daylight as it is in clear weather", () => {
    const look = sceneLook(noon, 0);
    expect(look.sunIntensity).toBe(noon.sunIntensity);
    expect(look.skyTop).toEqual(noon.skyTop);
    expect(look.ambientColor).toEqual(noon.ambientColor);
    expect(look.fogFar).toBe(CLEAR_VISIBILITY);
    // The far haze is the horizon's colour, so the edge of the land melts into the sky.
    expect(look.fogColor).toEqual(noon.skyHorizon);
  });

  it("fills sky and air with sand in a full storm by day", () => {
    const look = sceneLook(noon, 1);
    expect(look.fogFar).toBeCloseTo(STORM_VISIBILITY);
    expect(look.fogColor[0]).toBeGreaterThan(look.fogColor[1]);
    expect(look.fogColor[1]).toBeGreaterThan(look.fogColor[2]);
    // No horizon to be seen: sky and haze are one colour.
    expect(look.skyTop).toEqual(look.fogColor);
    expect(look.skyHorizon).toEqual(look.fogColor);
  });

  it("dims the sun but leaves enough light to see nearby shapes", () => {
    const look = sceneLook(noon, 1);
    expect(look.sunIntensity).toBeLessThan(noon.sunIntensity / 2);
    expect(look.sunIntensity).toBeGreaterThan(0.3);
    // The dust scatters what it blocks: more light from all sides, less from the sun.
    expect(look.ambientIntensity).toBeGreaterThan(noon.ambientIntensity);
    expect(look.ambientIntensity).toBeLessThan(noon.ambientIntensity * 1.5);
  });

  it("hides the sky before the view has closed in all the way", () => {
    const half = sceneLook(noon, 0.5);
    expect(half.skyTop).toEqual(half.fogColor);
    expect(half.fogFar).toBeGreaterThan(STORM_VISIBILITY * 4);
  });

  it("makes a storm at night dark, not a glowing wall of sand", () => {
    expect(luminance(sceneLook(night, 1).fogColor)).toBeLessThan(0.12);
    expect(luminance(dustColor(night))).toBeLessThan(luminance(dustColor(noon)) / 4);
  });

  it("leaves enough light in a storm after dark to see one's own character", () => {
    for (const hour of [19, 0, 4]) {
      const dark = daylightAt(hour);
      const look = sceneLook(dark, 1);
      expect(look.ambientIntensity).toBeGreaterThan(1.2);
      expect(look.ambientIntensity).toBeGreaterThan(dark.ambientIntensity * 3);
    }
    // By day the storm's own light is enough and nothing is added.
    expect(sceneLook(noon, 1).ambientIntensity).toBeLessThan(noon.ambientIntensity * 1.5);
    // And with no storm the night is as dark as it was.
    expect(sceneLook(night, 0).ambientIntensity).toBe(night.ambientIntensity);
  });

  it("changes gradually with the storm's strength", () => {
    let previous = sceneLook(noon, 0);
    for (let step = 1; step <= 100; step += 1) {
      const now = sceneLook(noon, step / 100);
      for (let channel = 0; channel < 3; channel += 1) {
        expect(Math.abs((now.fogColor[channel] as number) - (previous.fogColor[channel] as number))).toBeLessThan(0.02);
        expect(Math.abs((now.skyTop[channel] as number) - (previous.skyTop[channel] as number))).toBeLessThan(0.02);
      }
      expect(Math.abs(now.sunIntensity - previous.sunIntensity)).toBeLessThan(0.05);
      previous = now;
    }
  });
});
