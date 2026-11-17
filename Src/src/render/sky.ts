import {
  AmbientLight,
  BackSide,
  Color,
  DirectionalLight,
  Fog,
  Mesh,
  type Scene,
  ShaderChunk,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
} from "three";
import { MOON_COLOR, MOON_DIRECTION, type Rgb } from "./daylight";
import type { SceneLook } from "./stormLook";

/**
 * The sky, the light and the haze of the scene, following the hour of the day
 * (render/daylight.ts) and the weather (render/stormLook.ts).
 *
 * The sky is a dome shaded from the horizon colour to the colour overhead, with a glow where
 * the sun is. It was chosen over Three.js' atmosphere sky and over a photograph (HDRI) after
 * trying all three (development plan step 2.2): its colours come straight from the table, so
 * dusk, night and later the storm can each be given the look they need.
 */

/** The dome is drawn this far from the camera, inside the camera's reach (1000 m). */
const DOME_RADIUS = 900;
/** How far the lights stand from the origin; only their direction matters. */
const LIGHT_DISTANCE = 100;
/** Sunlight strength at which the sun's glow in the sky is at its fullest (the table's daytime value). */
const FULL_DAYLIGHT = 2.6;

const gradientVertex = /* glsl */ `
varying vec3 vDirection;
void main() {
  vDirection = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const gradientFragment = /* glsl */ `
uniform vec3 topColor;
uniform vec3 horizonColor;
uniform vec3 sunColor;
uniform vec3 sunDirection;
uniform float sunStrength;
varying vec3 vDirection;
void main() {
  vec3 direction = normalize(vDirection);
  // The horizon colour reaches a little way up, then gives way to the colour overhead.
  float up = pow(clamp(direction.y, 0.0, 1.0), 0.45);
  vec3 color = mix(horizonColor, topColor, up);
  // Below the horizon, where the edge of the world shows, the haze just darkens.
  color = mix(color, horizonColor * 0.6, clamp(-direction.y * 6.0, 0.0, 1.0));
  // The sun: a wide soft glow and a small bright core.
  float towardsSun = max(dot(direction, sunDirection), 0.0);
  color += sunColor * sunStrength * (0.35 * pow(towardsSun, 12.0) + 1.2 * pow(towardsSun, 600.0));
  gl_FragColor = vec4(color, 1.0);
  #include <colorspace_fragment>
}`;

/**
 * Three.js counts haze by depth from the camera. Here it has to be counted from the player's
 * character, in every direction: the camera may stand 20 m behind or above it, and haze
 * counted from the camera either swallows the character (counted from behind) or leaves the
 * ground around it clear (seen from above). So the built-in haze is replaced for all
 * materials: the distance is taken from the point the camera looks at, which lies straight
 * ahead of it at `fogNear` metres (the scene's fog object carries that distance in its `near`
 * and the visibility in its `far`). The haze begins at a tenth of the visibility.
 */
function countHazeFromFocus(): void {
  ShaderChunk.fog_pars_vertex = /* glsl */ `
#ifdef USE_FOG
  varying vec3 vFogPosition;
#endif`;
  ShaderChunk.fog_vertex = /* glsl */ `
#ifdef USE_FOG
  vFogPosition = mvPosition.xyz;
#endif`;
  ShaderChunk.fog_pars_fragment = /* glsl */ `
#ifdef USE_FOG
  uniform vec3 fogColor;
  uniform float fogNear;
  uniform float fogFar;
  varying vec3 vFogPosition;
#endif`;
  ShaderChunk.fog_fragment = /* glsl */ `
#ifdef USE_FOG
  float fogDistance = distance( vFogPosition, vec3( 0.0, 0.0, - fogNear ) );
  float fogFactor = smoothstep( fogFar * 0.1, fogFar, fogDistance );
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`;
}

function setColor(target: Color, rgb: Rgb): void {
  target.setRGB(rgb[0], rgb[1], rgb[2], SRGBColorSpace);
}

export interface Sky {
  /**
   * Brings lights, sky and haze up to date. Call every frame with the camera's position and
   * its distance from what it is looking at (the player's character; 0 if there is none).
   */
  update(look: SceneLook, cameraPosition: { x: number; y: number; z: number }, focusDistance: number): void;
}

export function createSky(scene: Scene): Sky {
  const ambient = new AmbientLight(0xffffff, 0.45);
  const sun = new DirectionalLight(0xffffff, 0);
  const moon = new DirectionalLight(MOON_COLOR, 0);
  moon.position.set(MOON_DIRECTION[0], MOON_DIRECTION[1], MOON_DIRECTION[2]).multiplyScalar(LIGHT_DISTANCE);

  const topColor = new Color();
  const horizonColor = new Color();
  const sunColor = new Color();
  const sunDirection = new Vector3(0, 1, 0);
  const sunStrength = { value: 0 };
  const dome = new Mesh(
    new SphereGeometry(DOME_RADIUS, 32, 16),
    new ShaderMaterial({
      uniforms: {
        topColor: { value: topColor },
        horizonColor: { value: horizonColor },
        sunColor: { value: sunColor },
        sunDirection: { value: sunDirection },
        sunStrength,
      },
      vertexShader: gradientVertex,
      fragmentShader: gradientFragment,
      side: BackSide,
      depthWrite: false,
      fog: false,
    }),
  );
  // The dome moves with the camera, so its own bounds mean nothing; and it is drawn first.
  dome.frustumCulled = false;
  dome.renderOrder = -1;

  // Behind the dome, in case it ever leaves a gap: the horizon's colour.
  const background = new Color();
  scene.background = background;
  // Haze: slight and far off in clear weather, close and thick in a storm. The dome itself is
  // not hazed; its colours are set to match. This must happen before anything is drawn.
  countHazeFromFocus();
  const fog = new Fog(0xffffff, 0, 1000);
  scene.fog = fog;
  scene.add(ambient, sun, moon, dome);

  return {
    update(daylight, cameraPosition, focusDistance): void {
      setColor(fog.color, daylight.fogColor);
      // See countHazeFromFocus: `near` carries the distance to the character, `far` the visibility.
      fog.near = Math.max(focusDistance, 0);
      fog.far = daylight.fogFar;
      setColor(ambient.color, daylight.ambientColor);
      ambient.intensity = daylight.ambientIntensity;
      setColor(sun.color, daylight.sunColor);
      sun.intensity = daylight.sunIntensity;
      const [x, y, z] = daylight.sunDirection;
      sun.position.set(x, y, z).multiplyScalar(LIGHT_DISTANCE);
      moon.intensity = daylight.moonIntensity;

      setColor(background, daylight.skyHorizon);
      setColor(topColor, daylight.skyTop);
      setColor(horizonColor, daylight.skyHorizon);
      setColor(sunColor, daylight.sunColor);
      sunDirection.set(x, y, z);
      // The glow goes with the sunlight, so it fades as the sun sinks.
      sunStrength.value = Math.min(daylight.sunIntensity / FULL_DAYLIGHT, 1);
      dome.position.set(cameraPosition.x, cameraPosition.y, cameraPosition.z);
    },
  };
}
