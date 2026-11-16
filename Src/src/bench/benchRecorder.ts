import { countFramesOver, LONG_FRAME_MS, lowPercentileFps, VERY_LONG_FRAME_MS } from "../debug/frameStats";
import { evaluateBudget, type PerfBudget, type PerfVerdict } from "../debug/perfBudget";

/**
 * Collects what each frame of a performance measurement cost and sums it up.
 * Pure arithmetic: frames go in as numbers, a summary comes out.
 */

export interface BenchFrame {
  /** Real time since the previous frame, in milliseconds. */
  frameMs: number;
  drawCalls: number;
  triangles: number;
  /** CPU time spent in the simulation and in issuing draw calls during this frame, in milliseconds. */
  simMs: number;
  renderMs: number;
}

export interface BenchSummary {
  /** Frames measured, and the real time they span in seconds. */
  frames: number;
  seconds: number;
  avgFps: number;
  low1Fps: number;
  avgFrameMs: number;
  maxFrameMs: number;
  /** Frames longer than 34 ms and longer than 50 ms. */
  longFrames: number;
  veryLongFrames: number;
  maxDrawCalls: number;
  maxTriangles: number;
  avgSimMs: number;
  avgRenderMs: number;
}

const mean = (values: readonly number[]): number =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
const max = (values: readonly number[]): number => values.reduce((highest, value) => Math.max(highest, value), 0);

export function summarize(frames: readonly BenchFrame[]): BenchSummary {
  const frameTimes = frames.map((frame) => frame.frameMs);
  const avgFrameMs = mean(frameTimes);
  return {
    frames: frames.length,
    seconds: frameTimes.reduce((sum, ms) => sum + ms, 0) / 1000,
    avgFps: avgFrameMs > 0 ? 1000 / avgFrameMs : 0,
    low1Fps: lowPercentileFps(frameTimes, 0.01),
    avgFrameMs,
    maxFrameMs: max(frameTimes),
    longFrames: countFramesOver(frameTimes, LONG_FRAME_MS),
    veryLongFrames: countFramesOver(frameTimes, VERY_LONG_FRAME_MS),
    maxDrawCalls: max(frames.map((frame) => frame.drawCalls)),
    maxTriangles: max(frames.map((frame) => frame.triangles)),
    avgSimMs: mean(frames.map((frame) => frame.simMs)),
    avgRenderMs: mean(frames.map((frame) => frame.renderMs)),
  };
}

/** Compares a summary with a performance budget, metric by metric (`true` passes). */
export function judge(summary: BenchSummary, budget: PerfBudget): PerfVerdict {
  return evaluateBudget(
    {
      avgFps: summary.avgFps,
      low1Fps: summary.low1Fps,
      drawCalls: summary.maxDrawCalls,
      triangles: summary.maxTriangles,
      veryLongFrames: summary.veryLongFrames,
    },
    budget,
  );
}

/**
 * Records a measurement run. The first moments are left out, because loading and the first
 * draw of everything cause hitches that say nothing about how the game runs afterwards.
 */
export class BenchRecorder {
  private readonly frames: BenchFrame[] = [];
  private elapsedMs = 0;

  constructor(
    /** How long the measurement lasts, in seconds, not counting the warm-up. */
    readonly durationSeconds: number,
    /** Time skipped at the start, in seconds. */
    readonly warmUpSeconds = 1,
  ) {}

  /** Adds a frame. Frames during the warm-up and after the end are ignored. */
  add(frame: BenchFrame): void {
    if (this.done || !Number.isFinite(frame.frameMs) || frame.frameMs <= 0) {
      return;
    }
    this.elapsedMs += frame.frameMs;
    if (this.elapsedMs > this.warmUpSeconds * 1000) {
      this.frames.push(frame);
    }
  }

  /** How far through the measurement the run is, from 0 to 1. Stays at 0 during the warm-up. */
  get progress(): number {
    const measured = this.elapsedMs / 1000 - this.warmUpSeconds;
    return Math.min(Math.max(measured / this.durationSeconds, 0), 1);
  }

  get done(): boolean {
    return this.elapsedMs / 1000 >= this.warmUpSeconds + this.durationSeconds;
  }

  summary(): BenchSummary {
    return summarize(this.frames);
  }
}

/** One line of a result: which figure, its value as text, and whether it is within budget (if judged). */
export interface BenchRow {
  key:
    | "avgFps"
    | "low1Fps"
    | "avgFrameMs"
    | "maxFrameMs"
    | "longFrames"
    | "veryLongFrames"
    | "maxDrawCalls"
    | "maxTriangles"
    | "avgSimMs"
    | "avgRenderMs"
    | "duration"
    | "frames";
  value: string;
  ok?: boolean;
}

const whole = (value: number): string => Math.round(value).toLocaleString("en-US");

/** The result as rows of text, in the order they are shown and copied. */
export function benchRows(summary: BenchSummary, verdict: PerfVerdict): BenchRow[] {
  return [
    { key: "avgFps", value: summary.avgFps.toFixed(1), ok: verdict.avgFps },
    { key: "low1Fps", value: summary.low1Fps.toFixed(1), ok: verdict.low1Fps },
    { key: "avgFrameMs", value: `${summary.avgFrameMs.toFixed(1)} ms` },
    { key: "maxFrameMs", value: `${summary.maxFrameMs.toFixed(1)} ms` },
    { key: "longFrames", value: whole(summary.longFrames) },
    { key: "veryLongFrames", value: whole(summary.veryLongFrames), ok: verdict.veryLongFrames },
    { key: "maxDrawCalls", value: whole(summary.maxDrawCalls), ok: verdict.drawCalls },
    { key: "maxTriangles", value: whole(summary.maxTriangles), ok: verdict.triangles },
    { key: "avgSimMs", value: `${summary.avgSimMs.toFixed(2)} ms` },
    { key: "avgRenderMs", value: `${summary.avgRenderMs.toFixed(2)} ms` },
    { key: "duration", value: `${summary.seconds.toFixed(1)} s` },
    { key: "frames", value: whole(summary.frames) },
  ];
}
