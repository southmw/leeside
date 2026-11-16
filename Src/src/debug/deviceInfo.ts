import type { WebGLRenderer } from "three";

/** What a performance figure needs next to it to be comparable: the machine it came from. */
export interface DeviceInfo {
  userAgent: string;
  gpu: string;
  devicePixelRatio: number;
  screen: string;
  hardwareConcurrency: number;
}

function readGpuName(renderer: WebGLRenderer): string {
  const gl = renderer.getContext();
  const extension = gl.getExtension("WEBGL_debug_renderer_info");
  const name: unknown = extension
    ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL)
    : gl.getParameter(gl.RENDERER);
  return typeof name === "string" ? name : "unknown";
}

export function readDevice(renderer: WebGLRenderer): DeviceInfo {
  return {
    userAgent: navigator.userAgent,
    gpu: readGpuName(renderer),
    devicePixelRatio: window.devicePixelRatio,
    screen: `${window.screen.width}x${window.screen.height}`,
    hardwareConcurrency: navigator.hardwareConcurrency,
  };
}
