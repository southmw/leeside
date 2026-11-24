import { Group } from "three";
import { type Container, createCharacter, createTransform, createWorld } from "./core/ecs";
import { startGameLoop } from "./core/gameLoop";
import { createRandom } from "./core/random";
import { createGameAudio } from "./audio/audio";
import { advanceFootsteps, createFootsteps } from "./audio/footsteps";
import { windMix } from "./audio/windMix";
import { benchCameraAt } from "./bench/benchPath";
import { benchRows, BenchRecorder, judge } from "./bench/benchRecorder";
import { benchRoute, DRY_RIVERBED_STOPS } from "./bench/benchRoute";
import { benchWeather } from "./bench/benchWeather";
import { installDebugApi, TIMED_SECTIONS } from "./debug/debugApi";
import { readDevice } from "./debug/deviceInfo";
import { isWithinBudget, PERF_BUDGETS } from "./debug/perfBudget";
import type { DebugOverlay } from "./debug/debugOverlay";
import type { DevLog } from "./debug/devLog";
import type { ShelterZoneOverlay } from "./debug/shelterZoneOverlay";
import { FrameStats } from "./debug/frameStats";
import { readHeapMb } from "./debug/memory";
import { SectionTimer } from "./debug/sectionTimer";
import {
  CAMERA_COLLISION_RADIUS,
  CAMERA_DISTANCE,
  CAMERA_SHOULDER_OFFSET,
  CHARACTER_HEIGHT,
  CHARACTER_RADIUS,
  FOOTSTEP_STRIDE,
  FOOTSTEP_VOLUME,
  INTERACT_DISTANCE,
  MAX_HEALTH,
  MAX_THIRST,
  MIN_TEMPERATURE,
  MOVE_SPEED,
  REPAIR_NEEDS,
} from "./data/tuning";
import { isItemId, isQuickSlotItem, ITEM_IDS } from "./data/items";
import { broughtBack, countItems, restAtShelter, type ReturnTally } from "./gameplay/expedition";
import { useRefusal } from "./gameplay/itemUse";
import { revealAfterStorm, shortfall, stormJustPassed } from "./gameplay/reveal";
import { createRepair, deliverMaterials, isRepairDone, REPAIR_MATERIALS, repairRows, resetRepair } from "./gameplay/repair";
import { createTallyScreen } from "./ui/tallyScreen";
import { canPause, shouldPauseOnLeave, simulationRuns } from "./app/pause";
import { QUALITY_PRESETS, type Settings, type SettingsStore } from "./app/settings";
import { createPauseScreen } from "./ui/pauseScreen";
import { FEEDBACK_URL } from "./app/links";
import { createPlayRecord, FrameSummary, keepRecord, type PlayEvent, readRecords, recordEvent, type RecordStorage } from "./app/playRecord";
import { createRecordScreen } from "./ui/recordScreen";
import { playSummary } from "./gameplay/summary";
import { createEndScreen } from "./ui/endScreen";
import { clearQuickSlots, createQuickSlots, createQuickUseSystem } from "./gameplay/quickSlots";
import { createPileMesh } from "./render/pileMesh";
import { advanceClock, createClock, parseTimeOfDay, readClock, setHour, startNextDay } from "./gameplay/clock";
import { createDeathScreen } from "./ui/deathScreen";
import { createCommandSystem } from "./gameplay/commands";
import { emptyBagIntoStacks } from "./gameplay/droppedBag";
import { createExposureSystem, createHealth, isDead } from "./gameplay/health";
import { createIntro, introGuide, introProtects, protectedHealth, stepIntro } from "./gameplay/intro";
import { createInteractionSystem } from "./gameplay/interaction";
import { containerState, createSearch, createSearchSystem, searchProgress } from "./gameplay/search";
import { addItems, countOf, createInventory, emptyInventory, parseBag, roomFor, usedSlots } from "./gameplay/inventory";
import { createTemperature, createTemperatureSystem, temperatureStage } from "./gameplay/temperature";
import { createThirst, createThirstSystem } from "./gameplay/thirst";
import { createLookSystem } from "./gameplay/lookSystem";
import { createMovementSystem } from "./gameplay/movementSystem";
import { createShelterSystem } from "./gameplay/shelter";
import { createView, previewLook } from "./gameplay/view";
import { callStorm, calmWeather, createWeather, introStorm, readWeather, stormOfDay, type WeatherReading } from "./gameplay/weather";
import { createEmptyActions, DEFAULT_KEY_BINDINGS, QUICK_ACTIONS } from "./input/actions";
import { createInputSystem } from "./input/inputSystem";
import { createLocalInput } from "./input/localInput";
import { createMouse } from "./input/mouse";
import type { I18n } from "./locales/i18n";
import { createPhysicsSystem } from "./physics/physicsSystem";
import { CHARACTER_SKIN, initPhysics, PhysicsWorld } from "./physics/physicsWorld";
import { easeCameraLength, fitCamera, type Sweep, updateCameraDistance } from "./render/cameraCollision";
import { computeCameraPose } from "./render/cameraRig";
import { titleCameraYaw, TITLE_CAMERA_PITCH, TITLE_CAMERA_RIG } from "./app/titleCamera";
import { applyZoom } from "./render/cameraZoom";
import { createCamera, createRenderer, fitToWindow, warmUpScene } from "./render/renderer";
import { createRenderSync } from "./render/renderSync";
import { createBagWindow } from "./ui/bagWindow";
import { createBenchPanel } from "./ui/benchPanel";
import { type ContainerView, createContainerPanel } from "./ui/containerPanel";
import { createHud } from "./ui/hud";
import { bagView, bearingTo, createDamageCue, headingOf, hudAlerts, interactionCue, keyLabel, type PromptKind, quickBarView, stepDamageCue } from "./ui/hudState";
import { createLookHint } from "./ui/lookHint";
import type { Ui } from "./ui/uiRoot";
import { characterById, CHARACTERS } from "./render/characterCatalog";
import { loadCharacterModel, type CharacterModel } from "./render/characterModel";
import { daylightAt } from "./render/daylight";
import { loadPropModels, type PropModelLibrary } from "./render/propModel";
import { createSky } from "./render/sky";
import { apparentStrength, sceneLook } from "./render/stormLook";
import { createStormParticles } from "./render/stormParticles";
import { stormWallAt } from "./render/stormWall";
import { createCharacterMesh, createTestScene } from "./render/testScene";
import { buildingAt, yawFromDegrees } from "./world/building";
import { numberParam, resolveStart, type StartPoint, zonePlaces } from "./world/startPoint";
import { createHeightfield, heightAt, type Heightfield } from "./world/terrain";
import { PROP_SET_IDS, PROP_SETS, type PropSet, type PropSetId, propModelFor, propModelUrls, propSetId } from "./world/propModels";
import type { ZoneDefinition } from "./world/zoneDefinition";
import { type LoadedZone, loadZone } from "./world/zoneLoader";
import { createZoneState, forgetDroppedBag, putPiles, removeDroppedBag, resetZoneState, takePiles } from "./world/zoneState";
import { isZoneId, loadZones, ZONE_IDS, type ZoneId } from "./world/zones";
import { createZoneVeil } from "./ui/zoneVeil";

/** Performance measurement: how long it lasts by default, and how the camera flies. */
const BENCH_SECONDS = 60;
const BENCH_CAMERA_HEIGHT = 6;
const BENCH_LOOK_AHEAD = 40;
/** How often the play record is written to the browser while nothing in particular happens, in seconds. */
const RECORD_SAVE_SECONDS = 15;
/** How often the frame rate shown in the corner (a setting) is brought up to date, in seconds. */
const FPS_REFRESH_SECONDS = 0.5;

/** The fastest the clock can be made to run with `?timescale` and the development panel. */
const MAX_TIME_SCALE = 600;

/** Limits of the walking speed that `?speed` and the development panel accept, in m/s. */
const MIN_MOVE_SPEED = 1;
const MAX_MOVE_SPEED = 30;

/**
 * How long a character that has collapsed lies there, the picture darkening, before the
 * player is asked whether to go on. Long enough to see the fall. Seconds.
 */
const DEATH_NOTICE_SECONDS = 1.5;
/**
 * The character falls backwards, towards the camera and out of the picture. So the camera
 * draws back to at least this far and looks down at least this steeply (radians), over this
 * many seconds.
 */
const DEATH_CAMERA_DISTANCE = 7;
const DEATH_CAMERA_PITCH = -0.85;
const DEATH_CAMERA_SECONDS = 1;

/** Mixed into the game's seed for the containers' contents, so they have rolls of their own. */
const LOOT_SEED_SALT = 0x9e3779b9;
/** Mixed into the game's seed for what each storm uncovers. */
const REVEAL_SEED_SALT = 0xc2b2ae35;
/** Mixed in once more for each zone after the first, so no two zones are filled alike. */
const ZONE_SEED_STEP = 0x85ebca6b;

/**
 * Changing zones (prototype design 5.5): the picture takes this long to go dark and to come
 * back, and stays dark, with the zone's name on it, for the hold in between. Seconds.
 */
const TRAVEL_FADE_SECONDS = 0.35;
const TRAVEL_HOLD_SECONDS = 0.5;
/** In a zone that is a room the light is that of this hour, whatever the clock says. */
const INDOOR_LIGHT_HOUR = 9;

/** What the key that opens the bag window is called on screen. */
const BAG_KEY_LABEL = "Tab";

/** How far down the ground is looked for under someone who throws a thing out, and how thick the probe is. Metres. */
const DROP_PROBE_DISTANCE = 50;
const DROP_PROBE_RADIUS = 0.1;

/** The id of the player on this machine, by which commands name them. */
const LOCAL_PLAYER_ID = "player_1";

/** The view starts tilted slightly down, so the ground ahead is in sight. Radians. */
const START_PITCH = -0.2;

/** The parts of loading that the title screen's progress bar counts. */
export const LOADING_STEPS = ["physics", "character", "zone"] as const;
export type LoadingStep = (typeof LOADING_STEPS)[number];

