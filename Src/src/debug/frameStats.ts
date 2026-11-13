/**
 * Frame timing statistics. Pure calculations over a list of frame times in milliseconds.
 *
 * FPS alone hides headroom because it stops at the display refresh rate, so frame time is
 * reported alongside it. "1% low" is the frame rate of the slowest 1% of frames and reflects
 * the stutter a player actually notices.
 */

/** A frame longer than this missed a 30 fps beat (33.3 ms) and reads as a hitch. */
export const LONG_FRAME_MS = 34;
/** A frame longer than this is a clearly visible stall. */
export const VERY_LONG_FRAME_MS = 50;

export interface FrameStatsSnapshot {
  /** Frame rate over the most recent few frames. */
  fps: number;
  /** Frame rate over the whole sample window. */
  avgFps: number;
  /** Frame rate of the slowest 1% of frames in the window. */
  low1Fps: number;
  /** Duration of the latest frame. */
  frameMs: number;
  avgFrameMs: number;
  maxFrameMs: number;
  /** Frames over LONG_FRAME_MS since the last reset (not limited to the window). */
  longFrames: number;
  /** Frames over VERY_LONG_FRAME_MS since the last reset (not limited to the window). */
  veryLongFrames: number;
  /** Number of frames currently in the window. */
  samples: number;
}

function mean(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  let sum = 0;
  for (const value of values) {
    sum += value;
  }
  return sum / values.length;
}

const fpsFromMs = (ms: number): number => (ms > 0 ? 1000 / ms : 0);

/** Average frames per second for a list of frame times. */
export function averageFps(frameTimesMs: readonly number[]): number {
  return fpsFromMs(mean(frameTimesMs));
}

/**
 * Frame rate of the slowest `fraction` of frames (0.01 for "1% low").
 * At least one frame is always used, so short lists report their single worst frame.
 */
export function lowPercentileFps(frameTimesMs: readonly number[], fraction = 0.01): number {
  if (frameTimesMs.length === 0) {
    return 0;
  }
  const count = Math.max(1, Math.ceil(frameTimesMs.length * fraction));
  const slowest = [...frameTimesMs].sort((a, b) => b - a).slice(0, count);
  return fpsFromMs(mean(slowest));
}

/** Counts frames strictly longer than `thresholdMs`. */
export function countFramesOver(frameTimesMs: readonly number[], thresholdMs: number): number {
  let count = 0;
  for (const time of frameTimesMs) {
    if (time > thresholdMs) {
      count += 1;
    }
  }
  return count;
}

/** Collects frame times in a sliding window and summarises them. */
export class FrameStats {
  private readonly window: number[] = [];
  private longFrames = 0;
  private veryLongFrames = 0;

  constructor(
    /** Frames kept for the averages. 300 is five seconds at 60 fps. */
    private readonly capacity = 300,
    /** Frames used for the "current" FPS reading. */
    private readonly recentCount = 30,
  ) {}

  add(frameMs: number): void {
    if (!Number.isFinite(frameMs) || frameMs <= 0) {
      return;
    }
    this.window.push(frameMs);
    if (this.window.length > this.capacity) {
      this.window.shift();
    }
    if (frameMs > LONG_FRAME_MS) {
      this.longFrames += 1;
    }
    if (frameMs > VERY_LONG_FRAME_MS) {
      this.veryLongFrames += 1;
    }
  }

  snapshot(): FrameStatsSnapshot {
    const window = this.window;
    const recent = window.slice(-this.recentCount);
    return {
      fps: averageFps(recent),
      avgFps: averageFps(window),
      low1Fps: lowPercentileFps(window, 0.01),
      frameMs: window[window.length - 1] ?? 0,
      avgFrameMs: mean(window),
      maxFrameMs: window.length > 0 ? Math.max(...window) : 0,
      longFrames: this.longFrames,
      veryLongFrames: this.veryLongFrames,
      samples: window.length,
    };
  }

  reset(): void {
    this.window.length = 0;
    this.longFrames = 0;
    this.veryLongFrames = 0;
  }
}
