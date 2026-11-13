import { createEmptyActions, type PlayerActions } from "../input/actions";

/**
 * Read-only view of the running game, exposed as `window.__game` in development builds.
 * The smoke test and manual debugging read state through it. It is never present in production builds.
 */
export interface GameDebug {
  /** True once the first frame has been rendered. */
  ready: boolean;
  /** Number of frames rendered so far. */
  frame: number;
  /** Number of fixed simulation steps run so far. */
  tick: number;
  /** Simulated time in seconds (tick count times the step length). */
  simSeconds: number;
  /** Number of entities in the ECS world. */
  entityCount: number;
  /** The local player's actions as of the latest simulation step. */
  input: PlayerActions;
  /** Size of the drawing buffer in device pixels. */
  canvas: { width: number; height: number };
}

declare global {
  interface Window {
    __game?: GameDebug;
  }
}

/** Creates the debug object and attaches it to `window` in development builds only. */
export function installDebugApi(): GameDebug {
  const debug: GameDebug = {
    ready: false,
    frame: 0,
    tick: 0,
    simSeconds: 0,
    entityCount: 0,
    input: createEmptyActions(),
    canvas: { width: 0, height: 0 },
  };
  if (import.meta.env.DEV) {
    window.__game = debug;
  }
  return debug;
}
