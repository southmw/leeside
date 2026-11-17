import { createEmptyActions, type PlayerActions } from "../input/actions";
import type { BenchSummary } from "../bench/benchRecorder";
import type { Language } from "../locales/i18n";
import type { SectionStats } from "./sectionTimer";

/** Parts of a frame that are timed separately. */
export const TIMED_SECTIONS = ["sim", "render"] as const;
export type TimedSection = (typeof TIMED_SECTIONS)[number];

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
  /**
   * CPU time per frame spent in the simulation and in issuing draw calls. Time the GPU needs
   * afterwards is not included, so a slow frame with small numbers here points at the GPU.
   */
  sections: Record<TimedSection, SectionStats>;
  /** JavaScript heap in use, in megabytes. Undefined where the browser does not report it. */
  heapMb: number | undefined;
}

/**
 * Read-only view of the running game. In development builds it is also exposed as
 * `window.__game`, where the smoke test and manual debugging read it. Production builds
 * keep the object internal.
 */
export interface GameDebug {
  /** True once the first frame has been rendered. */
  ready: boolean;
  /** Whether the title screen is up, the player is in control, or a performance measurement is running. */
  phase: "title" | "playing" | "bench";
  /** Number of frames rendered so far. */
  frame: number;
  /** Number of fixed simulation steps run so far. */
  tick: number;
  /** Simulated time in seconds (tick count times the step length). */
  simSeconds: number;
  /** Number of entities in the ECS world. */
  entityCount: number;
  /** Number of bodies in the physics world, static ones included. */
  bodyCount: number;
  /**
   * The local player's character: position of the capsule's centre in metres, whether it
   * stands on something, the height of the terrain under it, and the id of the building it
   * is inside (null outdoors).
   */
  player: {
    x: number;
    y: number;
    z: number;
    grounded: boolean;
    groundHeight: number;
    inside: string | null;
    /** What is drawn for the character: the model, or the capsule if the model could not be loaded. */
    model: "capsule" | "model";
    /** Id of the character model in the catalog (render/characterCatalog.ts). */
    character: string;
    /** Animation the model is playing; "none" while there is no model. */
    animation: "none" | "idle" | "run" | "jump";
  };
  /** The zone the player is in: its id, the text key of its name, and how many buildings, props and rocks it has. */
  zone: { id: string; nameKey: string; buildings: number; props: number; propModels: number; rocks: number };
  /** The local player's view in radians, and whether a mouse button is held so that mouse movement turns it. */
  view: { yaw: number; pitch: number; looking: boolean };
  /**
   * The camera, in metres: its current distance behind the character's shoulder, the distance
   * chosen with the wheel (the current one is shorter when something is in the way), and its height.
   */
  camera: { distance: number; wantedDistance: number; y: number };
  /**
   * Performance measurement (`?bench`): whether one is running, how far along it is (0 to 1),
   * and once it is done its summary and whether every figure is within budget.
   */
  bench: { state: "off" | "running" | "done"; progress: number; summary: BenchSummary | null; withinBudget: boolean | null };
  /**
   * The UI: its size factor (1 at a window height of 1080 px), whether the window is too
   * small to play in, the id of the open window (null if none) and its selected button (-1 if none).
   */
  ui: { scale: number; tooSmall: boolean; window: string | null; selectedButton: number };
  /** Walking speed in use, in m/s: the tuning value unless `?speed` overrides it. */
  moveSpeed: number;
  /** The local player's actions as of the latest simulation step. */
  input: PlayerActions;
  /** Size of the drawing buffer in device pixels. */
  canvas: { width: number; height: number };
  /** Language the screen text is shown in. */
  language: Language;
  stats: DebugStats;
}

declare global {
  interface Window {
    __game?: GameDebug;
  }
}

/** Creates the debug object and attaches it to `window` in development builds only. */
export function installDebugApi(language: Language): GameDebug {
  const debug: GameDebug = {
    ready: false,
    phase: "title",
    frame: 0,
    tick: 0,
    simSeconds: 0,
    entityCount: 0,
    bodyCount: 0,
    player: { x: 0, y: 0, z: 0, grounded: false, groundHeight: 0, inside: null, model: "capsule", character: "", animation: "none" },
    zone: { id: "", nameKey: "", buildings: 0, props: 0, propModels: 0, rocks: 0 },
    view: { yaw: 0, pitch: 0, looking: false },
    bench: { state: "off", progress: 0, summary: null, withinBudget: null },
    ui: { scale: 1, tooSmall: false, window: null, selectedButton: -1 },
    moveSpeed: 0,
    camera: { distance: 0, wantedDistance: 0, y: 0 },
    input: createEmptyActions(),
    canvas: { width: 0, height: 0 },
    language,
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
      sections: {
        sim: { ms: 0, avgMs: 0, maxMs: 0 },
        render: { ms: 0, avgMs: 0, maxMs: 0 },
      },
      heapMb: undefined,
    },
  };
  if (import.meta.env.DEV) {
    window.__game = debug;
  }
  return debug;
}