/** What the entry point hands to the game. */
export interface GameContext {
  i18n: I18n;
  ui: Ui;
  /** Start conditions from the URL, e.g. `?lang=ko`. */
  startParams: URLSearchParams;
  /** Id of the character to start with (render/characterCatalog.ts). */
  character: string;
  /** The player's settings (app/settings.ts). The game applies them and follows their changes. */
  settings: SettingsStore;
  /** Opens the settings screen; `onBack` is called when the player leaves it. */
  openSettings(onBack: () => void): void;
  /** Called as each part of loading finishes. */
  onProgress(step: LoadingStep): void;
  /**
   * Called when the player gives up and leaves for the title. The game has put itself back
   * to its beginning by then and waits for `start` again.
   */
  onQuit(): void;
  /** Called once the player has come through the introduction, down into the shelter. */
  onIntroDone(): void;
  /** Where the play records are kept (the browser's storage). Without it they last for the visit. */
  recordStorage?: RecordStorage | undefined;
}

export interface RunningGame {
  /**
   * Hands control to the player. Until then the world is drawn behind the title screen with
   * a slowly swaying camera and input is ignored. `skipIntro` starts without the introduction
   * (the player's choice on the title screen).
   */
  start(options?: { skipIntro?: boolean }): void;
  /**
   * Changes what the player looks like. The model is fetched first, so the change shows a
   * moment later; if it cannot be fetched the character stays as it is.
   */
  setCharacter(id: string): Promise<void>;
}

/**
 * Loads everything, starts the loop and resolves once the first frame has been drawn.
 * A performance measurement (`?bench`) runs straight away and never calls for `start`.
 */
