import { FixedTimestep, TICK_SECONDS } from "./fixedTimestep";

export interface GameLoopCallbacks {
  /** Advances the simulation by one fixed step. `dt` is always TICK_SECONDS. */
  update(dt: number): void;
  /** Draws a frame. `alpha` is how far the display is between the last two simulation steps. */
  render(alpha: number): void;
  /**
   * Reports the real time since the previous frame, in milliseconds, and the current
   * timestamp. Not called for the first frame or the first frame after the tab was hidden,
   * because there is no meaningful interval to report.
   */
  onFrame?(frameMs: number, nowMs: number): void;
}

export interface GameLoop {
  stop(): void;
}

/**
 * Drives the simulation at a fixed rate and renders once per display frame.
 *
 * Browsers stop delivering frames to a hidden tab. When the tab comes back the gap is thrown
 * away, so the game resumes where it was instead of fast-forwarding.
 */
export function startGameLoop(callbacks: GameLoopCallbacks): GameLoop {
  const timestep = new FixedTimestep();
  let lastTime: number | undefined;
  let frameId = 0;
  let running = true;

  const onVisibilityChange = (): void => {
    lastTime = undefined;
    timestep.reset();
  };
  document.addEventListener("visibilitychange", onVisibilityChange);

  const frame = (now: number): void => {
    if (!running) {
      return;
    }
    const frameSeconds = lastTime === undefined ? 0 : (now - lastTime) / 1000;
    if (lastTime !== undefined) {
      callbacks.onFrame?.(now - lastTime, now);
    }
    lastTime = now;

    const { ticks, alpha } = timestep.advance(frameSeconds);
    for (let i = 0; i < ticks; i += 1) {
      callbacks.update(TICK_SECONDS);
    }
    callbacks.render(alpha);

    frameId = requestAnimationFrame(frame);
  };
  frameId = requestAnimationFrame(frame);

  return {
    stop(): void {
      running = false;
      cancelAnimationFrame(frameId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    },
  };
}
