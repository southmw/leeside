import { describe, expect, it } from "vitest";
import { applyZoom } from "../../src/render/cameraZoom";

describe("applyZoom", () => {
  it("moves the camera away by a ratio when the wheel is rolled back", () => {
    expect(applyZoom(4, 1, 1.25, 1, 20)).toBeCloseTo(5);
    expect(applyZoom(10, 1, 1.25, 1, 20)).toBeCloseTo(12.5);
  });

  it("brings the camera closer when the wheel is rolled forward", () => {
    expect(applyZoom(5, -1, 1.25, 1, 20)).toBeCloseTo(4);
  });

  it("returns to where it was after one notch each way", () => {
    expect(applyZoom(applyZoom(4.5, 3), -3)).toBeCloseTo(4.5);
  });

  it("stops at the nearest and the farthest distance", () => {
    expect(applyZoom(1.1, -5, 1.25, 1, 20)).toBe(1);
    expect(applyZoom(19, 5, 1.25, 1, 20)).toBe(20);
  });

  it("does nothing without wheel movement", () => {
    expect(applyZoom(4.5, 0)).toBe(4.5);
  });

  it("handles the fractions a touchpad produces", () => {
    const result = applyZoom(4.5, 0.04);
    expect(result).toBeGreaterThan(4.5);
    expect(result).toBeLessThan(4.6);
  });

  it("uses the configured range by default: 1 to 20 m", () => {
    expect(applyZoom(4.5, -100)).toBe(1);
    expect(applyZoom(4.5, 100)).toBe(20);
  });

  it("crosses the whole range in about 21 notches", () => {
    let distance = 1;
    let notches = 0;
    while (distance < 20) {
      distance = applyZoom(distance, 1);
      notches += 1;
    }
    expect(notches).toBeGreaterThanOrEqual(20);
    expect(notches).toBeLessThanOrEqual(23);
  });
});
