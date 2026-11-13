import { PerspectiveCamera, SRGBColorSpace, WebGLRenderer } from "three";
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
