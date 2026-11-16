/**
 * Measures how much of each frame is spent in named sections (simulation, render, ...).
 *
 * A section may run several times in one frame (the simulation steps zero or more times), so
 * its runs are summed per frame. Frames in which a section did not run count as zero, which
 * keeps the averages comparable between sections. The clock is passed in, so the calculation
 * can be tested without a browser.
 */

export interface SectionStats {
  /** Time spent in the section during the latest finished frame. */
  ms: number;
  /** Average time per frame over the window. */
  avgMs: number;
  /** Longest single-frame time in the window. */
  maxMs: number;
}

export class SectionTimer<Name extends string> {
  private readonly history = new Map<Name, number[]>();
  private readonly current = new Map<Name, number>();
  private readonly startedAt = new Map<Name, number>();

  constructor(
    names: readonly Name[],
    /** Returns the current time in milliseconds. */
    private readonly now: () => number,
    /** Frames kept for the averages. 300 is five seconds at 60 fps. */
    private readonly capacity = 300,
  ) {
    for (const name of names) {
      this.history.set(name, []);
      this.current.set(name, 0);
    }
  }

  begin(name: Name): void {
    this.startedAt.set(name, this.now());
  }

  /** Adds the time since the matching `begin` to this frame's total. Ignored without a `begin`. */
  end(name: Name): void {
    const startedAt = this.startedAt.get(name);
    if (startedAt === undefined) {
      return;
    }
    this.startedAt.delete(name);
    this.current.set(name, (this.current.get(name) ?? 0) + Math.max(0, this.now() - startedAt));
  }

  /** Closes the frame: stores each section's total and starts the next frame at zero. */
  endFrame(): void {
    for (const [name, times] of this.history) {
      times.push(this.current.get(name) ?? 0);
      if (times.length > this.capacity) {
        times.shift();
      }
      this.current.set(name, 0);
    }
  }

  snapshot(): Record<Name, SectionStats> {
    const result = {} as Record<Name, SectionStats>;
    for (const [name, times] of this.history) {
      let sum = 0;
      let max = 0;
      for (const time of times) {
        sum += time;
        max = Math.max(max, time);
      }
      result[name] = {
        ms: times[times.length - 1] ?? 0,
        avgMs: times.length > 0 ? sum / times.length : 0,
        maxMs: max,
      };
    }
    return result;
  }

  reset(): void {
    this.startedAt.clear();
    for (const [name, times] of this.history) {
      times.length = 0;
      this.current.set(name, 0);
    }
  }
}
