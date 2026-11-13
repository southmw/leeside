import { describe, expect, it } from "vitest";
import { evaluateBudget, isWithinBudget, PERF_BUDGETS, type PerfSample } from "../../src/debug/perfBudget";

const healthy: PerfSample = { avgFps: 60, low1Fps: 55, drawCalls: 120, triangles: 200_000, veryLongFrames: 0 };

describe("evaluateBudget", () => {
  it("passes a sample that meets every target", () => {
    const verdict = evaluateBudget(healthy, PERF_BUDGETS.high);
    expect(isWithinBudget(verdict)).toBe(true);
  });

  it("treats a 60 Hz display measuring just under 60 as a pass", () => {
    const verdict = evaluateBudget({ ...healthy, avgFps: 59.94 }, PERF_BUDGETS.high);
    expect(verdict.avgFps).toBe(true);
  });

  it("fails a frame rate clearly below target", () => {
    const verdict = evaluateBudget({ ...healthy, avgFps: 48 }, PERF_BUDGETS.high);
    expect(verdict.avgFps).toBe(false);
    expect(isWithinBudget(verdict)).toBe(false);
  });

  it("flags each metric independently", () => {
    const verdict = evaluateBudget(
      { avgFps: 60, low1Fps: 30, drawCalls: 900, triangles: 100, veryLongFrames: 9 },
      PERF_BUDGETS.high,
    );
    expect(verdict).toEqual({
      avgFps: true,
      low1Fps: false,
      drawCalls: false,
      triangles: true,
      veryLongFrames: false,
    });
  });

  it("uses looser frame-rate targets for low quality", () => {
    const sample: PerfSample = { ...healthy, avgFps: 32, low1Fps: 22 };
    expect(isWithinBudget(evaluateBudget(sample, PERF_BUDGETS.low))).toBe(true);
    expect(isWithinBudget(evaluateBudget(sample, PERF_BUDGETS.high))).toBe(false);
  });

  it("accepts values exactly on the limits", () => {
    const budget = PERF_BUDGETS.high;
    const verdict = evaluateBudget(
      {
        avgFps: budget.minAvgFps,
        low1Fps: budget.minLow1Fps,
        drawCalls: budget.maxDrawCalls,
        triangles: budget.maxTriangles,
        veryLongFrames: budget.maxVeryLongFrames,
      },
      budget,
    );
    expect(isWithinBudget(verdict)).toBe(true);
  });
});