export async function bootGame(context: GameContext): Promise<RunningGame> {
  const { i18n, ui, startParams, onProgress } = context;
  const firstCharacter = characterById(context.character).id;
  const canvas = document.querySelector<HTMLCanvasElement>("#game");
  if (!canvas) {
    throw new Error("Missing #game canvas");
  }

  const debug = installDebugApi(i18n.language);
  i18n.onChange((language) => {
    debug.language = language;
  });
  const frameStats = new FrameStats();
  const sectionTimer = new SectionTimer(TIMED_SECTIONS, () => performance.now());

  const renderer = createRenderer(canvas);

  // Development tools: the dynamic imports keep them out of production builds.
  let overlay: DebugOverlay | undefined;
  let devLog: DevLog | undefined;
  if (import.meta.env.DEV) {
    void import("./debug/debugOverlay").then(({ createDebugOverlay }) => {
      overlay = createDebugOverlay(debug, i18n, frameStats, context.settings.get().quality);
    });
    void import("./ui/sampleWindow").then(({ installSampleWindow }) => {
      installSampleWindow(ui, i18n);
    });
    void import("./debug/devLog").then(({ createDevLog }) => {
      devLog = createDevLog(debug, renderer);
    });
  }

  const camera = createCamera();

  const scene = createTestScene();
  const world = createWorld();
  const renderSync = createRenderSync(world, scene);

  // The character model downloads while the physics engine starts up.
  const loadCharacter = (id: string): Promise<CharacterModel> =>
    loadCharacterModel(characterById(id), `${import.meta.env.BASE_URL}models/`, CHARACTER_HEIGHT);
  const characterModelLoading = loadCharacter(firstCharacter).catch((error: unknown) => {
    console.warn("Character model could not be loaded; using the capsule instead.", error);
    return undefined;
  });

  // The physics engine is WebAssembly and has to load before the first step.
  await initPhysics();
  onProgress("physics");
  const physics = new PhysicsWorld();
  const physicsSystem = createPhysicsSystem(world, physics);

  // Prop models are fetched before the zone is built. `?props=boxes` draws props and
  // rocks as plain shapes instead, for comparing looks and performance.
  const zones = loadZones();
  const riverbed = zones.dry_riverbed;
  // `?zone=shelter` starts in the shelter. A measurement always flies round the riverbed.
  const zoneWish = startParams.get("zone");
  const startZoneId: ZoneId = !startParams.has("bench") && isZoneId(zoneWish) ? zoneWish : "dry_riverbed";
  // The zone that is in the world. One at a time (technical design 9).
  let zoneDefinition: ZoneDefinition = zones[startZoneId];
  // One number decides a game's weather and what is in its containers. Each visit has its
  // own unless `?seed=1` fixes it.
  const pickSeed = (): number => numberParam(startParams.get("seed"), 0, 0xffffffff, Date.now() % 0xffffffff);
  let gameSeed = pickSeed();
  // What has happened in each zone (containers opened, what lies on the ground) is kept
  // here, not in the zone, so that it is still there when the zone is put up again.
  const zoneStates = new Map(ZONE_IDS.map((id) => [id, createZoneState(zones[id])] as const));
  const stateOf = (id: string): ReturnType<typeof createZoneState> => {
    const state = isZoneId(id) ? zoneStates.get(id) : undefined;
    if (!state) {
      throw new Error(`No state for zone "${id}"`);
    }
    return state;
  };
  /** The containers of the zone that is in the world. */
  let containerStates: Map<string, Container> = stateOf(zoneDefinition.id).containers;
  const allContainers = (): Array<[string, Container]> => [...zoneStates.values()].flatMap((state) => [...state.containers]);
  const showContainerStates = (): void => {
    debug.containers.seed = gameSeed;
    debug.containers.byId = Object.fromEntries(
      allContainers().map(([id, state]) => [id, { opened: state.opened, items: state.items.map((stack) => `${stack.item} ${stack.count}`) }]),
    );
  };
  /** Puts every zone back to how a game begins: containers filled with the current seed and closed. */
  const fillContainerStates = (): void => {
    ZONE_IDS.forEach((id, index) => {
      // A stream of its own for each zone, so the contents do not follow the weather's rolls.
      resetZoneState(stateOf(id), zones[id], (gameSeed ^ LOOT_SEED_SALT ^ Math.imul(index, ZONE_SEED_STEP)) >>> 0);
    });
    showContainerStates();
  };
  fillContainerStates();
  const propLibraries = new Map<PropSetId, PropModelLibrary>();
  /**
   * Fetches a set's models for every zone at once, so that changing zones never waits for a
   * download and can be done within one step.
   */
  const ensureLibrary = async (set: PropSetId): Promise<void> => {
    if (!propLibraries.has(set)) {
      const everyProp = ZONE_IDS.flatMap((id) => zones[id].props);
      propLibraries.set(set, await loadPropModels(`${import.meta.env.BASE_URL}models/`, propModelUrls(everyProp, set)));
    }
  };
  let propSet: PropSetId = propSetId(startParams.get("props"));
  /** Puts a zone into the world, from its definition and its state. The set's models must have been fetched. */
  const buildZone = (definition: ZoneDefinition, set: PropSetId): LoadedZone => {
    const models = propLibraries.get(set);
    if (!models) {
      throw new Error(`The models of "${set}" have not been loaded`);
    }
    const state = stateOf(definition.id);
    const built = loadZone(definition, physics, scene, {
      world,
      propSet: set,
      propModel: (prop, box) => {
        const model = propModelFor(prop, set);
        return model ? models.create(model, box) : undefined;
      },
      rockModels: (rocks) => models.createRocks(PROP_SETS[set].rocks, rocks),
      pebbleColor: (PROP_SETS[set] as PropSet).pebbleColor,
      containerState: (id) => state.containers.get(id),
    });
    debug.zone.id = definition.id;
    debug.zone.nameKey = definition.nameKey;
    debug.zone.buildings = definition.buildings.length;
    debug.zone.shelterZones = built.shelterZoneCount;
    debug.zone.props = definition.props.length;
    debug.zone.rocks = built.rockCount;
    debug.zone.propModels = built.propModelCount;
    debug.zone.rockModels = built.rocksModelled;
    debug.zone.propSet = set;
    debug.zone.containers = built.containerCount;
    return built;
  };
  await ensureLibrary(propSet);
  let zone = buildZone(zoneDefinition, propSet);
  onProgress("zone");

  // Where the player starts: the zone's start point, or `?at=east,south` and `?face=degrees`
  // (clockwise from north) to start anywhere, for checking a place without walking to it.
  const start = resolveStart(zoneDefinition, startParams.get("at"), startParams.get("face"));
  const PLAYER_START = {
    x: start.east,
    y: heightAt(zone.terrain, start.east, start.south) + CHARACTER_HEIGHT / 2 + CHARACTER_SKIN,
    z: start.south,
  };

  // What the player looks like: the character model, or a capsule if the model could not be
  // loaded (the game is fully playable with it). The game starts only once this is settled, so
  // the capsule never shows for a moment before the model.
  const playerVisual = new Group();
  let characterModel: CharacterModel | undefined;
  // False while the title screen is up: the world is drawn but nobody controls the character.
  let playing = false;
  const showCharacter = (model: CharacterModel | undefined, id: string): void => {
    playerVisual.clear();
    if (model) {
      // The entity's position is the capsule's centre; the model's origin is at its feet.
      model.object.position.y = -(CHARACTER_HEIGHT / 2 + CHARACTER_SKIN);
      // Behind the title the character faces the camera, so the player sees whom they pick.
      model.object.rotation.y = playing || startParams.has("bench") ? 0 : Math.PI;
      playerVisual.add(model.object);
    } else {
      playerVisual.add(createCharacterMesh(CHARACTER_HEIGHT, CHARACTER_RADIUS));
    }
    characterModel = model;
    debug.player.model = model ? "model" : "capsule";
    debug.player.character = id;
  };
  let latestCharacterWish = firstCharacter;
  const setCharacter = async (id: string): Promise<void> => {
    const wanted = characterById(id).id;
    latestCharacterWish = wanted;
    if (wanted === debug.player.character) {
      return;
    }
    try {
      const model = await loadCharacter(wanted);
      // A later choice may have been made while this one was loading.
      if (latestCharacterWish === wanted) {
        showCharacter(model, wanted);
      }
    } catch (error) {
      console.warn(`Character "${wanted}" could not be loaded; keeping the current one.`, error);
    }
  };
  showCharacter(await characterModelLoading, firstCharacter);
  onProgress("character");

  const startYaw = yawFromDegrees(start.facing);
  const player = world.add({
    // The name commands call this player by.
    id: LOCAL_PLAYER_ID,
    localPlayer: true,
    inventory: createInventory(),
    // No item is on a quick slot until the player puts one there.
    quickSlots: createQuickSlots(),
    input: createEmptyActions(),
    character: createCharacter(startYaw),
    view: createView(startYaw, START_PITCH),
    shelter: { zone: null },
    interaction: { target: null },
    search: createSearch(),
    // `?health=10` starts hurt, for seeing what happens at zero without waiting.
    health: createHealth(numberParam(startParams.get("health"), 1, MAX_HEALTH, MAX_HEALTH)),
    // `?temperature=-90` starts chilled, for seeing the cold without standing out a night.
    temperature: createTemperature(numberParam(startParams.get("temperature"), MIN_TEMPERATURE, 0, 0)),
    // `?thirst=5` starts nearly dry, for seeing thirst at work without playing ten minutes.
    thirst: createThirst(numberParam(startParams.get("thirst"), 0, MAX_THIRST, MAX_THIRST)),
    transform: createTransform(PLAYER_START.x, PLAYER_START.y, PLAYER_START.z, startYaw),
    renderable: { object: playerVisual },
    body: { handle: physics.addCharacter(PLAYER_START) },
  });
  // The bag starts empty. `?bag=scrap:7,water_bottle:2` starts with things in it: until
  // containers can be searched (step 2.14) there is no other way to come by any.
  const fillStartBag = (): void => {
    emptyInventory(player.inventory);
    for (const stack of parseBag(startParams.get("bag"))) {
      addItems(player.inventory, stack.item, stack.count);
    }
  };
  fillStartBag();
  // What the bag held when the day's outing began: what it holds more of on the return is
  // what the outing brought in (prototype design 2.3).
  let outingStart = countItems(player.inventory);
  const mouse = createMouse(canvas, document);

  // `?bench` (or `?bench=seconds`) measures performance: the camera flies a fixed route round
  // the zone by itself, so every run sees the same thing, and a result is shown at the end.
  const benchSeconds = startParams.has("bench") ? numberParam(startParams.get("bench"), 1, 600, BENCH_SECONDS) : 0;
  const bench =
    benchSeconds > 0
      ? {
          recorder: new BenchRecorder(benchSeconds),
          route: benchRoute(zoneDefinition, DRY_RIVERBED_STOPS),
          panel: createBenchPanel(i18n),
          reported: false,
        }
      : undefined;
  if (bench) {
    debug.bench.state = "running";
  }

  // The game's clock: day 1, 06:00. `?time=18:00` starts at another hour and `?timescale=30`
  // makes it run faster, for seeing a whole day without waiting eight minutes.
  const newClock = (): ReturnType<typeof createClock> =>
    createClock(parseTimeOfDay(startParams.get("time")), numberParam(startParams.get("timescale"), 0, MAX_TIME_SCALE, 1));
  const clock = newClock();
  // The weather follows the clock too. Each visit has weather of its own unless `?seed=1`
  // fixes it; `?storm=now` starts in a storm and `?storm=warning` with one announced.
  const newWeather = (): ReturnType<typeof createWeather> => createWeather(gameSeed);
  const weather = newWeather();
  const stormWish = startParams.get("storm");
  if (stormWish === "now" || stormWish === "warning") {
    callStorm(weather, clock.elapsed, stormOfDay(weather.seed, readClock(clock).day), stormWish === "warning");
  }
  debug.weather.seed = weather.seed;
  // During a measurement the clock stands still and the weather follows the measurement instead.
  let benchReading: WeatherReading | undefined;
  let latestWeather = readWeather(weather, clock.elapsed);
  const showWeather = (): void => {
    const reading = benchReading ?? readWeather(weather, clock.elapsed);
    latestWeather = reading;
    debug.weather.phase = reading.phase;
    debug.weather.intensity = reading.intensity;
    debug.weather.approach = reading.approach;
    debug.weather.secondsLeft = reading.secondsLeft;
  };
  showWeather();

  // The wind is heard from START on (browsers allow no sound before a click). `?mute` starts
  // without sound, for working on the game with something else playing.
  const audio = createGameAudio(import.meta.env.BASE_URL, context.settings.get().volume, startParams.has("mute"));
  const showAudio = (): void => {
    const indoors = player.shelter.zone !== null;
    const mix = windMix(latestWeather.intensity, latestWeather.approach, indoors);
    audio.setWind(mix);
    debug.audio.state = audio.state;
    debug.audio.muted = audio.muted;
    debug.audio.windVolume = mix.volume;
    debug.audio.windCutoffHz = mix.cutoffHz;
    debug.audio.indoors = indoors;
  };
  // Footsteps: one for every stride of the run animation, and one on landing. Which recording
  // plays is not part of the game's state, so any seed will do.
  const footsteps = createFootsteps();
  const footstepRandom = createRandom(1);
  const lastStepAt = { x: player.transform.x, z: player.transform.z };
  const soundFootsteps = (dt: number): void => {
    const moved = Math.hypot(player.transform.x - lastStepAt.x, player.transform.z - lastStepAt.z);
    lastStepAt.x = player.transform.x;
    lastStepAt.z = player.transform.z;
    const stride = characterModel?.stride ?? FOOTSTEP_STRIDE;
    const step = advanceFootsteps(footsteps, dt, moved, player.character.grounded, stride, footstepRandom);
    if (step) {
      audio.playFootstep(step, FOOTSTEP_VOLUME);
      debug.audio.footsteps += 1;
    }
  };

  // The sky and lights follow the clock.
  const sky = createSky(scene);
  const hud = createHud(ui, i18n);
  const showClock = (): void => {
    const time = readClock(clock);
    debug.clock.day = time.day;
    debug.clock.hour = time.hour;
    debug.clock.phase = time.phase;
    debug.clock.scale = clock.scale;
    hud.update(time);
  };
  showClock();
  // Called once the camera is placed, every frame: the sky is centred on the camera.
  // What the camera looks at: the character, or the camera itself when it follows nobody.
  const cameraFocus = { x: 0, y: 0, z: 0 };
  const stormParticles = createStormParticles();
  scene.add(stormParticles.object);
  let skySeconds = 0;
  const showSky = (): void => {
    // The weather as of the latest step: dust in the air, a dimmer sun, a shorter view, and
    // the wall of the storm on its way.
    // In a room there is no weather to see and the light does not follow the hour.
    const indoors = zoneDefinition.interior !== undefined;
    const intensity = indoors ? 0 : latestWeather.intensity;
    const approach = indoors ? 0 : latestWeather.approach;
    const light = sceneLook(daylightAt(indoors ? INDOOR_LIGHT_HOUR : readClock(clock).hour), intensity, approach);
    const outside = stormWallAt(latestWeather);
    const wall = indoors ? { ...outside, opacity: 0 } : outside;
    sky.update(light, wall, camera, cameraFocus, skySeconds);
    // The first grains fly as the wall draws near; the air fills with them when it breaks.
    const sand = apparentStrength(intensity, approach);
    stormParticles.update(sand, skySeconds, light.dust, renderer.domElement.height, camera.fov);
    debug.weather.wallDistance = wall.distance;
    debug.weather.wallOpacity = wall.opacity;
    debug.sky.visibility = light.fogFar;
    debug.sky.sunElevation = light.sunElevation;
    debug.sky.sunIntensity = light.sunIntensity;
    debug.sky.ambientIntensity = light.ambientIntensity;
  };
  showSky();

  let titleSeconds = 0;
  // How far the camera has gone over to its view of a fallen character, 0 to 1.
  let deathView = 0;
  // The settings (prototype design 7) are applied when the game starts and whenever one changes.
  let settingsNow: Settings = context.settings.get();
  const localInput = createLocalInput({ mouse, look: () => ({ sensitivity: settingsNow.mouseSensitivity, invertY: settingsNow.invertY }) });
  const inputSystem = createInputSystem(world, localInput);
  const lookSystem = createLookSystem(world);
  // `?speed=8` tries a different walking speed (m/s) without changing the tuning file.
  let moveSpeed = numberParam(startParams.get("speed"), MIN_MOVE_SPEED, MAX_MOVE_SPEED, MOVE_SPEED);
  debug.moveSpeed = moveSpeed;
  const movementSystem = createMovementSystem(world, physics, () => moveSpeed);
  const shelterSystem = createShelterSystem(world);
  // Where the player is at the start counts from the first frame on, before any step has run.
  shelterSystem();
  // The "sheltered" sign stands out while a storm is blowing.
  const showShelter = (): void => {
    hud.setShelter(player.shelter.zone !== null, latestWeather.intensity > 0);
    debug.player.shelter = player.shelter.zone;
  };
  // Out in the storm health drains with the storm's strength as of this step.
  const exposureSystem = createExposureSystem(world, () => latestWeather.intensity);
  const showHealth = (): void => {
    hud.setHealth(player.health.current, player.health.max);
    debug.player.health = player.health.current;
  };
  showHealth();
  // At night, out of doors, the body cools; anywhere else it warms up again.
  const temperatureSystem = createTemperatureSystem(world, () => readClock(clock).phase === "night");
  const showTemperature = (): void => {
    const stage = temperatureStage(player.temperature.value);
    hud.setTemperature(player.temperature.value, stage);
    debug.player.temperature = player.temperature.value;
    debug.player.temperatureStage = stage;
  };
  showTemperature();
  // Thirst grows everywhere, all the time.
  const thirstSystem = createThirstSystem(world);
  const showThirst = (): void => {
    hud.setThirst(player.thirst.value, MAX_THIRST);
    debug.player.thirst = player.thirst.value;
  };
  showThirst();
  // The repair of the shelter's door, the prototype's goal. It is the shelter's, not the
  // player's: what has gone in stays in, also through a death.
  const repair = createRepair();
  const showRepair = (): void => {
    debug.repair = { ...repair, done: isRepairDone(repair) };
  };
  showRepair();
  /** The numbers the door's prompt has in it. */
  const repairValues = (): Record<string, number> => ({
    scrap: repair.scrap,
    scrapNeed: REPAIR_NEEDS.scrap,
    cloth: repair.cloth,
    clothNeed: REPAIR_NEEDS.cloth,
    tape: repair.tape,
    tapeNeed: REPAIR_NEEDS.tape,
  });
  // What a storm uncovers (prototype design 4.2): when one has passed, materials lie at four
  // of the riverbed's spots, the ones the repair is short of first. They are piles like the
  // ones thrown out, laid in the zone's state if the zone is not the one in the world.
  const terrains = new Map<string, Heightfield>();
  const terrainOf = (definition: ZoneDefinition): Heightfield => {
    if (definition.id === zoneDefinition.id) {
      return zone.terrain;
    }
    let terrain = terrains.get(definition.id);
    if (!terrain) {
      terrain = createHeightfield(definition.terrain.samples, definition.size, definition.terrain.heights);
      terrains.set(definition.id, terrain);
    }
    return terrain;
  };
  let stormsPassed = 0;
  let lastWeatherPhase = latestWeather.phase;
  const revealThings = (): void => {
    stormsPassed += 1;
    debug.reveals.storms = stormsPassed;
    debug.reveals.last = [];
    // Counted once for all zones, so that two zones with spots do not both fill the same gap.
    const short = shortfall(repair, player.inventory);
    ZONE_IDS.forEach((id, zoneIndex) => {
      const definition = zones[id];
      const seed = (gameSeed ^ REVEAL_SEED_SALT ^ Math.imul(stormsPassed, 0x27d4eb2f) ^ Math.imul(zoneIndex, ZONE_SEED_STEP)) >>> 0;
      const uncovered = revealAfterStorm(definition.revealSpots.length, short, seed).flatMap((reveal, index) => {
        const spot = definition.revealSpots[reveal.spot];
        if (!spot) {
          return [];
        }
        debug.reveals.last.push(`${reveal.item} ${spot[0]},${spot[1]}`);
        return [
          {
            id: `reveal_${stormsPassed}_${index + 1}`,
            x: spot[0],
            y: heightAt(terrainOf(definition), spot[0], spot[1]),
            z: spot[1],
            rotationY: 0,
            items: [{ item: reveal.item, count: 1 }],
          },
        ];
      });
      if (id === zoneDefinition.id) {
        putPiles(world, uncovered);
        showPiles();
      } else {
        stateOf(id).piles.push(...uncovered);
      }
    });
  };
  /** The introduction's state (see `startIntro` below). Over, until a game begins with it. */
  let intro = createIntro(true);
  /** Set while the tally of a return to the shelter is up. Game time stands still meanwhile. */
  let tally: ReturnTally | undefined;
  /**
   * Seconds until the tally comes up, after arriving in the shelter: once the picture is
   * back, not over the zone's name while it fades. Undefined when none is due.
   */
  let tallyDue: number | undefined;
  /** Set while the local player is on the way from one zone to another (see `switchZone` below). */
  let travel: { to: ZoneId; entry: string; seconds: number; switched: boolean } | undefined;
  // Whatever changes the bag asks for it with a command, carried out in the next step.
  /** The height of whatever is under a character, also one in mid-air: where what it lets go of comes to lie. */
  const floorUnder = (actor: { transform?: { x: number; y: number; z: number }; body?: { handle: number } }): number | undefined => {
    if (!actor.transform || !actor.body) {
      return undefined;
    }
    const fall = physics.sweepSphere(actor.transform, { x: 0, y: -1, z: 0 }, DROP_PROBE_DISTANCE, DROP_PROBE_RADIUS, actor.body.handle);
    return fall === undefined ? undefined : actor.transform.y - fall - DROP_PROBE_RADIUS;
  };
  const commands = createCommandSystem(world, { floorUnder });
  /** Where the bag a death left behind lies, if it is in the zone that is in the world. */
  let droppedBagAt: readonly [number, number] | null = null;
  // What lies on the ground: thrown out of a bag, to be picked up again. The piles are the
  // game's, not the zone's, so they are still there when the zone is put up again.
  const piles = world.with("pile", "interactable", "transform");
  const showPiles = (): void => {
    for (const entity of piles) {
      // A pile made by a command has no picture yet.
      if (!entity.renderable) {
        world.addComponent(entity, "renderable", { object: createPileMesh(entity.pile.dropped === true) });
      }
    }
    droppedBagAt = null;
    for (const entity of piles) {
      if (entity.pile.dropped) {
        droppedBagAt = [entity.transform.x, entity.transform.z];
      }
    }
    // The bag may also lie in a zone that is not in the world.
    const elsewhere = [...zoneStates].flatMap(([id, state]) => state.piles.filter((pile) => pile.dropped).map((pile) => ({ zone: id as string, pile })))[0];
    const here = [...piles].find((entity) => entity.pile.dropped);
    debug.droppedBag = here
      ? { zone: zoneDefinition.id, x: here.transform.x, z: here.transform.z, items: here.pile.items.map((stack) => `${stack.item} ${stack.count}`) }
      : elsewhere
        ? { zone: elsewhere.zone, x: elsewhere.pile.x, z: elsewhere.pile.z, items: elsewhere.pile.items.map((stack) => `${stack.item} ${stack.count}`) }
        : null;
    debug.piles = [...piles].map((entity) => ({
      id: entity.interactable.id,
      x: entity.transform.x,
      y: entity.transform.y,
      z: entity.transform.z,
      items: entity.pile.items.map((stack) => `${stack.item} ${stack.count}`),
    }));
  };
  const clearPiles = (): void => {
    for (const entity of [...piles]) {
      world.remove(entity);
    }
    showPiles();
  };
  showPiles();
  const runCommands = (): void => {
    const results = commands.run();
    for (const result of results) {
      // Something did not fit: the bag sign says so.
      if (result.reason === "bag_full") {
        hud.bagRefused();
      }
      debug.commands.done += 1;
      debug.commands.refused += result.ok ? 0 : 1;
      debug.commands.last = { type: result.command.type, ok: result.ok, moved: result.moved, reason: result.reason ?? null };
      const { command } = result;
      // A quick slot's key answers on the slot itself: used, or not.
      if (command.type === "useQuickSlot" && command.actor === LOCAL_PLAYER_ID) {
        hud.quickSlotPressed(command.slot, result.ok);
      }
      // The way out was within reach: the zone changes, behind a dark picture.
      if (result.ok && command.type === "useExit" && command.actor === LOCAL_PLAYER_ID) {
        beginTravel(command.exit);
      }
      // A container the local player has just opened shows what is in it, if anything.
      if (result.ok && command.type === "openContainer" && command.actor === LOCAL_PLAYER_ID) {
        const view = containerView(command.container);
        if (view && view.items.length > 0) {
          containerPanel.open(view, bagView(player.inventory));
        }
      }
      showContainerStates();
    }
    // Only a command makes a pile or takes one away.
    if (results.length > 0) {
      showPiles();
    }
  };
  // The panel of an opened container: what is in it, and taking it.
  const containerPanel = createContainerPanel(ui, i18n, {
    onTake: (container, index) => commands.push({ type: "takeItem", actor: LOCAL_PLAYER_ID, container, index }),
    onTakeAll: (container) => commands.push({ type: "takeAll", actor: LOCAL_PLAYER_ID, container }),
  });
  const containerView = (id: string): ContainerView | undefined => {
    const state = containerStates.get(id);
    return state && {
      id,
      kind: state.kind,
      items: state.items.map((stack) => ({ ...stack, fits: roomFor(player.inventory, stack.item) > 0 })),
    };
  };
  const containers = world.with("container", "interactable", "transform");
  /** Keeps the open panel in step with its container, and closes it when there is no more use for it. */
  const showContainers = (): void => {
    zone.showContainers();
    debug.containers.panel = containerPanel.openId;
    const openId = containerPanel.openId;
    if (openId === null) {
      return;
    }
    const view = containerView(openId);
    let distance = Number.POSITIVE_INFINITY;
    for (const entity of containers) {
      if (entity.interactable.id === openId) {
        distance = Math.hypot(entity.transform.x - player.transform.x, entity.transform.z - player.transform.z);
      }
    }
    // Emptied, walked away from, or the player has collapsed.
    if (!view || view.items.length === 0 || distance > INTERACT_DISTANCE || isDead(player.health)) {
      containerPanel.close();
      return;
    }
    containerPanel.update(view, bagView(player.inventory));
  };
  // What is in the bag is seen in the bag window (Tab); the HUD only says how full it is.
  const bagWindow = createBagWindow(ui, i18n, {
    canOpen: () => playing && !bench && !travel && !tally && !ending && tallyDue === undefined && !isDead(player.health),
    listBeside: () => containerPanel.openId !== null,
    onDiscard: (slot) => commands.push({ type: "discardItem", actor: LOCAL_PLAYER_ID, slot, count: 1 }),
    onUse: (item) => commands.push({ type: "useItem", actor: LOCAL_PLAYER_ID, item }),
    onAssign: (slot, item) => commands.push({ type: "assignQuickSlot", actor: LOCAL_PLAYER_ID, slot, item }),
  });
  const quickKeys = QUICK_ACTIONS.map((action) => keyLabel(DEFAULT_KEY_BINDINGS[action][0] ?? ""));
  const quickUseSystem = createQuickUseSystem(world, (command) => commands.push(command));
  const showBag = (): void => {
    const view = bagView(player.inventory);
    hud.setBag(view, BAG_KEY_LABEL);
    // The window dims what using would waste; the same judgement the command will make.
    const usable = ITEM_IDS.filter((item) => useRefusal(player, item) === null);
    bagWindow.update(view, { quick: player.quickSlots.slots, usable });
    const quick = quickBarView(player.quickSlots.slots, player.inventory, { health: player.health.current, thirst: player.thirst.value });
    hud.setQuickSlots(quick, quickKeys);
    debug.player.bag = view.slots;
    debug.player.bagFull = view.full;
    debug.player.quickSlots = quick;
  };
  showBag();
  // What the player could use right now: the container they stand by and look towards.
  const interactionSystem = createInteractionSystem(world, physics);
  const searchSystem = createSearchSystem(world, (command) => commands.push(command));
  const interactables = world.with("interactable");
  const interactKey = keyLabel(DEFAULT_KEY_BINDINGS.interact[0] ?? "");
  const showInteraction = (): void => {
    const target = player.interaction.target;
    // What E would do depends on the container: search it, open it again, or nothing if it is empty.
    let targetKind: PromptKind | null = null;
    const targetState = target === null ? undefined : containerStates.get(target);
    if (targetState) {
      targetKind = ({ closed: "search", stocked: "open", empty: "empty" } as const)[containerState(targetState)];
    } else if (target !== null) {
      // Not a container: a way out of the zone, or something lying on the ground.
      const way = zoneDefinition.exits.find((exit) => exit.id === target);
      if (way && isZoneId(way.to)) {
        targetKind = `travel_${way.to}`;
      }
      for (const entity of piles) {
        if (entity.interactable.id === target) {
          targetKind = entity.pile.dropped ? "pickup_bag" : "pickup";
        }
      }
      // The shelter's door only tells how far its repair is.
      if (zoneDefinition.props.some((prop) => prop.id === target && prop.kind === "shelter_door")) {
        targetKind = isRepairDone(repair) ? "repair_done" : "repair";
      }
    }
    // The bag window does not hide the prompt: a container can be searched with the bag open.
    const windowOpen = ui.centreWindowId !== null || containerPanel.openId !== null || travel !== undefined;
    const cue = interactionCue({ targetKind, windowOpen, dead: isDead(player.health) });
    // The ring fills while the key is held on a container not yet searched.
    const progress = searchProgress(player.search);
    hud.setInteraction(cue, interactKey, progress, cue.prompt === "repair" ? repairValues() : undefined);
    debug.player.search.target = player.search.target;
    debug.player.search.progress = progress;
    debug.player.interaction = target;
    debug.zone.interactables = interactables.size;
    debug.hud.crosshair = cue.crosshair;
    debug.hud.prompt = cue.prompt;
  };
  showInteraction();
  // Warnings and effects: what the player's situation calls for, worked out each step.
  const damageCue = createDamageCue(player.health.current);
  const showAlerts = (dt: number): void => {
    const hurting = stepDamageCue(damageCue, player.health.current, dt);
    const alerts = hudAlerts({
      weather: latestWeather,
      sheltered: player.shelter.zone !== null,
      health: player.health.current,
      temperatureStage: temperatureStage(player.temperature.value),
      thirst: player.thirst.value,
      hurtBy: hurting ? (player.health.lastHurtBy ?? null) : null,
    });
    // On the way to shelter in the introduction the shelter's mark stands out, storm or not.
    if (intro.step === "shelter" || intro.step === "hatch") {
      alerts.shelterMarked = true;
    }
    hud.setAlerts(alerts);
    debug.hud.storm = alerts.storm?.kind ?? "none";
    debug.hud.stormRemaining = alerts.storm?.kind === "warning" ? alerts.storm.remaining : 0;
    debug.hud.edges = Object.entries(alerts.edges).flatMap(([name, on]) => (on ? [name] : []));
    debug.hud.blinking = Object.entries(alerts.blink).flatMap(([name, on]) => (on ? [name] : []));
    debug.hud.damage = alerts.damage;
  };
  showAlerts(0);

  // The camera's current reach. It shrinks at once when something is in the way and grows back
  // gradually, so it is kept between frames.
  const cameraFit = { distance: CAMERA_DISTANCE, shoulderOffset: CAMERA_SHOULDER_OFFSET };
  /** How far back the player wants the camera, set with the mouse wheel. */
  let wantedCameraDistance = CAMERA_DISTANCE;
  let lastFrameSeconds = 0;
  const cameraSweep: Sweep = (origin, direction, maxDistance) =>
    physics.sweepSphere(origin, direction, maxDistance, CAMERA_COLLISION_RADIUS, player.body.handle);

  const fit = (): void => fitToWindow(renderer, camera, QUALITY_PRESETS[settingsNow.quality].maxPixelRatio);
  fit();
  window.addEventListener("resize", fit);
  const applySettings = (now: Settings): void => {
    const qualityChanged = now.quality !== settingsNow.quality;
    settingsNow = now;
    audio.setVolume(now.volume);
    stormParticles.setShare(QUALITY_PRESETS[now.quality].particleShare);
    if (qualityChanged) {
      fit();
    }
    if (!now.showFps) {
      hud.setFps(null);
    }
    debug.settings = { ...now };
  };
  applySettings(settingsNow);
  context.settings.onChange(applySettings);
  let fpsSeconds = FPS_REFRESH_SECONDS;

  // Everything is drawn once now, so nothing stutters when it first comes into view in play.
  warmUpScene(renderer, scene, camera);

  // Puts the player somewhere else in the zone, facing `facing` degrees clockwise from north.
  const teleport = (east: number, south: number, facing: number): void => {
    const yaw = yawFromDegrees(facing);
    const y = heightAt(zone.terrain, east, south) + CHARACTER_HEIGHT / 2 + CHARACTER_SKIN;
    physics.teleportCharacter(player.body.handle, { x: east, y, z: south });
    player.transform.x = east;
    player.transform.y = y;
    player.transform.z = south;
    player.character.facing = yaw;
    player.character.velocityY = 0;
    player.view.yaw = yaw;
    renderSync.snap(player);
    // The way here was not walked, so it makes no footsteps.
    lastStepAt.x = east;
    lastStepAt.z = south;
  };

  // Where a player who died starts again: at the shelter's entrance, or the zone's start
  // point if the zone has none. Facing east, towards house A's door.
  /** Where the compass marks the shelter: the way into it from the zone in the world, or null inside it. */
  const shelterMark = (): readonly [number, number] | null => zoneDefinition.exits.find((exit) => exit.to === "shelter")?.position ?? null;
  let shelterAt = shelterMark();

  // Changing zones (prototype design 5.5). The zone itself is changed within one step, while
  // the picture is dark: the old one is taken down and its piles written down, the new one
  // put up from its state.
  const veil = createZoneVeil(ui);
  /** Called after a zone has been put up in place of another (development tools redraw what they show). */
  let onZoneChanged: () => void = () => {};
  const switchZone = (to: ZoneId, at: StartPoint): void => {
    stateOf(zoneDefinition.id).piles = takePiles(world);
    zone.unload();
    zoneDefinition = zones[to];
    const arrived = stateOf(to);
    containerStates = arrived.containers;
    zone = buildZone(zoneDefinition, propSet);
    putPiles(world, arrived.piles);
    arrived.piles = [];
    showPiles();
    teleport(at.east, at.south, at.facing);
    shelterSystem();
    shelterAt = shelterMark();
    onZoneChanged();
    // Drawn once now, behind the dark picture, so nothing stutters when it comes into view.
    warmUpScene(renderer, scene, camera);
    debug.travel.count += 1;
  };
  const beginTravel = (exitId: string): void => {
    const way = zoneDefinition.exits.find((exit) => exit.id === exitId);
    if (travel || !way?.entry || !isZoneId(way.to)) {
      return;
    }
    travel = { to: way.to, entry: way.entry, seconds: 0, switched: false };
    bagWindow.close();
    containerPanel.close();
    veil.cover(TRAVEL_FADE_SECONDS);
    debug.travel.state = "closing";
  };
  const advanceTravel = (dt: number): void => {
    if (!travel) {
      return;
    }
    travel.seconds += dt;
    if (!travel.switched && travel.seconds >= TRAVEL_FADE_SECONDS) {
      const target = zones[travel.to];
      const entryId = travel.entry;
      const entry = target.entries.find((candidate) => candidate.id === entryId) ?? target.spawn;
      switchZone(travel.to, { east: entry.position[0], south: entry.position[1], facing: entry.facing });
      travel.switched = true;
      veil.name(i18n.tData(target.nameKey));
      debug.travel.state = "opening";
    }
    if (travel.seconds >= TRAVEL_FADE_SECONDS + TRAVEL_HOLD_SECONDS) {
      const cameIn = zones[travel.to].interior !== undefined;
      travel = undefined;
      veil.reveal(TRAVEL_FADE_SECONDS);
      debug.travel.state = "none";
      // Down in the shelter the day is over: the tally follows as soon as the picture is back.
      if (cameIn) {
        tallyDue = TRAVEL_FADE_SECONDS;
      }
    }
  };
  // The return (prototype design 2.3): the shelter gives rest at once, the tally says what
  // the outing brought in, and moving on from it is the next morning.
  // Where feedback is left: not decided yet (app/links.ts). In development `?feedback=address`
  // stands in for it, so that the buttons can be looked at.
  const feedbackUrl = FEEDBACK_URL || (import.meta.env.DEV ? (startParams.get("feedback") ?? "") : "");
  // The end (prototype design 2.5): once the door is repaired, the morning after says so,
  // sums the game up and lets the player play on. Once per game.
  const endScreen = createEndScreen(ui, i18n, feedbackUrl ? { feedbackUrl } : {});
  /** Real seconds in play in this game, for the summary. */
  let playSeconds = 0;
  let endShown = false;
  /** Set while the end screen is up. Game time stands still meanwhile, as for the tally. */
  let ending = false;
  const showEnd = (): void => {
    const summary = playSummary(playSeconds, readClock(clock).day, debug.player.deaths);
    debug.end = { shown: endShown, open: ending, time: `${summary.minutes}:${summary.seconds}`, days: summary.days, deaths: summary.deaths };
  };
  const openEnd = (): void => {
    endShown = true;
    ending = true;
    endScreen.show(playSummary(playSeconds, readClock(clock).day, debug.player.deaths), () => {
      ending = false;
      showEnd();
    });
    showEnd();
  };
  const endEnding = (): void => {
    ending = false;
    endShown = false;
    playSeconds = 0;
    endScreen.clear();
    showEnd();
  };
  showEnd();
  const tallyScreen = createTallyScreen(ui, i18n);
  const showTally = (): void => {
    debug.tally = tally
      ? {
          day: tally.day,
          brought: tally.brought.map((stack) => `${stack.item} ${stack.count}`),
          healthRestored: tally.healthRestored,
          delivered: tally.repair.filter((row) => row.added > 0).map((row) => `${row.item} ${row.added}`),
        }
      : null;
  };
  const nextDay = (): void => {
    tally = undefined;
    startNextDay(clock);
    // The new day's outing starts with what is in the bag now.
    outingStart = countItems(player.inventory);
    showClock();
    showWeather();
    showTally();
    // The door is done: that is as far as the prototype goes.
    if (isRepairDone(repair) && !endShown) {
      openEnd();
    }
  };
  const openTally = (): void => {
    if (tally || isDead(player.health)) {
      return;
    }
    const restored = restAtShelter(player.health);
    player.temperature.value = 0;
    // Counted before the materials leave the bag for the door.
    const brought = broughtBack(outingStart, countItems(player.inventory));
    const delivered = deliverMaterials(repair, player.inventory);
    tally = {
      day: readClock(clock).day,
      brought,
      // As the health bar counts: whole numbers, rounded up.
      healthRestored: Math.ceil(restored),
      repair: repairRows(repair, delivered),
      repairDone: isRepairDone(repair),
      firstReturn: firstReturnDue,
    };
    firstReturnDue = false;
    note({ type: "return" });
    note({ type: "repair", ...repair, done: isRepairDone(repair) });
    showRepair();
    bagWindow.close();
    containerPanel.close();
    tallyScreen.show(tally, nextDay);
    showTally();
  };
  const advanceTally = (dt: number): void => {
    if (tallyDue === undefined) {
      return;
    }
    tallyDue -= dt;
    if (tallyDue <= 0) {
      tallyDue = undefined;
      openTally();
    }
  };
  const endTally = (): void => {
    tallyDue = undefined;
    tally = undefined;
    tallyScreen.clear();
    showTally();
  };
  const endTravel = (): void => {
    travel = undefined;
    veil.reveal(0);
    debug.travel.state = "none";
  };
  // Death (prototype design 3.4): the character collapses, the picture darkens, and after a
  // moment the player is asked whether to go on or to stop. The world keeps running meanwhile.
  const deathScreen = createDeathScreen(ui, i18n);
  // Set while the player lies collapsed. The choice is made in the window, outside the
  // simulation, and carried out in the next step.
  let death: { seconds: number; asked: boolean; choice?: "continue" | "quit" } | undefined;
  const endDeath = (): void => {
    death = undefined;
    deathScreen.clear();
    debug.player.dead = false;
  };
  // Whoever starts again is whole, warm and has had a drink: starting parched would be dying again.
  const restore = (): void => {
    player.health.current = player.health.max;
    delete player.health.lastHurtBy;
    player.temperature.value = 0;
    player.thirst.value = MAX_THIRST;
  };
  /** Whether a bag left behind by an earlier death still lies somewhere. */
  const droppedBagExists = (): boolean => [...piles].some((entity) => entity.pile.dropped) || [...zoneStates.values()].some((state) => state.piles.some((pile) => pile.dropped));
  // Going on (prototype design 2.4): the bag stays where the character fell, an earlier one
  // is lost, and the next morning begins in the shelter, in full health.
  const respawn = (): void => {
    endDeath();
    removeDroppedBag(world);
    for (const state of zoneStates.values()) {
      forgetDroppedBag(state);
    }
    const carried = emptyBagIntoStacks(player.inventory);
    if (carried.length > 0) {
      const at = player.transform;
      putPiles(world, [
        {
          id: `dropped_bag_${debug.player.deaths}`,
          x: at.x,
          y: floorUnder(player) ?? at.y - CHARACTER_HEIGHT / 2,
          z: at.z,
          rotationY: at.rotationY,
          items: carried,
          dropped: true,
        },
      ]);
    }
    // Nothing is carried any more, so nothing is on a quick slot.
    clearQuickSlots(player.quickSlots);
    const wake = zones.shelter.spawn;
    const wakeAt = { east: wake.position[0], south: wake.position[1], facing: wake.facing };
    if (zoneDefinition.id === "shelter") {
      teleport(wakeAt.east, wakeAt.south, wakeAt.facing);
      showPiles();
    } else {
      // The bag goes into the state of the zone that is left, with whatever else lies there.
      switchZone("shelter", wakeAt);
    }
    restore();
    startNextDay(clock);
    outingStart = countItems(player.inventory);
    shelterSystem();
    showClock();
    showWeather();
  };
  // Stopping: everything goes back to how a visit begins, behind the title screen. Nothing
  // is reloaded, so START can be pressed at once.
  const backToTitle = (): void => {
    endDeath();
    endTravel();
    endTally();
    // The record of the game that ends here is written a last time; the next START begins another.
    saveRecord();
    recording = false;
    pauseScreen.clear();
    paused = false;
    debug.paused = false;
    endIntro();
    endEnding();
    bagWindow.close();
    containerPanel.close();
    playing = false;
    // Back to the zone the game starts in, if it was left.
    if (zoneDefinition.id === startZoneId) {
      teleport(start.east, start.south, start.facing);
    }
    player.view.pitch = START_PITCH;
    restore();
    fillStartBag();
    outingStart = countItems(player.inventory);
    resetRepair(repair);
    showRepair();
    stormsPassed = 0;
    debug.reveals.storms = 0;
    debug.reveals.last = [];
    clearQuickSlots(player.quickSlots);
    clearPiles();
    Object.assign(player.input, createEmptyActions());
    Object.assign(clock, newClock());
    delete weather.called;
    delete weather.calmDay;
    // A new game: other weather, and the containers filled afresh.
    gameSeed = pickSeed();
    fillContainerStates();
    if (zoneDefinition.id !== startZoneId) {
      switchZone(startZoneId, start);
    }
    Object.assign(weather, newWeather());
    debug.weather.seed = weather.seed;
    debug.player.deaths = 0;
    wantedCameraDistance = CAMERA_DISTANCE;
    titleSeconds = 0;
    if (characterModel) {
      characterModel.object.rotation.y = Math.PI;
    }
    hud.setVisible(false);
    shelterSystem();
    showClock();
    showWeather();
    context.onQuit();
  };
  // The play record (prototype design 2.6): what happens in this game and how well it runs,
  // kept in the browser for the player to hand over. A game is from START to quitting.
  let record = createPlayRecord(new Date().toISOString(), navigator.userAgent, i18n.language);
  let recordFrames = new FrameSummary();
  let recordSaveIn = RECORD_SAVE_SECONDS;
  /** Whether a game is under way whose record is to be kept. */
  let recording = false;
  const saveRecord = (): void => {
    if (!recording) {
      return;
    }
    record.playSeconds = Math.round(playSeconds);
    record.day = readClock(clock).day;
    record.language = i18n.language;
    record.loadMs = debug.loadMs;
    record.performance = { ...recordFrames.summary(), quality: settingsNow.quality, gpu: readDevice(renderer).gpu, buffer: `${canvas.width}x${canvas.height}` };
    const kept = keepRecord(context.recordStorage, record);
    recordSaveIn = RECORD_SAVE_SECONDS;
    debug.record = { ...record, deaths: record.deaths.map((death) => ({ ...death })), kept: kept.length };
  };
  const note = (event: PlayEvent): void => {
    if (recording) {
      recordEvent(record, event, playSeconds, readClock(clock).day);
      saveRecord();
    }
  };
  const beginRecord = (): void => {
    record = createPlayRecord(new Date().toISOString(), navigator.userAgent, i18n.language);
    recordFrames = new FrameSummary();
    recording = true;
    saveRecord();
  };
  // The page going away is the last chance to write down where the game got to.
  window.addEventListener("pagehide", saveRecord);
  const recordScreen = createRecordScreen(ui, i18n, {
    current: () => {
      saveRecord();
      return record;
    },
    exportText: () => JSON.stringify(readRecords(context.recordStorage), null, 2),
  });

  // The introduction (prototype design 5.4): a storm announced at the start, a line of
  // guidance for each step of the way to the shelter, and two minutes in which the storm
  // cannot kill. It runs for a game begun from the title; `?skipIntro` and the title's own
  // switch leave it out, and a visit without the title (`?skipTitle`) has none unless `?intro` asks.
  const introAllowed = !bench && (startParams.has("intro") || (!startParams.has("skipTitle") && !startParams.has("skipIntro")));
  /** Set when a game has had the introduction, until the tally of the first return has said what the repair is for. */
  let firstReturnDue = false;
  const introTrunk = riverbed.containers.find((container) => container.contents !== undefined)?.id;
  const introAt = { x: player.transform.x, z: player.transform.z };
  const showIntro = (): void => {
    const guide = introGuide(intro);
    hud.setGuide(guide ? i18n.t(`intro.${guide}`) : null);
    debug.intro = { step: intro.step, guide, protects: introProtects(intro), seconds: intro.seconds };
  };
  const startIntro = (): void => {
    intro = createIntro(false);
    firstReturnDue = true;
    introAt.x = player.transform.x;
    introAt.z = player.transform.z;
    // The storm of the introduction, and no other that day. The player starts looking at it.
    callStorm(weather, clock.elapsed, introStorm(clock.elapsed));
    weather.calmDay = readClock(clock).day;
    player.view.yaw = yawFromDegrees(180);
    showWeather();
    showIntro();
  };
  const endIntro = (): void => {
    intro = createIntro(true);
    firstReturnDue = false;
    showIntro();
  };
  const advanceIntro = (dt: number): void => {
    if (intro.step === "done") {
      return;
    }
    const movedNow = Math.hypot(player.transform.x - introAt.x, player.transform.z - introAt.z);
    introAt.x = player.transform.x;
    introAt.z = player.transform.z;
    const carriesUsable = ITEM_IDS.some((item) => isQuickSlotItem(item) && countOf(player.inventory, item) > 0);
    stepIntro(
      intro,
      {
        movedNow,
        trunkSearched: introTrunk !== undefined && stateOf(riverbed.id).containers.get(introTrunk)?.opened === true,
        stormApproach: latestWeather.approach,
        stormHere: latestWeather.phase === "storm",
        indoors: zoneDefinition.id === riverbed.id && player.shelter.zone !== null,
        inShelter: zoneDefinition.interior !== undefined,
        couldUseQuickSlot: carriesUsable && player.quickSlots.slots.every((slot) => slot === null),
      },
      dt,
    );
    if ((intro.step as string) === "done") {
      context.onIntroDone();
      note({ type: "tutorialDone" });
    }
    showIntro();
  };
  showIntro();

  // Pausing (UI design 10): Escape with nothing else open, or the page losing the player's
  // attention. Nothing in the game moves on until the player comes back from the pause screen.
  let paused = false;
  const pauseScreen = createPauseScreen(ui, i18n, {
    openSettings: context.openSettings,
    openRecord: (onBack) => recordScreen.open(onBack),
    ...(feedbackUrl ? { feedbackUrl } : {}),
    onResume: () => {
      paused = false;
      debug.paused = false;
      // What the mouse and keys did meanwhile is not the game's.
      localInput.sample();
    },
    onRestart: () => {
      paused = false;
      debug.paused = false;
      backToTitle();
    },
  });
  const pause = (): void => {
    paused = true;
    debug.paused = true;
    Object.assign(player.input, createEmptyActions());
    pauseScreen.open();
  };
  window.addEventListener("keydown", (event) => {
    // A window that is open has had the key already: Escape closes it, and never gets here.
    const situation = { playing: playing && !bench, windowOpen: ui.openWindowId !== null, travelling: travel !== undefined || tallyDue !== undefined, paused };
    if (event.code === "Escape" && !event.repeat && canPause(situation)) {
      event.preventDefault();
      pause();
    }
  });
  const pauseOnLeave = (): void => {
    // Automated checks run in a browser whose window loses the focus whenever something else
    // on the machine takes it (the screen locking is enough); a game that paused itself then
    // would stall them at random. They set this mark and take it away where pausing is checked.
    if (import.meta.env.DEV && (window as { __leesideStayAwake?: boolean }).__leesideStayAwake) {
      return;
    }
    const situation = { playing: playing && !bench, centreWindowOpen: ui.centreWindowId !== null, travelling: travel !== undefined || tallyDue !== undefined, paused };
    if (shouldPauseOnLeave(situation)) {
      pause();
    }
  };
  window.addEventListener("blur", pauseOnLeave);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      pauseOnLeave();
    }
  });

  const advanceDeath = (dt: number): void => {
    if (!death) {
      death = { seconds: 0, asked: false };
      bagWindow.close();
      containerPanel.close();
      debug.player.deaths += 1;
      debug.player.dead = true;
      note({ type: "death", cause: player.health.lastHurtBy ?? "storm", zone: zoneDefinition.id, east: player.transform.x, south: player.transform.z });
      deathScreen.darken(DEATH_NOTICE_SECONDS);
    }
    const dying = death;
    dying.seconds += dt;
    if (!dying.asked && dying.seconds >= DEATH_NOTICE_SECONDS) {
      dying.asked = true;
      deathScreen.ask(
        player.health.lastHurtBy ?? "storm",
        {
          onContinue: () => {
            dying.choice = "continue";
          },
          onQuit: () => {
            dying.choice = "quit";
          },
        },
        { left: usedSlots(player.inventory) > 0, replaced: droppedBagExists() },
      );
    }
    if (dying.choice === "continue") {
      respawn();
    } else if (dying.choice === "quit") {
      backToTitle();
    }
  };

  // Development panel (F2): everything the start conditions do, changed on screen instead.
  if (import.meta.env.DEV && !bench) {
    void Promise.all([import("./debug/devPanel"), import("./debug/shelterZoneOverlay")]).then(([{ createDevPanel }, { createShelterZoneOverlay }]) => {
      const shelterZones: ShelterZoneOverlay = createShelterZoneOverlay(world, scene);
      onZoneChanged = () => shelterZones.refresh();
      createDevPanel(ui, i18n, {
        characters: CHARACTERS.map((character) => character.id),
        character: () => debug.player.character,
        setCharacter: (id) => setCharacter(id),
        propSets: PROP_SET_IDS,
        propSet: () => debug.zone.propSet,
        setPropSet: async (set) => {
          propSet = propSetId(set);
          await ensureLibrary(propSet);
          // The old zone goes first, so its colliders are not in the way of the new ones.
          zone.unload();
          zone = buildZone(zoneDefinition, propSet);
          shelterZones.refresh();
          warmUpScene(renderer, scene, camera);
        },
        zones: ZONE_IDS,
        zone: () => zoneDefinition.id,
        // Straight there, without the dark picture: to the zone's own start point.
        goToZone: (id) => {
          if (isZoneId(id) && id !== zoneDefinition.id && !travel) {
            const { position, facing } = zones[id].spawn;
            switchZone(id, { east: position[0], south: position[1], facing });
          }
        },
        moveSpeed: () => moveSpeed,
        setMoveSpeed: (speed) => {
          moveSpeed = Math.min(Math.max(speed, MIN_MOVE_SPEED), MAX_MOVE_SPEED);
          debug.moveSpeed = moveSpeed;
        },
        defaultMoveSpeed: MOVE_SPEED,
        clock: () => readClock(clock),
        setHour: (hour) => {
          setHour(clock, hour);
          showClock();
        },
        timeScale: () => clock.scale,
        setTimeScale: (scale) => {
          clock.scale = Math.min(Math.max(scale, 0), MAX_TIME_SCALE);
          showClock();
        },
        weather: () => readWeather(weather, clock.elapsed),
        callStorm: (warning) => {
          callStorm(weather, clock.elapsed, stormOfDay(weather.seed, readClock(clock).day), warning);
          showWeather();
        },
        calmWeather: () => {
          calmWeather(weather, clock.elapsed);
          showWeather();
        },
        audio: () => ({ state: audio.state, muted: audio.muted }),
        setMuted: (muted) => {
          audio.setMuted(muted);
          showAudio();
        },
        health: () => player.health.current,
        setHealth: (health) => {
          player.health.current = Math.min(Math.max(health, 0), player.health.max);
          showHealth();
        },
        maxHealth: MAX_HEALTH,
        thirst: () => player.thirst.value,
        setThirst: (value) => {
          player.thirst.value = Math.min(Math.max(value, 0), MAX_THIRST);
          showThirst();
        },
        temperature: () => player.temperature.value,
        setTemperature: (value) => {
          player.temperature.value = Math.min(Math.max(value, MIN_TEMPERATURE), 0);
          showTemperature();
        },
        items: ITEM_IDS,
        bag: () => ({ used: usedSlots(player.inventory), size: player.inventory.slots.length }),
        giveItem: (id) => {
          if (isItemId(id)) {
            commands.push({ type: "giveItem", actor: LOCAL_PLAYER_ID, item: id, count: 1 });
          }
        },
        discardLast: () => {
          let last = player.inventory.slots.length - 1;
          while (last >= 0 && !player.inventory.slots[last]) {
            last -= 1;
          }
          if (last >= 0) {
            commands.push({ type: "discardItem", actor: LOCAL_PLAYER_ID, slot: last, count: 1 });
          }
        },
        emptyBag: () => {
          // Gone, not laid on the ground: emptying the bag is for starting a check afresh.
          player.inventory.slots.forEach((slot, index) => {
            if (slot) {
              commands.push({ type: "destroyItem", actor: LOCAL_PLAYER_ID, slot: index, count: slot.count });
            }
          });
        },
        containers: () => ({
          count: allContainers().length,
          opened: allContainers().filter(([, state]) => state.opened).length,
        }),
        refillContainers: () => {
          // Development only: other contents without starting the game again.
          gameSeed = (gameSeed + 1) >>> 0;
          containerPanel.close();
          fillContainerStates();
        },
        repair: () => ({ ...repair }),
        resetRepair: () => {
          resetRepair(repair);
          showRepair();
        },
        // One short of each material: the next return with one of each finishes the door.
        almostRepair: () => {
          for (const material of REPAIR_MATERIALS) {
            repair[material] = REPAIR_NEEDS[material] - 1;
          }
          showRepair();
        },
        intro: () => intro.step,
        // The introduction from here on: its storm is announced now and its guidance starts over.
        startIntro: () => {
          if (playing && !tally && !travel) {
            startIntro();
          }
        },
        skipIntro: () => endIntro(),
        // The return without the walk: into the shelter if need be, and the tally comes up.
        returnToShelter: () => {
          if (travel || tally || !playing) {
            return;
          }
          if (!zoneDefinition.interior) {
            const entry = zones.shelter.entries[0] ?? zones.shelter.spawn;
            switchZone("shelter", { east: entry.position[0], south: entry.position[1], facing: entry.facing });
          }
          openTally();
        },
        shelterZonesShown: () => shelterZones.visible,
        showShelterZones: (shown) => {
          shelterZones.setVisible(shown);
          debug.shelterZonesShown = shown;
        },
        // The places are the riverbed's: going to one from the shelter goes outside first.
        places: zonePlaces(riverbed),
        // Where a trunk is depends on the set of models in use, so the place is worked out afresh.
        goTo: (place) => {
          const now = zonePlaces(riverbed, propSet).find((candidate) => candidate.id === place.id) ?? place;
          if (zoneDefinition.id === riverbed.id) {
            teleport(now.east, now.south, now.facing);
          } else if (!travel) {
            switchZone("dry_riverbed", now);
          }
        },
      });
    });
  }

  let firstFrameDrawn: () => void = () => {};
  const firstFrame = new Promise<void>((resolve) => {
    firstFrameDrawn = resolve;
  });

  startGameLoop({
    onFrame(frameMs, nowMs) {
      lastFrameSeconds = frameMs / 1000;
      frameStats.add(frameMs);
      overlay?.update(nowMs);
      devLog?.update(nowMs);
      // The frame rate in the corner, for those who asked for it: a figure that can be read, not one that flickers.
      // The play record counts the frames of play, not those behind the title or a pause.
      if (recording && playing && !paused) {
        recordFrames.add(frameMs);
        recordSaveIn -= lastFrameSeconds;
        if (recordSaveIn <= 0) {
          saveRecord();
        }
      }
      fpsSeconds += lastFrameSeconds;
      if (settingsNow.showFps && fpsSeconds >= FPS_REFRESH_SECONDS) {
        fpsSeconds = 0;
        hud.setFps(frameStats.snapshot().fps);
      }
    },
    update(dt) {
      // Paused, nothing moves on: no input, no clock, no weather, no harm.
      if (!simulationRuns(paused)) {
        return;
      }
      sectionTimer.begin("sim");
      renderSync.capture();
      // During a measurement nobody plays: the character stands still and the camera flies itself.
      if (playing && !bench) {
        inputSystem();
        // On the way to another zone the character stands still. The keys are still read, so
        // that one held down through the change does not count as pressed again after it.
        playSeconds += dt;
        if (travel || tally || ending || tallyDue !== undefined) {
          Object.assign(player.input, createEmptyActions(), { interact: player.input.interact });
        }
      }
      runCommands();
      advanceTravel(dt);
      advanceTally(dt);
      lookSystem();
      movementSystem(dt);
      physicsSystem.update();
      shelterSystem();
      // Behind the title and during a measurement there is nobody to use anything.
      if (playing && !bench) {
        interactionSystem();
        searchSystem(dt);
        quickUseSystem();
      } else {
        player.interaction.target = null;
        Object.assign(player.search, createSearch());
      }
      // Time stands still behind the title, during a measurement, and while the tally is up.
      if (playing && !bench && !tally && !ending) {
        advanceClock(clock, dt);
      }
      sectionTimer.end("sim");
      showClock();
      if (bench) {
        benchReading = benchWeather(bench.recorder.progress, benchSeconds);
      }
      showWeather();
      // A storm that has passed leaves things uncovered: also one that ended while the night
      // was skipped, or that a development tool called off.
      if (playing && !bench && stormJustPassed(lastWeatherPhase, latestWeather.phase)) {
        revealThings();
      }
      lastWeatherPhase = latestWeather.phase;
      // The storm hurts in game time: not behind the title, nor while the clock is stopped.
      if (playing && !bench && !tally && !ending) {
        const healthBefore = player.health.current;
        exposureSystem(dt * clock.scale);
        temperatureSystem(dt * clock.scale);
        thirstSystem(dt * clock.scale);
        // In its first two minutes the introduction does not let the storm kill.
        player.health.current = protectedHealth(player.health.current, healthBefore, introProtects(intro));
        if (isDead(player.health)) {
          advanceDeath(dt);
        } else if (death) {
          // Brought back by a development tool.
          endDeath();
        }
      }
      // Also while the tally is up: arriving in the shelter is what ends the introduction.
      if (playing && !bench) {
        advanceIntro(dt);
      }
      showAudio();
      showShelter();
      showHealth();
      showTemperature();
      showThirst();
      showInteraction();
      showBag();
      showContainers();
      showAlerts(dt);
      if (playing && !bench) {
        soundFootsteps(dt);
      }

      Object.assign(debug.input, player.input);
      debug.player.x = player.transform.x;
      debug.player.y = player.transform.y;
      debug.player.z = player.transform.z;
      debug.player.grounded = player.character.grounded;
      debug.player.groundHeight = heightAt(zone.terrain, player.transform.x, player.transform.z);
      debug.player.inside = buildingAt(zoneDefinition.buildings, player.transform.x, player.transform.z)?.id ?? null;
      debug.view.yaw = player.view.yaw;
      debug.view.pitch = player.view.pitch;
      debug.view.looking = mouse.looking;
      debug.camera.distance = cameraFit.distance;
      debug.camera.wantedDistance = wantedCameraDistance;
      debug.camera.y = camera.position.y;
      debug.tick += 1;
      debug.simSeconds += dt;
    },
    render(alpha) {
      sectionTimer.begin("render");
      renderSync.sync(alpha);
      const dead = playing && isDead(player.health);
      if (characterModel) {
        const moving = !dead && (player.input.moveX !== 0 || player.input.moveY !== 0);
        characterModel.update(lastFrameSeconds, {
          dead,
          moving,
          speed: moveSpeed,
          grounded: player.character.grounded,
          velocityY: player.character.velocityY,
        });
        debug.player.animation = characterModel.animation;
      }
      // The camera follows the character where it is drawn, not where the simulation has it,
      // and shows mouse movement that the next step has yet to apply.
      const drawnAt = player.renderable.object.position;
      // Paused, the view stays where it was, whatever the mouse does.
      const pending = paused ? { lookX: 0, lookY: 0 } : localInput.pendingLook();
      const looked = previewLook(player.view, pending.lookX, pending.lookY);
      // Behind the title screen the camera sways slowly instead of following the mouse.
      titleSeconds += playing ? 0 : lastFrameSeconds;
      const yaw = playing ? looked.yaw : titleCameraYaw(startYaw, titleSeconds);
      // Starting again is a cut, so the view of the fallen character is dropped at once.
      deathView = dead ? Math.min(deathView + lastFrameSeconds / DEATH_CAMERA_SECONDS, 1) : 0;
      const deathEase = deathView * deathView * (3 - 2 * deathView);
      const playPitch = looked.pitch + (Math.min(looked.pitch, DEATH_CAMERA_PITCH) - looked.pitch) * deathEase;
      const pitch = playing ? playPitch : TITLE_CAMERA_PITCH;
      // The compass turns with the view as it is drawn, and points from where the character is drawn.
      if (playing) {
        const heading = headingOf(yaw);
        const mark = hud.setCompass(
          heading,
          shelterAt ? bearingTo(drawnAt.x, drawnAt.z, shelterAt[0], shelterAt[1]) : null,
          droppedBagAt
            ? { bearing: bearingTo(drawnAt.x, drawnAt.z, droppedBagAt[0], droppedBagAt[1]), metres: Math.hypot(droppedBagAt[0] - drawnAt.x, droppedBagAt[1] - drawnAt.z) }
            : null,
        );
        debug.hud.compass.bagShown = droppedBagAt !== null;
        debug.hud.compass.bagBeyond = mark.bag?.beyond ?? 0;
        debug.hud.compass.shelterShown = shelterAt !== null;
        debug.hud.compass.heading = heading;
        debug.hud.compass.shelterOffset = mark.offset;
        debug.hud.compass.shelterBeyond = mark.beyond;
      }
      // With a container's panel open the wheel goes through its list instead of moving the camera.
      const wheel = mouse.takeWheel();
      if (containerPanel.openId !== null) {
        containerPanel.scroll(wheel);
      } else {
        wantedCameraDistance = applyZoom(wantedCameraDistance, wheel);
      }
      // The distance eases out by itself (updateCameraDistance), as it does after an obstacle.
      const reach = dead ? Math.max(wantedCameraDistance, DEATH_CAMERA_DISTANCE) : wantedCameraDistance;
      const fit = fitCamera(drawnAt, yaw, pitch, cameraSweep, reach);
      cameraFit.shoulderOffset = easeCameraLength(cameraFit.shoulderOffset, fit.shoulderOffset, lastFrameSeconds);
      // Where the camera would be if it stayed at its current distance, and whether that spot is free.
      const stayed = computeCameraPose(drawnAt, yaw, pitch, cameraFit).position;
      const blockedHere = physics.overlapsSphere(stayed, CAMERA_COLLISION_RADIUS, player.body.handle);
      cameraFit.distance = updateCameraDistance(cameraFit.distance, fit.distance, blockedHere, lastFrameSeconds);
      // Behind the title the camera stands back and well to the right, which puts the character
      // in the left part of the picture and leaves the middle to the title.
      const pose = computeCameraPose(drawnAt, yaw, pitch, playing ? cameraFit : TITLE_CAMERA_RIG);
      camera.position.set(pose.position.x, pose.position.y, pose.position.z);
      camera.lookAt(pose.target.x, pose.target.y, pose.target.z);
      if (bench) {
        const flight = benchCameraAt(bench.route, bench.recorder.progress, BENCH_LOOK_AHEAD);
        camera.position.set(
          flight.position.x,
          heightAt(zone.terrain, flight.position.x, flight.position.z) + BENCH_CAMERA_HEIGHT,
          flight.position.z,
        );
        camera.lookAt(flight.target.x, heightAt(zone.terrain, flight.target.x, flight.target.z) + 1.5, flight.target.z);
      }
      const focus = bench ? camera.position : drawnAt;
      cameraFocus.x = focus.x;
      cameraFocus.y = focus.y;
      cameraFocus.z = focus.z;
      skySeconds += lastFrameSeconds;
      showSky();
      renderer.render(scene, camera);
      sectionTimer.end("render");
      sectionTimer.endFrame();

      // renderer.info counts reset on every render call, so read them straight afterwards.
      const { render, memory } = renderer.info;
      Object.assign(debug.stats, frameStats.snapshot(), {
        drawCalls: render.calls,
        triangles: render.triangles,
        geometries: memory.geometries,
        textures: memory.textures,
        sections: sectionTimer.snapshot(),
        heapMb: readHeapMb(),
      });

      if (bench && !bench.reported) {
        bench.recorder.add({
          frameMs: lastFrameSeconds * 1000,
          drawCalls: render.calls,
          triangles: render.triangles,
          simMs: debug.stats.sections.sim.ms,
          renderMs: debug.stats.sections.render.ms,
        });
        debug.bench.progress = bench.recorder.progress;
        bench.panel.showProgress(bench.recorder.progress);
        if (bench.recorder.done) {
          bench.reported = true;
          const summary = bench.recorder.summary();
          const verdict = judge(summary, PERF_BUDGETS[settingsNow.quality]);
          debug.bench.state = "done";
          debug.bench.summary = summary;
          debug.bench.withinBudget = isWithinBudget(verdict);
          bench.panel.showResult({
            rows: benchRows(summary, verdict),
            withinBudget: isWithinBudget(verdict),
            qualityKey: `quality.${settingsNow.quality}`,
            device: readDevice(renderer),
            buffer: `${canvas.width} x ${canvas.height}`,
          });
        }
      }

      debug.frame += 1;
      debug.entityCount = world.entities.length;
      debug.bodyCount = physics.bodyCount;
      debug.canvas.width = canvas.width;
      debug.canvas.height = canvas.height;
      // Read every frame, not every step: windows open and close while the game is paused too.
      debug.ui.scale = ui.scale;
      debug.ui.tooSmall = ui.tooSmall;
      debug.ui.window = ui.openWindowId;
      debug.ui.windows = ui.openWindowIds;
      debug.ui.selectedButton = ui.selectedButton;
      debug.phase = bench ? "bench" : playing ? "playing" : "title";
      // The first frame drawn is when the game can be started: how long the visitor waited for it.
      if (!debug.ready) {
        debug.loadMs = Math.round(performance.now());
      }
      debug.ready = true;
      firstFrameDrawn();
    },
  });

  await firstFrame;
  let lookHintShown = false;
  return {
    start(options = {}): void {
      if (playing || bench) {
        return;
      }
      playing = true;
      beginRecord();
      const withIntro = introAllowed && !options.skipIntro;
      if (withIntro) {
        startIntro();
      }
      // The character turns its back to the camera again, the way it faces in play.
      if (characterModel) {
        characterModel.object.rotation.y = 0;
      }
      hud.setVisible(true);
      // Once: the game can be started again after quitting to the title.
      // The introduction says how to look round itself.
      if (!lookHintShown && !withIntro) {
        lookHintShown = true;
        createLookHint(mouse, i18n);
      }
      audio.start();
    },
    setCharacter,
  };
}
