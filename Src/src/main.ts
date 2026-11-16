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
import { createCamera, createRenderer, fitToWindow } from "./render/renderer";
import { createRenderSync } from "./render/renderSync";
import { createLookHint } from "./ui/lookHint";
import { createBoxMesh, createCharacterMesh, createStaticBoxMesh, createTestScene } from "./render/testScene";

/** Placeholder box: half its edge length, and the height it is dropped from, in metres. */
const BOX_HALF_SIZE = 0.75;
const BOX_DROP_HEIGHT = 8;
/** The box lands this far ahead of the player, so walking forward runs into it. */
const BOX_Z = -4;
/** The view starts tilted slightly down, so the ground ahead is in sight. Radians. */
const START_PITCH = -0.2;
/** Where the player starts, on the ground. */
const PLAYER_START = { x: 0, y: CHARACTER_HEIGHT / 2 + CHARACTER_SKIN, z: 3 };
/** Half extents of the placeholder floor's collider. Its top surface is at y = 0. */
const FLOOR_HALF_SIZE = { x: 30, y: 0.5, z: 30 };

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
physics.addStaticBox({ x: 0, y: -FLOOR_HALF_SIZE.y, z: 0 }, FLOOR_HALF_SIZE);

// Placeholder ramps and a platform for trying out slopes and jumps, until zones exist.
// Each ramp starts on the ground at z = -6 and rises away from the camera.
const RAMP_HALF_SIZE = { x: 1.5, y: 0.25, z: 4 };
const addStaticBox = (
  center: { x: number; y: number; z: number },
  halfExtents: { x: number; y: number; z: number },
  pitch: number,
  color: number,
): void => {
  physics.addStaticBox(center, halfExtents, pitch);
  scene.add(createStaticBoxMesh(center, halfExtents, pitch, color));
};
const addRamp = (x: number, degrees: number, color: number): void => {
  const angle = (degrees * Math.PI) / 180;
  const center = {
    x,
    y: RAMP_HALF_SIZE.z * Math.sin(angle) - RAMP_HALF_SIZE.y * Math.cos(angle),
    z: -6 - RAMP_HALF_SIZE.z * Math.cos(angle),
  };
  addStaticBox(center, RAMP_HALF_SIZE, angle, color);
};
addRamp(-8, 30, 0x8a9a5b); // Gentle: walkable.
addRamp(-4, 40, 0xb8a04a); // Just under the 45 degree limit: still walkable.
addRamp(4, 55, 0xa85a3c); // Too steep.
// A platform 1 m high: just below the jump height, so it can be jumped onto.
addStaticBox({ x: 8, y: 0.5, z: -4 }, { x: 1.5, y: 0.5, z: 1.5 }, 0, 0x7d8590);
// And one 1.3 m high, which cannot.
addStaticBox({ x: 8, y: 0.65, z: -8 }, { x: 1.5, y: 0.65, z: 1.5 }, 0, 0x5d6570);

// Placeholder until zones exist: a box that falls onto the floor.
world.add({
  transform: createTransform(0, BOX_DROP_HEIGHT, BOX_Z),
  renderable: { object: createBoxMesh() },
  body: {
    handle: physics.addDynamicBox(
      { x: 0, y: BOX_DROP_HEIGHT, z: BOX_Z },
      { x: BOX_HALF_SIZE, y: BOX_HALF_SIZE, z: BOX_HALF_SIZE },
    ),
  },
});

const player = world.add({
  localPlayer: true,
  input: createEmptyActions(),
  character: createCharacter(),
  view: createView(0, START_PITCH),
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
    debug.view.yaw = player.view.yaw;
    debug.view.pitch = player.view.pitch;
    debug.view.locked = mouse.locked;
    debug.camera.distance = cameraFit.distance;
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
    const fit = fitCamera(drawnAt, yaw, pitch, cameraSweep);
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
