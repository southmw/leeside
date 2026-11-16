import { describe, expect, it } from "vitest";
import { wrapAngle } from "../../src/core/math";
import { applyLook, createView, MAX_PITCH, MIN_PITCH, moveDirection, previewLook } from "../../src/gameplay/view";

const DEGREES = Math.PI / 180;

describe("applyLook", () => {
  it("turns right when the mouse moves right, and looks down when it moves down", () => {
    const view = createView();
    applyLook(view, 0.2, 0.1);
    expect(view.yaw).toBeCloseTo(-0.2);
    expect(view.pitch).toBeCloseTo(-0.1);
  });

  it("stops at 60 degrees down and 70 degrees up", () => {
    const view = createView();
    applyLook(view, 0, 10);
    expect(view.pitch).toBeCloseTo(-60 * DEGREES);
    expect(view.pitch).toBe(MIN_PITCH);

    applyLook(view, 0, -10);
    expect(view.pitch).toBeCloseTo(70 * DEGREES);
    expect(view.pitch).toBe(MAX_PITCH);
  });

  it("comes back from a limit straight away", () => {
    const view = createView();
    applyLook(view, 0, 10);
    applyLook(view, 0, -0.1);
    expect(view.pitch).toBeCloseTo(MIN_PITCH + 0.1);
  });

  it("keeps yaw within one turn however far the view spins", () => {
    const view = createView();
    for (let i = 0; i < 1000; i += 1) {
      applyLook(view, 0.5, 0);
    }
    expect(Math.abs(view.yaw)).toBeLessThanOrEqual(Math.PI);
    expect(wrapAngle(view.yaw - wrapAngle(-500))).toBeCloseTo(0);
  });
});

describe("previewLook", () => {
  it("gives the same result as applying the look, and leaves the view alone", () => {
    const view = createView(0.3, 0.1);
    const preview = previewLook(view, 0.2, 5);
    expect(view).toEqual({ yaw: 0.3, pitch: 0.1 });

    applyLook(view, 0.2, 5);
    expect(preview).toEqual(view);
  });
});

describe("wrapAngle", () => {
  it("leaves angles within half a turn alone", () => {
    expect(wrapAngle(1)).toBeCloseTo(1);
    expect(wrapAngle(-3)).toBeCloseTo(-3);
  });

  it("wraps larger angles", () => {
    expect(wrapAngle(Math.PI + 0.5)).toBeCloseTo(-Math.PI + 0.5);
    expect(wrapAngle(-Math.PI - 0.5)).toBeCloseTo(Math.PI - 0.5);
    expect(wrapAngle(4 * Math.PI + 0.25)).toBeCloseTo(0.25);
  });
});

describe("moveDirection", () => {
  const expectDirection = (actual: { x: number; z: number }, x: number, z: number): void => {
    expect(actual.x).toBeCloseTo(x);
    expect(actual.z).toBeCloseTo(z);
  };

  it("at yaw 0, forward is -Z and right is +X", () => {
    expectDirection(moveDirection(0, 1, 0), 0, -1);
    expectDirection(moveDirection(1, 0, 0), 1, 0);
    expectDirection(moveDirection(0, -1, 0), 0, 1);
  });

  it("after a quarter turn to the left, forward is -X and right is -Z", () => {
    expectDirection(moveDirection(0, 1, Math.PI / 2), -1, 0);
    expectDirection(moveDirection(1, 0, Math.PI / 2), 0, -1);
  });

  it("after a quarter turn to the right, forward is +X", () => {
    expectDirection(moveDirection(0, 1, -Math.PI / 2), 1, 0);
  });

  it("facing backwards, forward is +Z", () => {
    expectDirection(moveDirection(0, 1, Math.PI), 0, 1);
  });

  it("keeps the length of the input", () => {
    for (const yaw of [0, 0.7, 2, -2.5]) {
      const direction = moveDirection(Math.SQRT1_2, Math.SQRT1_2, yaw);
      expect(Math.hypot(direction.x, direction.z)).toBeCloseTo(1);
      const half = moveDirection(0.5, 0, yaw);
      expect(Math.hypot(half.x, half.z)).toBeCloseTo(0.5);
    }
  });

  it("is not affected by pitch: looking up or down does not change the speed", () => {
    // Pitch is not even an input; this documents the intent.
    expect(moveDirection.length).toBe(3);
  });
});
