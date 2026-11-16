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
import { createTerrainMesh } from "./render/terrainMesh";
import { createCharacterMesh, createTestScene } from "./render/testScene";
import { buildTerrainGeometry, createHeightfield, heightAt } from "./world/terrain";
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

// The physics engine is WebAssembly and has to load before the first step.
await initPhysics();
const physics = new PhysicsWorld();
const physicsSystem = createPhysicsSystem(world, physics);

// The zone's terrain: one set of triangles for both the picture and the collider.
const zone = loadDryRiverbed();
const heightfield = createHeightfield(zone.terrain.samples, zone.size, zone.terrain.heights);
const terrain = buildTerrainGeometry(heightfield);
physics.addStaticMesh(terrain.positions, terrain.indices);
scene.add(createTerrainMesh(terrain));

// Positions in a zone are [east, south], which is [x, z] in the world.
const [spawnX, spawnZ] = zone.spawn.position;
const PLAYER_START = {
  x: spawnX,
  y: heightAt(heightfield, spawnX, spawnZ) + CHARACTER_HEIGHT / 2 + CHARACTER_SKIN,
  z: spawnZ,
};

const player = world.add({
  localPlayer: true,
  input: createEmptyActions(),
  character: createCharacter(),
  // Zone directions are clockwise from north; yaw is counter-clockwise from -Z, which is north.
  view: createView((-zone.spawn.facing * Math.PI) / 180, START_PITCH),
  transform: createTransform(PLAYER_START.x, PLAYER_START.y, PLAYER_START.z),
  renderable: { object: createCharacterMesh(CHARACTER_HEIGHT, CHARACTER_RADIUS) },
  body: { handle: physics.addCharacter(PLAYER_START) },
});
const mouse = createMouse(canvas, document);
createLookHint(mouse, i18n);
const localInput = createLocalInput({ mouse });
const inputSystem = createInputSystem(world, localInput);
const lookSystem = createLookSystem(world);
const movementSystem = createMovementSystem(world, physics);

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
    debug.player.groundHeight = heightAt(heightfield, player.transform.x, player.transform.z);
    debug.view.yaw = player.view.yaw;
    debug.view.pitch = player.view.pitch;
    debug.view.locked = mouse.locked;
    debug.camera.distance = cameraFit.distance;
    debug.camera.wantedDistance = wantedCameraDistance;
    debug.camera.y = camera.position.y;
    debug.tick += 1;
    debug.simSeconds += dt;
  },
  render(alpha) {
    sectionTimer.begin("render");
    renderSync.sync(alpha);
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
