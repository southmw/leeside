import { describe, expect, it } from "vitest";
import { computePixelRatio, computeViewport, MAX_PIXEL_RATIO } from "../../src/render/viewport";

describe("computePixelRatio", () => {
  it("keeps ratios at or below the cap", () => {
    expect(computePixelRatio(1)).toBe(1);
    expect(computePixelRatio(1.5)).toBe(1.5);
  });

  it("caps high-density displays", () => {
    expect(computePixelRatio(3)).toBe(MAX_PIXEL_RATIO);
    expect(computePixelRatio(3, 1)).toBe(1);
  });

  it("falls back to 1 for invalid values", () => {
    expect(computePixelRatio(0)).toBe(1);
    expect(computePixelRatio(-2)).toBe(1);
    expect(computePixelRatio(Number.NaN)).toBe(1);
  });
});

describe("computeViewport", () => {
  it("reports size and aspect ratio", () => {
    const viewport = computeViewport(1920, 1080, 1);
    expect(viewport.width).toBe(1920);
    expect(viewport.height).toBe(1080);
    expect(viewport.aspect).toBeCloseTo(16 / 9);
    expect(viewport.pixelRatio).toBe(1);
  });

  it("never returns a zero-sized viewport", () => {
    const viewport = computeViewport(0, 0, 2);
    expect(viewport.width).toBe(1);
    expect(viewport.height).toBe(1);
    expect(viewport.aspect).toBe(1);
  });

  it("drops fractional pixels", () => {
    const viewport = computeViewport(800.7, 600.2, 1);
    expect(viewport.width).toBe(800);
    expect(viewport.height).toBe(600);
  });
});
