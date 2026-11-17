import { type Camera, type Object3D, PerspectiveCamera, SRGBColorSpace, WebGLRenderer } from "three";
import { computeViewport } from "./viewport";

/** Vertical field of view in degrees (prototype design 3.1). */
export const CAMERA_FOV = 60;

export function createRenderer(canvas: HTMLCanvasElement): WebGLRenderer {
  const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.outputColorSpace = SRGBColorSpace;
  return renderer;
}

export function createCamera(): PerspectiveCamera {
  return new PerspectiveCamera(CAMERA_FOV, 1, 0.1, 1000);
}

/** Matches the renderer and camera to the current window size. */
export function fitToWindow(renderer: WebGLRenderer, camera: PerspectiveCamera): void {
  const viewport = computeViewport(window.innerWidth, window.innerHeight, window.devicePixelRatio);
  renderer.setPixelRatio(viewport.pixelRatio);
  // `false` leaves the canvas CSS size alone; the stylesheet keeps it filling the window.
  renderer.setSize(viewport.width, viewport.height, false);
  camera.aspect = viewport.aspect;
  camera.updateProjectionMatrix();
}

/**
 * Draws everything in the scene once, whether or not the camera can see it. The first time
 * an object is drawn its shaders are compiled and its geometry and textures are sent to the
 * graphics card, which takes long enough to be felt as a stutter (measured: up to 200 ms
 * when a car model first came into view). Doing it while loading keeps it out of play.
 */
export function warmUpScene(renderer: WebGLRenderer, scene: Object3D, camera: Camera): void {
  const culled: Object3D[] = [];
  scene.traverse((object) => {
    if (object.frustumCulled) {
      object.frustumCulled = false;
      culled.push(object);
    }
  });
  renderer.render(scene, camera);
  for (const object of culled) {
    object.frustumCulled = true;
  }
}
