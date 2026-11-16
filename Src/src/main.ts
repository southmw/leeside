import { createCharacter, createTransform, createWorld } from "./core/ecs";
import { startGameLoop } from "./core/gameLoop";
import { installDebugApi, TIMED_SECTIONS } from "./debug/debugApi";
import type { DebugOverlay } from "./debug/debugOverlay";
import type { DevLog } from "./debug/devLog";
import { FrameStats } from "./debug/frameStats";
import { readHeapMb } from "./debug/memory";
import { SectionTimer } from "./debug/sectionTimer";
import { CHARACTER_HEIGHT, CHARACTER_RADIUS } from "./data/tuning";
import { createMovementSystem } from "./gameplay/movementSystem";
import { createEmptyActions } from "./input/actions";
import { createInputSystem } from "./input/inputSystem";
import { createLocalInput } from "./input/localInput";
import { createI18n, detectLanguage } from "./locales/i18n";
import { createPhysicsSystem } from "./physics/physicsSystem";
import { CHARACTER_SKIN, initPhysics, PhysicsWorld } from "./physics/physicsWorld";
import { createCamera, createRenderer, fitToWindow } from "./render/renderer";
import { createRenderSync } from "./render/renderSync";
import { createBoxMesh, createCharacterMesh, createStaticBoxMesh, createTestScene } from "./render/testScene";

/** Placeholder box: half its edge length, and the height it is dropped from, in metres. */
const BOX_HALF_SIZE = 0.75;
const BOX_DROP_HEIGHT = 8;
/** The box lands this far ahead of the player, so walking forward runs into it. */
const BOX_Z = -4;
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
// Fixed view from behind the player until the follow camera exists (step 1.4): forward (W)
// is away from the camera and right (D) is to the right of the screen.
camera.position.set(0, 9, 15);
camera.lookAt(0, 1, -4);

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
  transform: createTransform(PLAYER_START.x, PLAYER_START.y, PLAYER_START.z),
  renderable: { object: createCharacterMesh(CHARACTER_HEIGHT, CHARACTER_RADIUS) },
  body: { handle: physics.addCharacter(PLAYER_START) },
});
const inputSystem = createInputSystem(world, createLocalInput());
const movementSystem = createMovementSystem(world, physics);

fitToWindow(renderer, camera);
window.addEventListener("resize", () => fitToWindow(renderer, camera));

startGameLoop({
  onFrame(frameMs, nowMs) {
    frameStats.add(frameMs);
    overlay?.update(nowMs);
    devLog?.update(nowMs);
  },
  update(dt) {
    sectionTimer.begin("sim");
    inputSystem();
    movementSystem(dt);
    physicsSystem.update();
    sectionTimer.end("sim");

    Object.assign(debug.input, player.input);
    debug.player.x = player.transform.x;
    debug.player.y = player.transform.y;
    debug.player.z = player.transform.z;
    debug.player.grounded = player.character.grounded;
    debug.tick += 1;
    debug.simSeconds += dt;
  },
  render() {
    sectionTimer.begin("render");
    renderSync.sync();
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
