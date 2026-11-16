import { describe, expect, it } from "vitest";
import { clamp, lerp, lerpAngle, yawFromQuaternion } from "../../src/core/math";

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

describe("yawFromQuaternion", () => {
  const aboutY = (angle: number) => ({ x: 0, y: Math.sin(angle / 2), z: 0, w: Math.cos(angle / 2) });

  it("is 0 for no rotation", () => {
    expect(yawFromQuaternion({ x: 0, y: 0, z: 0, w: 1 })).toBe(0);
  });

  it("returns the angle of a rotation around the vertical axis", () => {
    expect(yawFromQuaternion(aboutY(0.5))).toBeCloseTo(0.5);
    expect(yawFromQuaternion(aboutY(-2))).toBeCloseTo(-2);
  });

  it("ignores a pure tilt", () => {
    const aboutX = { x: Math.sin(0.3), y: 0, z: 0, w: Math.cos(0.3) };
    expect(yawFromQuaternion(aboutX)).toBeCloseTo(0);
  });
});

describe("lerpAngle", () => {
  it("interpolates like lerp for nearby angles", () => {
    expect(lerpAngle(0.2, 0.6, 0.5)).toBeCloseTo(0.4);
    expect(lerpAngle(0.2, 0.6, 0)).toBeCloseTo(0.2);
    expect(lerpAngle(0.2, 0.6, 1)).toBeCloseTo(0.6);
  });

  it("takes the short way across the seam at PI", () => {
    const result = lerpAngle(Math.PI - 0.2, -Math.PI + 0.2, 0.25);
    expect(result).toBeCloseTo(Math.PI - 0.1);
  });

  it("takes the short way in the other direction too", () => {
    const result = lerpAngle(-Math.PI + 0.2, Math.PI - 0.2, 0.5);
    expect(Math.abs(result)).toBeCloseTo(Math.PI);
  });
});
