import { createEmptyActions, type PlayerActions } from "../input/actions";

/** Performance figures: frame timing plus what the renderer drew in the latest frame. */
export interface DebugStats {
  fps: number;
  avgFps: number;
  low1Fps: number;
  frameMs: number;
  maxFrameMs: number;
  longFrames: number;
  veryLongFrames: number;
  samples: number;
  drawCalls: number;
  triangles: number;
  /** Geometries and textures held in GPU memory. These must not grow as zones come and go. */
  geometries: number;
  textures: number;
}

/**
 * Read-only view of the running game. In development builds it is also exposed as
 * `window.__game`, where the smoke test and manual debugging read it. Production builds
 * keep the object internal.
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
  stats: DebugStats;
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
    stats: {
      fps: 0,
      avgFps: 0,
      low1Fps: 0,
      frameMs: 0,
      maxFrameMs: 0,
      longFrames: 0,
      veryLongFrames: 0,
      samples: 0,
      drawCalls: 0,
      triangles: 0,
      geometries: 0,
      textures: 0,
    },
  };
  if (import.meta.env.DEV) {
    window.__game = debug;
  }
  return debug;
}
