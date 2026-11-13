/**
 * Performance budgets (prototype plan 2.4, technical design 15).
 * Numbers are initial targets and get tuned once real measurements exist.
 */

export type Quality = "low" | "high";

export interface PerfBudget {
  minAvgFps: number;
  minLow1Fps: number;
  maxDrawCalls: number;
  maxTriangles: number;
  /** Allowed number of frames over 50 ms during one measurement run. */
  maxVeryLongFrames: number;
}

export const PERF_BUDGETS: Readonly<Record<Quality, PerfBudget>> = {
  low: { minAvgFps: 30, minLow1Fps: 20, maxDrawCalls: 250, maxTriangles: 300_000, maxVeryLongFrames: 5 },
  high: { minAvgFps: 60, minLow1Fps: 45, maxDrawCalls: 500, maxTriangles: 1_000_000, maxVeryLongFrames: 5 },
};

/**
 * A display running at exactly 60 Hz measures as 59.9-something, which must not count as a
 * miss. Frame-rate targets therefore pass when within this fraction below the target.
 */
export const FPS_TOLERANCE = 0.03;

export interface PerfSample {
  avgFps: number;
  low1Fps: number;
  drawCalls: number;
  triangles: number;
  veryLongFrames: number;
}

export type PerfVerdict = Record<keyof PerfSample, boolean>;

/** Reports, per metric, whether the sample is within budget (`true` means it passes). */
export function evaluateBudget(sample: PerfSample, budget: PerfBudget): PerfVerdict {
  return {
    avgFps: sample.avgFps >= budget.minAvgFps * (1 - FPS_TOLERANCE),
    low1Fps: sample.low1Fps >= budget.minLow1Fps * (1 - FPS_TOLERANCE),
    drawCalls: sample.drawCalls <= budget.maxDrawCalls,
    triangles: sample.triangles <= budget.maxTriangles,
    veryLongFrames: sample.veryLongFrames <= budget.maxVeryLongFrames,
  };
}

export function isWithinBudget(verdict: PerfVerdict): boolean {
  return Object.values(verdict).every(Boolean);
}
