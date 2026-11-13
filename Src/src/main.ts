import { createCamera, createRenderer, fitToWindow } from "./render/renderer";
import { createTestScene } from "./render/testScene";

const canvas = document.querySelector<HTMLCanvasElement>("#game");
if (!canvas) {
  throw new Error("Missing #game canvas");
}

const renderer = createRenderer(canvas);
const camera = createCamera();
camera.position.set(5, 4, 7);
camera.lookAt(0, 0.75, 0);

const { scene } = createTestScene();

fitToWindow(renderer, camera);
window.addEventListener("resize", () => fitToWindow(renderer, camera));

// Plain render loop for now. The fixed-timestep game loop replaces it in step 0.5.
renderer.setAnimationLoop(() => {
  renderer.render(scene, camera);
});
