import { startGameLoop } from "./core/gameLoop";
import { installDebugApi } from "./debug/debugApi";
import { createCamera, createRenderer, fitToWindow } from "./render/renderer";
import { createTestScene } from "./render/testScene";

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

const { scene, box } = createTestScene();

fitToWindow(renderer, camera);
window.addEventListener("resize", () => fitToWindow(renderer, camera));

startGameLoop({
  update(dt) {
    box.rotation.y += BOX_SPIN_SPEED * dt;

    debug.tick += 1;
    debug.simSeconds += dt;
  },
  render() {
    renderer.render(scene, camera);

    debug.frame += 1;
    debug.canvas.width = canvas.width;
    debug.canvas.height = canvas.height;
    debug.ready = true;
  },
});
