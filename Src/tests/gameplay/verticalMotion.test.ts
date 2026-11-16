import { describe, expect, it } from "vitest";
import { jumpSpeed, settleVertical, stepVertical, type VerticalState } from "../../src/gameplay/verticalMotion";

const G = 20;
const DT = 1 / 60;
const standing = (): VerticalState => ({ velocityY: 0, grounded: true, jumpHeld: false });

/** Simulates free movement (nothing in the way) above a floor at height 0 and returns the peak. */
function peakOfJump(dt: number, height: number): number {
  const state = standing();
  let y = 0;
  let peak = 0;
  for (let time = 0; time < 2; time += dt) {
    const wanted = stepVertical(state, time === 0, dt, G, height);
    const moved = Math.max(wanted, -y);
    y += moved;
    settleVertical(state, wanted, moved, y <= 0);
    peak = Math.max(peak, y);
  }
  return peak;
}

describe("jumpSpeed", () => {
  it("is sqrt(2 g h)", () => {
    expect(jumpSpeed(1.1, 20)).toBeCloseTo(Math.sqrt(44));
    expect(jumpSpeed(0, 20)).toBe(0);
  });
});

describe("stepVertical", () => {
  it("reaches the jump height", () => {
    expect(peakOfJump(DT, 1.1)).toBeCloseTo(1.1, 2);
  });

  it("reaches the same height at a different step length", () => {
    expect(peakOfJump(1 / 30, 1.1)).toBeCloseTo(1.1, 1);
    expect(peakOfJump(1 / 240, 1.1)).toBeCloseTo(1.1, 2);
  });

  it("neither moves nor builds up fall speed while standing", () => {
    const state = standing();
    for (let i = 0; i < 600; i += 1) {
      const wanted = stepVertical(state, false, DT, G);
      expect(wanted).toBe(0);
      settleVertical(state, wanted, 0, true);
    }
    expect(state.velocityY).toBe(0);
  });

  it("starts falling from rest once the ground is gone", () => {
    const state = standing();
    state.grounded = false;
    expect(stepVertical(state, false, DT, G)).toBeLessThan(0);
    expect(state.velocityY).toBeCloseTo(-G * DT);
  });

  it("ignores the jump button in the air", () => {
    const state: VerticalState = { velocityY: -3, grounded: false, jumpHeld: false };
    stepVertical(state, true, DT, G);
    expect(state.velocityY).toBeLessThan(-3);
  });

  it("needs a new press for each jump", () => {
    const state: VerticalState = { velocityY: 0, grounded: true, jumpHeld: true };
    stepVertical(state, true, DT, G);
    expect(state.velocityY).toBe(0);
    expect(state.grounded).toBe(true);

    const released: VerticalState = { velocityY: 0, grounded: true, jumpHeld: false };
    stepVertical(released, true, DT, G);
    expect(released.velocityY).toBeGreaterThan(0);
    expect(released.grounded).toBe(false);
  });

  it("accelerates downwards at gravity while falling", () => {
    const state: VerticalState = { velocityY: 0, grounded: false, jumpHeld: false };
    let fallen = 0;
    for (let i = 0; i < 60; i += 1) {
      fallen -= stepVertical(state, false, DT, G);
    }
    expect(state.velocityY).toBeCloseTo(-G);
    expect(fallen).toBeCloseTo(G / 2);
  });
});

describe("settleVertical", () => {
  it("ends a jump when the head hits something", () => {
    const state: VerticalState = { velocityY: 5, grounded: false, jumpHeld: true };
    settleVertical(state, 0.08, 0, false);
    expect(state.velocityY).toBe(0);
  });

  it("keeps rising when nothing is in the way", () => {
    const state: VerticalState = { velocityY: 5, grounded: false, jumpHeld: true };
    settleVertical(state, 0.08, 0.08, false);
    expect(state.velocityY).toBe(5);
  });

  it("is not grounded while still rising", () => {
    const state: VerticalState = { velocityY: 5, grounded: false, jumpHeld: true };
    settleVertical(state, 0.08, 0.08, true);
    expect(state.grounded).toBe(false);
  });

  it("is grounded once it stands on something", () => {
    const state: VerticalState = { velocityY: -2, grounded: false, jumpHeld: false };
    settleVertical(state, -0.03, -0.01, true);
    expect(state.grounded).toBe(true);
  });
});
