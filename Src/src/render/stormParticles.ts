import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, Points, ShaderMaterial, SRGBColorSpace, Vector3 } from "three";
import { createRandom } from "../core/random";
import type { Rgb } from "./daylight";

/**
 * Sand flying past the camera in a storm. The grains fill a box that stays centred on the
 * camera: each one is carried along by the wind and comes back in at the other side when it
 * leaves, all worked out on the graphics card from the time, so thousands of grains cost
 * next to nothing.
 */

/** How many grains there are, and the size of the box they fill round the camera, in metres. */
const GRAIN_COUNT = 3000;
const BOX = new Vector3(30, 14, 30);
/** The wind, in m/s: the storm comes from the south (+Z) and blows north, sinking slightly. */
const WIND = new Vector3(3, -1.2, -26);
/** How large a grain is drawn, in metres across. */
const GRAIN_SIZE = 0.05;
/** A grain is never drawn larger than this many pixels, however close it flies past. */
const MAX_GRAIN_PIXELS = 5;
/** The darkest the grains get, whatever the hour (0 to 1 per channel). */
const NIGHT_GRAIN: Rgb = [0.5, 0.4, 0.28];
/** Seed for where the grains start; any number will do, it only has to be the same every time. */
const GRAIN_SEED = 20261117;

const vertexShader = /* glsl */ `
uniform vec3 box;
uniform vec3 wind;
uniform float time;
uniform float size;
uniform float pixelsPerMetre;
uniform float maxPixels;
attribute float gust;
varying float vFade;
void main() {
  // Where the grain is in the box round the camera: carried by the wind, each a little
  // faster or slower than the next, and wrapped round at the edges.
  vec3 carried = position + wind * time * gust;
  vec3 inBox = mod(carried - cameraPosition, box) - 0.5 * box;
  // Fade out towards the edge of the box, so grains do not pop in and out.
  vec3 edge = 1.0 - abs(inBox) / (0.5 * box);
  vFade = smoothstep(0.0, 0.25, min(edge.x, min(edge.y, edge.z)));
  vec4 viewPosition = viewMatrix * vec4(cameraPosition + inBox, 1.0);
  // Grains right in front of the lens would be blobs; they fade out instead.
  vFade *= smoothstep(1.0, 3.0, -viewPosition.z);
  gl_Position = projectionMatrix * viewPosition;
  gl_PointSize = clamp(size * pixelsPerMetre / max(-viewPosition.z, 0.5), 1.0, maxPixels);
}`;

const fragmentShader = /* glsl */ `
uniform vec3 color;
uniform float opacity;
varying float vFade;
void main() {
  // A soft round grain.
  float fromCentre = length(gl_PointCoord - 0.5) * 2.0;
  float alpha = (1.0 - smoothstep(0.4, 1.0, fromCentre)) * vFade * opacity;
  gl_FragColor = vec4(color * alpha, alpha);
  #include <colorspace_fragment>
}`;

export interface StormParticles {
  readonly object: Points;
  /**
   * Call every frame. `intensity` is the storm's strength (0 hides the grains), `seconds` a
   * clock that keeps running, `dust` the colour of the dust and `viewportHeight` the height
   * of the picture in pixels with `fovDegrees` the camera's field of view.
   */
  update(intensity: number, seconds: number, dust: Rgb, viewportHeight: number, fovDegrees: number): void;
  /** Draws only this share of the grains, 0 to 1 (the quality setting). */
  setShare(share: number): void;
}

export function createStormParticles(): StormParticles {
  const random = createRandom(GRAIN_SEED);
  const positions = new Float32Array(GRAIN_COUNT * 3);
  const gusts = new Float32Array(GRAIN_COUNT);
  for (let index = 0; index < GRAIN_COUNT; index += 1) {
    positions[index * 3] = random.range(0, BOX.x);
    positions[index * 3 + 1] = random.range(0, BOX.y);
    positions[index * 3 + 2] = random.range(0, BOX.z);
    gusts[index] = random.range(0.7, 1.3);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("gust", new BufferAttribute(gusts, 1));

  const color = new Color();
  const uniforms = {
    box: { value: BOX },
    wind: { value: WIND },
    time: { value: 0 },
    size: { value: GRAIN_SIZE },
    pixelsPerMetre: { value: 1000 },
    maxPixels: { value: MAX_GRAIN_PIXELS },
    color: { value: color },
    opacity: { value: 0 },
  };
  const object = new Points(
    geometry,
    new ShaderMaterial({
      uniforms,
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      // Grains brighten what is behind them, like dust catching the light.
      blending: AdditiveBlending,
      fog: false,
    }),
  );
  // The grains are placed round the camera in the shader; the geometry's own bounds mean nothing.
  object.frustumCulled = false;
  object.visible = false;

  return {
    object,
    setShare(share): void {
      geometry.setDrawRange(0, Math.round(GRAIN_COUNT * Math.min(Math.max(share, 0), 1)));
    },
    update(intensity, seconds, dust, viewportHeight, fovDegrees): void {
      object.visible = intensity > 0.01;
      if (!object.visible) {
        return;
      }
      uniforms.time.value = seconds;
      uniforms.opacity.value = Math.min(intensity, 1) * 0.55;
      // Lighter than the air they fly in, or they would not show against it. At night the
      // dust is nearly black, so the grains keep a pale colour of their own: they catch what
      // light there is.
      color.setRGB(
        Math.min(Math.max(dust[0] * 1.5, NIGHT_GRAIN[0]), 1),
        Math.min(Math.max(dust[1] * 1.5, NIGHT_GRAIN[1]), 1),
        Math.min(Math.max(dust[2] * 1.5, NIGHT_GRAIN[2]), 1),
        SRGBColorSpace,
      );
      // How many pixels a metre covers at a distance of one metre.
      uniforms.pixelsPerMetre.value = viewportHeight / (2 * Math.tan((fovDegrees * Math.PI) / 360));
    },
  };
}
