import { describe, expect, it } from "vitest";
import { clamp, lerp } from "../../src/core/math";

describe("clamp", () => {
  it("returns the value when it is inside the range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it("limits the value to the range ends", () => {
    expect(clamp(-3, 0, 10)).toBe(0);
    expect(clamp(42, 0, 10)).toBe(10);
  });

  it("rejects an inverted range", () => {
    expect(() => clamp(1, 10, 0)).toThrow(RangeError);
  });
});

describe("lerp", () => {
  it("returns the ends at t = 0 and t = 1", () => {
    expect(lerp(2, 8, 0)).toBe(2);
    expect(lerp(2, 8, 1)).toBe(8);
  });

  it("returns the midpoint at t = 0.5", () => {
    expect(lerp(2, 8, 0.5)).toBe(5);
  });

  it("extrapolates when t is outside 0..1", () => {
    expect(lerp(0, 10, 1.5)).toBe(15);
  });
});
