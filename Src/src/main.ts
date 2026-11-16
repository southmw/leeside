import { Group } from "three";
import { createCharacter, createTransform, createWorld } from "./core/ecs";
import { startGameLoop } from "./core/gameLoop";
import { installDebugApi, TIMED_SECTIONS } from "./debug/debugApi";
import type { DebugOverlay } from "./debug/debugOverlay";
import type { DevLog } from "./debug/devLog";
import { FrameStats } from "./debug/frameStats";
import { readHeapMb } from "./debug/memory";
import { SectionTimer } from "./debug/sectionTimer";
import {
  CAMERA_COLLISION_RADIUS,
  CAMERA_DISTANCE,
  CAMERA_SHOULDER_OFFSET,
  CHARACTER_HEIGHT,
  CHARACTER_RADIUS,
  MOVE_SPEED,
} from "./data/tuning";
import { createLookSystem } from "./gameplay/lookSystem";
import { createMovementSystem } from "./gameplay/movementSystem";
import { createView, previewLook } from "./gameplay/view";
import { createEmptyActions } from "./input/actions";
import { createInputSystem } from "./input/inputSystem";
import { createLocalInput } from "./input/localInput";
import { createMouse } from "./input/mouse";
import { createI18n, detectLanguage } from "./locales/i18n";
import { createPhysicsSystem } from "./physics/physicsSystem";
import { CHARACTER_SKIN, initPhysics, PhysicsWorld } from "./physics/physicsWorld";
import { easeCameraLength, fitCamera, type Sweep, updateCameraDistance } from "./render/cameraCollision";
import { computeCameraPose } from "./render/cameraRig";
import { applyZoom } from "./render/cameraZoom";
import { createCamera, createRenderer, fitToWindow } from "./render/renderer";
import { createRenderSync } from "./render/renderSync";
import { createLookHint } from "./ui/lookHint";
import { loadCharacterModel, type CharacterModel } from "./render/characterModel";
import { createCharacterMesh, createTestScene } from "./render/testScene";
import { buildingAt, yawFromDegrees } from "./world/building";
import { numberParam, resolveStart } from "./world/startPoint";
import { heightAt } from "./world/terrain";
import { loadZone } from "./world/zoneLoader";
import { loadDryRiverbed } from "./world/zones/dryRiverbed";

/** The view starts tilted slightly down, so the ground ahead is in sight. Radians. */
const START_PITCH = -0.2;

const canvas = document.querySelector<HTMLCanvasElement>("#game");
if (!canvas) {
  throw new Error("Missing #game canvas");
}

// Start conditions come from the URL, e.g. `?lang=ko`.
const startParams = new URLSearchParams(window.location.search);

const i18n = createI18n(detectLanguage({ query: startParams.get("lang"), browser: navigator.languages }));
document.documentElement.lang = i18n.language;

const debug = installDebugApi(i18n.language);
i18n.onChange((language) => {
  document.documentElement.lang = language;
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
  void import("./debug/devLog").then(({ createDevLog }) => {
    devLog = createDevLog(debug, renderer);
  });
}

const camera = createCamera();

const scene = createTestScene();
const world = createWorld();
const renderSync = createRenderSync(world, scene);

// The character model downloads while the physics engine starts up.
const characterModelLoading: Promise<CharacterModel | undefined> = loadCharacterModel(
  `${import.meta.env.BASE_URL}models/character.glb`,
  CHARACTER_HEIGHT,
).catch((error: unknown) => {
  console.warn("Character model could not be loaded; using the capsule instead.", error);
  return undefined;
});

// The physics engine is WebAssembly and has to load before the first step.
await initPhysics();
const physics = new PhysicsWorld();
const physicsSystem = createPhysicsSystem(world, physics);

const zone = loadZone(loadDryRiverbed(), physics, scene);
const zoneDefinition = zone.definition;
debug.zone.id = zoneDefinition.id;
debug.zone.nameKey = zoneDefinition.nameKey;
debug.zone.buildings = zoneDefinition.buildings.length;
debug.zone.props = zoneDefinition.props.length;
debug.zone.rocks = zone.rockCount;

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
const characterModel = await characterModelLoading;
if (characterModel) {
  // The entity's position is the capsule's centre; the model's origin is at its feet.
  characterModel.object.position.y = -(CHARACTER_HEIGHT / 2 + CHARACTER_SKIN);
  playerVisual.add(characterModel.object);
} else {
  playerVisual.add(createCharacterMesh(CHARACTER_HEIGHT, CHARACTER_RADIUS));
}
debug.player.model = characterModel ? "model" : "capsule";

const startYaw = yawFromDegrees(start.facing);
const player = world.add({
  localPlayer: true,
  input: createEmptyActions(),
  character: createCharacter(startYaw),
  view: createView(startYaw, START_PITCH),
  transform: createTransform(PLAYER_START.x, PLAYER_START.y, PLAYER_START.z, startYaw),
  renderable: { object: playerVisual },
  body: { handle: physics.addCharacter(PLAYER_START) },
});
const mouse = createMouse(canvas, document);
createLookHint(mouse, i18n);
const localInput = createLocalInput({ mouse });
const inputSystem = createInputSystem(world, localInput);
const lookSystem = createLookSystem(world);
// `?speed=8` tries a different walking speed (m/s) without changing the tuning file.
const moveSpeed = numberParam(startParams.get("speed"), 1, 30, MOVE_SPEED);
debug.moveSpeed = moveSpeed;
const movementSystem = createMovementSystem(world, physics, moveSpeed);

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
    inputSystem();
    lookSystem();
    movementSystem(dt);
    physicsSystem.update();
    sectionTimer.end("sim");

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
    const { yaw, pitch } = previewLook(player.view, pending.lookX, pending.lookY);
    wantedCameraDistance = applyZoom(wantedCameraDistance, mouse.takeWheel());
    const fit = fitCamera(drawnAt, yaw, pitch, cameraSweep, wantedCameraDistance);
    cameraFit.shoulderOffset = easeCameraLength(cameraFit.shoulderOffset, fit.shoulderOffset, lastFrameSeconds);
    // Where the camera would be if it stayed at its current distance, and whether that spot is free.
    const stayed = computeCameraPose(drawnAt, yaw, pitch, cameraFit).position;
    const blockedHere = physics.overlapsSphere(stayed, CAMERA_COLLISION_RADIUS, player.body.handle);
    cameraFit.distance = updateCameraDistance(cameraFit.distance, fit.distance, blockedHere, lastFrameSeconds);
    const pose = computeCameraPose(drawnAt, yaw, pitch, cameraFit);
    camera.position.set(pose.position.x, pose.position.y, pose.position.z);
    camera.lookAt(pose.target.x, pose.target.y, pose.target.z);
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

    debug.frame += 1;
    debug.entityCount = world.entities.length;
    debug.bodyCount = physics.bodyCount;
    debug.canvas.width = canvas.width;
    debug.canvas.height = canvas.height;
    debug.ready = true;
  },
});
