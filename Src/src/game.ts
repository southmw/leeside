import { Group } from "three";
import { createCharacter, createTransform, createWorld } from "./core/ecs";
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
  DEFAULT_VOLUME,
  FOOTSTEP_STRIDE,
  FOOTSTEP_VOLUME,
  MOVE_SPEED,
} from "./data/tuning";
import { advanceClock, createClock, parseTimeOfDay, readClock, setHour } from "./gameplay/clock";
import { createLookSystem } from "./gameplay/lookSystem";
import { createMovementSystem } from "./gameplay/movementSystem";
import { createShelterSystem } from "./gameplay/shelter";
import { createView, previewLook } from "./gameplay/view";
import { callStorm, calmWeather, createWeather, readWeather, stormOfDay, type WeatherReading } from "./gameplay/weather";
import { createEmptyActions } from "./input/actions";
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
import { createBenchPanel } from "./ui/benchPanel";
import { createHud } from "./ui/hud";
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
import { numberParam, resolveStart, zonePlaces } from "./world/startPoint";
import { heightAt } from "./world/terrain";
import { PROP_SET_IDS, PROP_SETS, type PropSet, type PropSetId, propModelFor, propModelUrls, propSetId } from "./world/propModels";
import { type LoadedZone, loadZone } from "./world/zoneLoader";
import { loadDryRiverbed } from "./world/zones/dryRiverbed";

/** Performance measurement: how long it lasts by default, and how the camera flies. */
const BENCH_SECONDS = 60;
const BENCH_CAMERA_HEIGHT = 6;
const BENCH_LOOK_AHEAD = 40;
/** The budget results are judged against, until the quality setting exists (step 2.22). */
const BENCH_QUALITY = "high";

/** The fastest the clock can be made to run with `?timescale` and the development panel. */
const MAX_TIME_SCALE = 600;

/** Limits of the walking speed that `?speed` and the development panel accept, in m/s. */
const MIN_MOVE_SPEED = 1;
const MAX_MOVE_SPEED = 30;

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
  /** Called as each part of loading finishes. */
  onProgress(step: LoadingStep): void;
}

