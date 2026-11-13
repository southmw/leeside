/**
 * Fixed-timestep accumulator.
 *
 * The simulation always advances in equal steps, however fast or unevenly frames arrive, so
 * physics and game rules behave the same on every machine. Rendering then blends between the
 * two most recent simulation states using `alpha`.
 */

/** Simulation steps per second. */
export const TICK_RATE = 60;
/** Length of one simulation step in seconds. */
export const TICK_SECONDS = 1 / TICK_RATE;
/**
 * Longest frame the simulation will try to catch up on. A longer gap (a stall, a breakpoint,
 * a hidden tab) is dropped instead of being replayed as a burst of steps.
 */
export const MAX_FRAME_SECONDS = 0.25;

export interface StepResult {
  /** How many simulation steps to run for this frame. */
  ticks: number;
  /** Position between the previous and the current step, from 0 (inclusive) to 1 (exclusive). */
  alpha: number;
}

export class FixedTimestep {
  private accumulator = 0;

  constructor(
    private readonly tickSeconds: number = TICK_SECONDS,
    private readonly maxFrameSeconds: number = MAX_FRAME_SECONDS,
  ) {
    if (!(tickSeconds > 0)) {
      throw new RangeError(`tickSeconds must be positive, got ${tickSeconds}`);
    }
  }

  /** Feeds the time elapsed since the last frame and reports how far to advance. */
  advance(frameSeconds: number): StepResult {
    const elapsed = Number.isFinite(frameSeconds)
      ? Math.min(Math.max(frameSeconds, 0), this.maxFrameSeconds)
      : 0;
    this.accumulator += elapsed;

    // The small tolerance stops rounding error from postponing a step that is due
    // (60 frames of 1/60 s must yield exactly 60 steps).
    const epsilon = this.tickSeconds * 1e-6;
    let ticks = 0;
    while (this.accumulator + epsilon >= this.tickSeconds) {
      this.accumulator -= this.tickSeconds;
      ticks += 1;
    }
    if (this.accumulator < 0) {
      this.accumulator = 0;
    }

    return { ticks, alpha: Math.min(this.accumulator / this.tickSeconds, 1 - Number.EPSILON) };
  }

  /** Discards leftover time, for example after the tab has been hidden. */
  reset(): void {
    this.accumulator = 0;
  }
}
