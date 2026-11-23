import type { AudioState } from "../audio/audio";
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
  /** The player's settings as the game has applied them (app/settings.ts). */
  settings: { mouseSensitivity: number; invertY: boolean; volume: number; quality: "low" | "high"; showFps: boolean; language: Language | null };
  /** Whether the game is paused: the simulation stands still and the pause screen is up. */
  paused: boolean;
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
   * stands on something, the height of the terrain under it, the id of the building it
   * is inside (null outdoors), and the id of the shelter zone it is in (null in the open).
   */
  player: {
    x: number;
    y: number;
    z: number;
    grounded: boolean;
    groundHeight: number;
    inside: string | null;
    shelter: string | null;
    /** Health now (0 to 100), whether the character lies collapsed, and how many times health has run out. */
    health: number;
    dead: boolean;
    deaths: number;
    /** Body temperature (-100 coldest to 0 comfortable) and the stage it makes. */
    temperature: number;
    temperatureStage: "comfortable" | "cold" | "hypothermia";
    /** Thirst: 100 (none) down to 0 (parched). */
    thirst: number;
    /** Id of the container (or other target) the player could use right now; null when there is none. */
    interaction: string | null;
    /** The bag: what is in each slot (null for an empty one), and whether no slot is empty. */
    bag: Array<{ item: string; count: number } | null>;
    bagFull: boolean;
    /** The quick slots: what is on each (null for none), how many of it the bag holds, and whether the slot is marked out. */
    quickSlots: Array<{ item: string; count: number; urgent: boolean } | null>;
    /** The search under way: the container being searched (null if none) and how far along it is, 0 to 1. */
    search: { target: string | null; progress: number };
    /** What is drawn for the character: the model, or the capsule if the model could not be loaded. */
    model: "capsule" | "model";
    /** Id of the character model in the catalog (render/characterCatalog.ts). */
    character: string;
    /** Animation the model is playing; "none" while there is no model. */
    animation: "none" | "idle" | "run" | "jump" | "death";
  };
  /** The zone the player is in: its id, the text key of its name, and how many buildings, props and rocks it has. */
  zone: {
    id: string;
    nameKey: string;
    buildings: number;
    shelterZones: number;
    props: number;
    /** How many props are drawn with a model, whether the rocks are, and which set of models is in use. */
    propModels: number;
    rockModels: boolean;
    propSet: string;
    rocks: number;
    /** How many containers the zone has, and how many targets for interaction are in the world. */
    containers: number;
    interactables: number;
  };
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
   * small to play in, the id of the open window (null if none; of several at the side, the one
   * that is offered keys first), the ids of all open windows, and the selected button (-1 if none).
   */
  ui: { scale: number; tooSmall: boolean; window: string | null; windows: string[]; selectedButton: number };
  /** The game's clock: day (from 1), hour of the day with fractions, part of the day, and how fast it runs (1 is normal). */
  clock: { day: number; hour: number; phase: "day" | "dusk" | "night"; scale: number };
  /**
   * The weather: its phase, how strong the storm is and how near it has come (both 0 to 1),
   * seconds of game time until the next phase (infinite when no storm is ahead today), and the
   * seed that decides each day's storm.
   */
  weather: {
    phase: "clear" | "warning" | "storm" | "fading";
    intensity: number;
    approach: number;
    secondsLeft: number;
    seed: number;
    /** The storm wall: metres south of the player (negative once past), and how solid it looks (0 to 1). */
    wallDistance: number;
    wallOpacity: number;
  };
  /**
   * The sky: how high the sun stands in degrees, how strong the sunlight and the ambient light
   * are, and how far one can see in metres before the haze hides everything.
   */
  sky: { sunElevation: number; sunIntensity: number; ambientIntensity: number; visibility: number };
  /**
   * Sound: whether it is playing ("blocked" until the browser allows it, after the first click
   * or key press), whether it is muted, and the wind's volume (0 to 1) and muffling (everything
   * above this pitch in Hz is cut) as last set, which depend on the weather and on being indoors.
   * `footsteps` counts the footsteps sounded so far.
   */
  audio: { state: AudioState; muted: boolean; windVolume: number; windCutoffHz: number; indoors: boolean; footsteps: number };
  /**
   * What the HUD shows: the storm warning and how much of its bar is left (1 to 0), which edge
   * colours and blinking bars are on, the cause of damage shown, and the compass: the player's
   * heading in degrees and where the shelter's mark sits (-1 left end to 1 right end; `beyond`
   * is -1 or 1 when the shelter is behind and the mark is held at that end).
   */
  hud: {
    storm: "none" | "warning" | "storm";
    stormRemaining: number;
    edges: string[];
    blinking: string[];
    damage: string | null;
    compass: { heading: number; shelterOffset: number; shelterBeyond: number; shelterShown: boolean; bagShown: boolean };
    /** The dot in the middle of the screen, and the prompt under it (what the target lets the player do; null for none). */
    crosshair: "hidden" | "idle" | "target";
    prompt: string | null;
  };
  /**
   * Commands (gameplay/commands.ts): how many have been carried out and how many of those were
   * refused, and what became of the latest one.
   */
  commands: { done: number; refused: number; last: { type: string; ok: boolean; moved: number; reason: string | null } | null };
  /**
   * The containers, by id: whether each has been opened and what is left in it ("scrap 2").
   * `panel` is the id of the container whose panel is open, or null; `seed` decided the contents.
   */
  containers: { byId: Record<string, { opened: boolean; items: string[] }>; panel: string | null; seed: number };
  /** What lies on the ground, thrown out of a bag: each pile's id, where it is, and what is on it ("scrap 2"). */
  piles: Array<{ id: string; x: number; y: number; z: number; items: string[] }>;
  /**
   * Changing zones: "closing" while the picture darkens, "opening" from the moment the new
   * zone is in the world until the picture is back, and how many times a zone has been put up
   * in place of another.
   */
  travel: { state: "none" | "closing" | "opening"; count: number };
  /** The bag a death left behind: the zone it lies in, where, and what is in it ("scrap 2"); null if there is none. */
  droppedBag: { zone: string; x: number; z: number; items: string[] } | null;
  /** What storms have uncovered: how many storms have passed in this game, and what the last one left where ("scrap 346,85"). */
  reveals: { storms: number; last: string[] };
  /** The end screen: whether this game has shown it, whether it is up, and the summary as it would read now. */
  end: { shown: boolean; open: boolean; time: string; days: number; deaths: number };
  /** The introduction: its step ("done" when there is none), the guidance shown (null for none), whether it still protects, and how long it has run. */
  intro: { step: string; guide: string | null; protects: boolean; seconds: number };
  /** The tally of a return to the shelter while it is up (what was brought in, as "scrap 2"), or null. */
  tally: { day: number; brought: string[]; healthRestored: number; delivered: string[] } | null;
  /** The repair of the shelter's door: how many of each material are in, and whether it is done. */
  repair: { scrap: number; cloth: number; tape: number; done: boolean };
  /** Whether the shelter zones are drawn as boxes (development panel). */
  shelterZonesShown: boolean;
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
    paused: false,
    settings: { mouseSensitivity: 1, invertY: false, volume: 0.8, quality: "high", showFps: false, language: null },
    frame: 0,
    tick: 0,
    simSeconds: 0,
    entityCount: 0,
    bodyCount: 0,
    player: { x: 0, y: 0, z: 0, grounded: false, groundHeight: 0, inside: null, shelter: null, health: 0, dead: false, deaths: 0, temperature: 0, temperatureStage: "comfortable", thirst: 0, interaction: null, bag: [], bagFull: false, quickSlots: [], search: { target: null, progress: 0 }, model: "capsule", character: "", animation: "none" },
    zone: { id: "", nameKey: "", buildings: 0, shelterZones: 0, props: 0, propModels: 0, rockModels: false, propSet: "", rocks: 0, containers: 0, interactables: 0 },
    view: { yaw: 0, pitch: 0, looking: false },
    bench: { state: "off", progress: 0, summary: null, withinBudget: null },
    ui: { scale: 1, tooSmall: false, window: null, windows: [], selectedButton: -1 },
    clock: { day: 1, hour: 0, phase: "day", scale: 1 },
    weather: { phase: "clear", intensity: 0, approach: 0, secondsLeft: Number.POSITIVE_INFINITY, seed: 0, wallDistance: 0, wallOpacity: 0 },
    sky: { sunElevation: 0, sunIntensity: 0, ambientIntensity: 0, visibility: 0 },
    audio: { state: "off", muted: false, windVolume: 0, windCutoffHz: 0, indoors: false, footsteps: 0 },
    hud: { storm: "none", stormRemaining: 0, edges: [], blinking: [], damage: null, compass: { heading: 0, shelterOffset: 0, shelterBeyond: 0, shelterShown: true, bagShown: false }, crosshair: "hidden", prompt: null },
    commands: { done: 0, refused: 0, last: null },
    containers: { byId: {}, panel: null, seed: 0 },
    piles: [],
    travel: { state: "none", count: 0 },
    tally: null,
    intro: { step: "done", guide: null, protects: false, seconds: 0 },
    end: { shown: false, open: false, time: "0:00", days: 1, deaths: 0 },
    reveals: { storms: 0, last: [] },
    droppedBag: null,
    repair: { scrap: 0, cloth: 0, tape: 0, done: false },
    shelterZonesShown: false,
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
