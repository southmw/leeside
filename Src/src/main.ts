import { createTransform, createWorld } from "./core/ecs";
import { startGameLoop } from "./core/gameLoop";
import { installDebugApi } from "./debug/debugApi";
import type { DebugOverlay } from "./debug/debugOverlay";
import type { DevLog } from "./debug/devLog";
import { FrameStats } from "./debug/frameStats";
import { createSpinSystem } from "./gameplay/spinSystem";
import { createEmptyActions } from "./input/actions";
import { createInputSystem } from "./input/inputSystem";
import { createLocalInput } from "./input/localInput";
import { createI18n, detectLanguage } from "./locales/i18n";
import { createCamera, createRenderer, fitToWindow } from "./render/renderer";
import { createRenderSync } from "./render/renderSync";
import { createBoxMesh, createTestScene } from "./render/testScene";

/** Placeholder motion so the fixed timestep is visible: radians per second. */
const BOX_SPIN_SPEED = 1;

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

const renderer = createRenderer(canvas);

// Development tools: the dynamic imports keep them out of production builds.
let overlay: DebugOverlay | undefined;
let devLog: DevLog | undefined;
if (import.meta.env.DEV) {
  void import("./debug/debugOverlay").then(({ createDebugOverlay }) => {
    overlay = createDebugOverlay(debug, i18n);
  });
  void import("./debug/devLog").then(({ createDevLog }) => {
    devLog = createDevLog(debug, renderer);
  });
}

const camera = createCamera();
camera.position.set(5, 4, 7);
camera.lookAt(0, 0.75, 0);

const scene = createTestScene();
const world = createWorld();
const renderSync = createRenderSync(world, scene);
const spinSystem = createSpinSystem(world);

world.add({
  transform: createTransform(0, 0.75, 0),
  renderable: { object: createBoxMesh() },
  spin: { speed: BOX_SPIN_SPEED },
});

// Stand-in for the player until the character exists (step 1.2). It only carries input.
const player = world.add({ localPlayer: true, input: createEmptyActions() });
const inputSystem = createInputSystem(world, createLocalInput());

fitToWindow(renderer, camera);
window.addEventListener("resize", () => fitToWindow(renderer, camera));

startGameLoop({
  onFrame(frameMs, nowMs) {
    frameStats.add(frameMs);
    overlay?.update(nowMs);
    devLog?.update(nowMs);
  },
  update(dt) {
    inputSystem();
    spinSystem(dt);

    if (player.input) {
      Object.assign(debug.input, player.input);
    }
    debug.tick += 1;
    debug.simSeconds += dt;
  },
  render() {
    renderSync.sync();
    renderer.render(scene, camera);

    // renderer.info counts reset on every render call, so read them straight afterwards.
    const { render, memory } = renderer.info;
    Object.assign(debug.stats, frameStats.snapshot(), {
      drawCalls: render.calls,
      triangles: render.triangles,
      geometries: memory.geometries,
      textures: memory.textures,
    });

    debug.frame += 1;
    debug.entityCount = world.entities.length;
    debug.canvas.width = canvas.width;
    debug.canvas.height = canvas.height;
    debug.ready = true;
  },
});
