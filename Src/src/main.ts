import { createTransform, createWorld } from "./core/ecs";
import { startGameLoop } from "./core/gameLoop";
import { installDebugApi } from "./debug/debugApi";
import { createSpinSystem } from "./gameplay/spinSystem";
import { createCamera, createRenderer, fitToWindow } from "./render/renderer";
import { createRenderSync } from "./render/renderSync";
import { createBoxMesh, createTestScene } from "./render/testScene";

/** Placeholder motion so the fixed timestep is visible: radians per second. */
const BOX_SPIN_SPEED = 1;

const canvas = document.querySelector<HTMLCanvasElement>("#game");
if (!canvas) {
  throw new Error("Missing #game canvas");
}

const debug = installDebugApi();

const renderer = createRenderer(canvas);
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

fitToWindow(renderer, camera);
window.addEventListener("resize", () => fitToWindow(renderer, camera));

startGameLoop({
  update(dt) {
    spinSystem(dt);

    debug.tick += 1;
    debug.simSeconds += dt;
  },
  render() {
    renderSync.sync();
    renderer.render(scene, camera);

    debug.frame += 1;
    debug.entityCount = world.entities.length;
    debug.canvas.width = canvas.width;
    debug.canvas.height = canvas.height;
    debug.ready = true;
  },
});