export interface RunningGame {
  /**
   * Hands control to the player. Until then the world is drawn behind the title screen with
   * a slowly swaying camera and input is ignored.
   */
  start(): void;
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
      overlay = createDebugOverlay(debug, i18n, frameStats);
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
  const riverbed = loadDryRiverbed();
  const zoneDefinition = riverbed;
  const propLibraries = new Map<PropSetId, PropModelLibrary>();
  const buildZone = async (set: PropSetId): Promise<LoadedZone> => {
    let library = propLibraries.get(set);
    if (!library) {
      library = await loadPropModels(`${import.meta.env.BASE_URL}models/`, propModelUrls(riverbed.props, set));
      propLibraries.set(set, library);
    }
    const models = library;
    const built = loadZone(riverbed, physics, scene, {
      world,
      propSet: set,
      propModel: (prop, box) => {
        const model = propModelFor(prop, set);
        return model ? models.create(model, box) : undefined;
      },
      rockModels: (rocks) => models.createRocks(PROP_SETS[set].rocks, rocks),
      pebbleColor: (PROP_SETS[set] as PropSet).pebbleColor,
    });
    debug.zone.id = zoneDefinition.id;
    debug.zone.nameKey = zoneDefinition.nameKey;
    debug.zone.buildings = zoneDefinition.buildings.length;
    debug.zone.shelterZones = built.shelterZoneCount;
    debug.zone.props = zoneDefinition.props.length;
    debug.zone.rocks = built.rockCount;
    debug.zone.propModels = built.propModelCount;
    debug.zone.rockModels = built.rocksModelled;
    debug.zone.propSet = set;
    return built;
  };
  let zone = await buildZone(propSetId(startParams.get("props")));
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
    localPlayer: true,
    input: createEmptyActions(),
    character: createCharacter(startYaw),
    view: createView(startYaw, START_PITCH),
    shelter: { zone: null },
    transform: createTransform(PLAYER_START.x, PLAYER_START.y, PLAYER_START.z, startYaw),
    renderable: { object: playerVisual },
    body: { handle: physics.addCharacter(PLAYER_START) },
  });
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
  const clock = createClock(
    parseTimeOfDay(startParams.get("time")),
    numberParam(startParams.get("timescale"), 0, MAX_TIME_SCALE, 1),
  );
  // The weather follows the clock too. Each visit has weather of its own unless `?seed=1`
  // fixes it; `?storm=now` starts in a storm and `?storm=warning` with one announced.
  const weather = createWeather(numberParam(startParams.get("seed"), 0, 0xffffffff, Date.now() % 0xffffffff));
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
  const audio = createGameAudio(import.meta.env.BASE_URL, DEFAULT_VOLUME, startParams.has("mute"));
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
    const light = sceneLook(daylightAt(readClock(clock).hour), latestWeather.intensity, latestWeather.approach);
    const wall = stormWallAt(latestWeather);
    sky.update(light, wall, camera, cameraFocus, skySeconds);
    // The first grains fly as the wall draws near; the air fills with them when it breaks.
    const sand = apparentStrength(latestWeather.intensity, latestWeather.approach);
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
  const localInput = createLocalInput({ mouse });
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

  // The camera's current reach. It shrinks at once when something is in the way and grows back
  // gradually, so it is kept between frames.
  const cameraFit = { distance: CAMERA_DISTANCE, shoulderOffset: CAMERA_SHOULDER_OFFSET };
  /** How far back the player wants the camera, set with the mouse wheel. */
  let wantedCameraDistance = CAMERA_DISTANCE;
  let lastFrameSeconds = 0;
  const cameraSweep: Sweep = (origin, direction, maxDistance) =>
    physics.sweepSphere(origin, direction, maxDistance, CAMERA_COLLISION_RADIUS, player.body.handle);

  fitToWindow(renderer, camera);
  window.addEventListener("resize", () => fitToWindow(renderer, camera));

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
  };

  // Development panel (F2): everything the start conditions do, changed on screen instead.
  if (import.meta.env.DEV && !bench) {
    void Promise.all([import("./debug/devPanel"), import("./debug/shelterZoneOverlay")]).then(([{ createDevPanel }, { createShelterZoneOverlay }]) => {
      const shelterZones: ShelterZoneOverlay = createShelterZoneOverlay(world, scene);
      createDevPanel(ui, i18n, {
        characters: CHARACTERS.map((character) => character.id),
        character: () => debug.player.character,
        setCharacter: (id) => setCharacter(id),
        propSets: PROP_SET_IDS,
        propSet: () => debug.zone.propSet,
        setPropSet: async (set) => {
          // The old zone goes first, so its colliders are not in the way of the new ones.
          zone.unload();
          zone = await buildZone(propSetId(set));
          shelterZones.refresh();
          warmUpScene(renderer, scene, camera);
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
        shelterZonesShown: () => shelterZones.visible,
        showShelterZones: (shown) => {
          shelterZones.setVisible(shown);
          debug.shelterZonesShown = shown;
        },
        places: zonePlaces(zoneDefinition),
        goTo: (place) => teleport(place.east, place.south, place.facing),
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
    },
    update(dt) {
      sectionTimer.begin("sim");
      renderSync.capture();
      // During a measurement nobody plays: the character stands still and the camera flies itself.
      if (playing && !bench) {
        inputSystem();
      }
      lookSystem();
      movementSystem(dt);
      physicsSystem.update();
      shelterSystem();
      // Time stands still behind the title and during a measurement.
      if (playing && !bench) {
        advanceClock(clock, dt);
      }
      sectionTimer.end("sim");
      showClock();
      if (bench) {
        benchReading = benchWeather(bench.recorder.progress, benchSeconds);
      }
      showWeather();
      showAudio();
      showShelter();
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
      debug.ui.scale = ui.scale;
      debug.ui.tooSmall = ui.tooSmall;
      debug.ui.window = ui.openWindowId;
      debug.ui.selectedButton = ui.selectedButton;
      debug.camera.distance = cameraFit.distance;
      debug.camera.wantedDistance = wantedCameraDistance;
      debug.camera.y = camera.position.y;
      debug.tick += 1;
      debug.simSeconds += dt;
    },
    render(alpha) {
      sectionTimer.begin("render");
      renderSync.sync(alpha);
      if (characterModel) {
        const moving = player.input.moveX !== 0 || player.input.moveY !== 0;
        characterModel.update(lastFrameSeconds, {
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
      const pending = localInput.pendingLook();
      const looked = previewLook(player.view, pending.lookX, pending.lookY);
      // Behind the title screen the camera sways slowly instead of following the mouse.
      titleSeconds += playing ? 0 : lastFrameSeconds;
      const yaw = playing ? looked.yaw : titleCameraYaw(startYaw, titleSeconds);
      const pitch = playing ? looked.pitch : TITLE_CAMERA_PITCH;
      wantedCameraDistance = applyZoom(wantedCameraDistance, mouse.takeWheel());
      const fit = fitCamera(drawnAt, yaw, pitch, cameraSweep, wantedCameraDistance);
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
          const verdict = judge(summary, PERF_BUDGETS[BENCH_QUALITY]);
          debug.bench.state = "done";
          debug.bench.summary = summary;
          debug.bench.withinBudget = isWithinBudget(verdict);
          bench.panel.showResult({
            rows: benchRows(summary, verdict),
            withinBudget: isWithinBudget(verdict),
            qualityKey: `quality.${BENCH_QUALITY}`,
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
      debug.phase = bench ? "bench" : playing ? "playing" : "title";
      debug.ready = true;
      firstFrameDrawn();
    },
  });

  await firstFrame;
  return {
    start(): void {
      if (playing || bench) {
        return;
      }
      playing = true;
      // The character turns its back to the camera again, the way it faces in play.
      if (characterModel) {
        characterModel.object.rotation.y = 0;
      }
      hud.setVisible(true);
      createLookHint(mouse, i18n);
      audio.start();
    },
    setCharacter,
  };
}
