import {
  AmbientLight,
  BackSide,
  Color,
  DirectionalLight,
  Fog,
  Material,
  Matrix3,
  Mesh,
  type PerspectiveCamera,
  type Scene,
  ShaderChunk,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  Vector4,
} from "three";
import { MOON_COLOR, MOON_DIRECTION, type Rgb } from "./daylight";
import type { SceneLook } from "./stormLook";
import { type StormWall, WALL_HEIGHT } from "./stormWall";

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
/** The storm wall's colour: the dust's, this much darker, and never darker than this (0 to 1 per channel). */
const WALL_SHADE = 0.8;
const NIGHT_WALL: Rgb = [0.2, 0.15, 0.1];
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
// The storm wall: how far south of the camera its face stands (negative once it has passed),
// its height, colour and how solid it is, and the camera's position along the wall.
uniform float wallDistance;
uniform float wallHeight;
uniform vec3 wallColor;
uniform float wallOpacity;
uniform float wallAlong;
uniform float seconds;
varying vec3 vDirection;

// Cheap rolling noise for the wall's billows: smooth random values on a grid, three sizes added up.
float hash(vec2 cell) {
  return fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
}
float valueNoise(vec2 point) {
  vec2 cell = floor(point);
  vec2 within = fract(point);
  // ("smooth" is a reserved word in this shading language.)
  vec2 eased = within * within * (3.0 - 2.0 * within);
  return mix(
    mix(hash(cell), hash(cell + vec2(1.0, 0.0)), eased.x),
    mix(hash(cell + vec2(0.0, 1.0)), hash(cell + vec2(1.0, 1.0)), eased.x),
    eased.y);
}
float billows(vec2 point) {
  return 0.5 * valueNoise(point) + 0.3 * valueNoise(point * 2.1) + 0.2 * valueNoise(point * 4.3);
}

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
  // The storm wall is an upright plane running east to west. Where the line of sight meets
  // it below its top, the sky is the wall's colour. South is +Z.
  if (wallOpacity > 0.0) {
    float wall = 0.0;
    if (wallDistance <= 0.0 && direction.z >= 0.0) {
      // The face has passed the camera: to the south there is only dust.
      wall = 1.0;
    } else if (direction.z * wallDistance > 0.0) {
      float reach = wallDistance / direction.z;
      float height = direction.y * reach;
      // A billowing top that churns as it comes, instead of a ruled line standing still.
      float along = wallAlong + direction.x * reach;
      float churn = billows(vec2(along * 0.006, seconds * 0.12));
      float top = wallHeight * (0.7 + 0.3 * churn);
      wall = 1.0 - smoothstep(top * 0.8, top, height);
      // Clouds of dust rolling up the face.
      float roll = billows(vec2(along * 0.012, height * 0.02 - seconds * 0.35));
      float rise = clamp(height / wallHeight, 0.0, 1.0);
      // Dark and dense at the foot, lit along the top, mottled in between.
      vec3 shaded = wallColor * mix(0.45, 1.0, rise) * (0.75 + 0.5 * roll);
      color = mix(color, shaded, wall * wallOpacity);
    }
    if (wall >= 1.0 && wallDistance <= 0.0) {
      color = mix(color, wallColor * 0.8, wallOpacity);
    }
  }
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
 *
 * The same piece of shader hides what lies beyond the storm wall: anything south of the wall's
 * face takes the wall's colour, so buildings do not show in front of a wall that has already
 * swallowed them. Near the character things stay visible; there the haze does the hiding.
 */
const stormWallUniforms = {
  /** The wall's face as a plane in view space: positive on the far (south) side. */
  stormWallPlane: { value: new Vector4(0, 0, 0, -1) },
  stormWallColor: { value: new Color() },
  stormWallOpacity: { value: 0 },
};

function countHazeFromFocus(): void {
  // Every built-in material gets the wall's values; they are shared, so one update reaches all.
  Material.prototype.onBeforeCompile = function addStormWall(shader): void {
    Object.assign(shader.uniforms, stormWallUniforms);
  };
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
  uniform vec4 stormWallPlane;
  uniform vec3 stormWallColor;
  uniform float stormWallOpacity;
  varying vec3 vFogPosition;
#endif`;
  ShaderChunk.fog_fragment = /* glsl */ `
#ifdef USE_FOG
  float fogDistance = distance( vFogPosition, vec3( 0.0, 0.0, - fogNear ) );
  float fogFactor = smoothstep( fogFar * 0.1, fogFar, fogDistance );
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
  float intoWall = dot( stormWallPlane.xyz, vFogPosition ) + stormWallPlane.w;
  float swallowed = smoothstep( 0.0, 40.0, intoWall ) * smoothstep( 8.0, 40.0, fogDistance ) * stormWallOpacity;
  gl_FragColor.rgb = mix( gl_FragColor.rgb, stormWallColor, swallowed );
#endif`;
}

function setColor(target: Color, rgb: Rgb): void {
  target.setRGB(rgb[0], rgb[1], rgb[2], SRGBColorSpace);
}

export interface Sky {
  /**
   * Brings lights, sky, haze and the storm wall up to date. Call every frame, once the camera
   * is placed. `focus` is what the camera looks at (the player's character; the camera's own
   * position if there is none); the wall's distance is counted from there. `seconds` is a
   * clock that keeps running, for what moves in the sky.
   */
  update(
    look: SceneLook,
    wall: StormWall,
    camera: PerspectiveCamera,
    focus: { x: number; y: number; z: number },
    seconds: number,
  ): void;
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
  const wallDistance = { value: 0 };
  const wallOpacity = { value: 0 };
  const wallAlong = { value: 0 };
  const skySeconds = { value: 0 };
  const viewRotation = new Matrix3();
  const south = new Vector3();
  const dome = new Mesh(
    new SphereGeometry(DOME_RADIUS, 32, 16),
    new ShaderMaterial({
      uniforms: {
        topColor: { value: topColor },
        horizonColor: { value: horizonColor },
        sunColor: { value: sunColor },
        sunDirection: { value: sunDirection },
        sunStrength,
        wallDistance,
        wallHeight: { value: WALL_HEIGHT },
        wallColor: { value: stormWallUniforms.stormWallColor.value },
        wallOpacity,
        wallAlong,
        seconds: skySeconds,
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
    update(daylight, wall, camera, focus, seconds): void {
      skySeconds.value = seconds;
      const cameraPosition = camera.position;
      setColor(fog.color, daylight.fogColor);
      // See countHazeFromFocus: `near` carries the distance to the character, `far` the visibility.
      fog.near = cameraPosition.distanceTo(focus);
      fog.far = daylight.fogFar;

      // The wall's face runs east to west at this Z; beyond it (greater Z) is inside the wall.
      const wallZ = focus.z + wall.distance;
      camera.updateMatrixWorld();
      viewRotation.setFromMatrix4(camera.matrixWorldInverse);
      south.set(0, 0, 1).applyMatrix3(viewRotation);
      stormWallUniforms.stormWallPlane.value.set(south.x, south.y, south.z, cameraPosition.z - wallZ);
      // The wall is darker than the air by day, so it stands out against the pale horizon;
      // by night it keeps a little of its colour, or it would vanish into the dark sky.
      setColor(stormWallUniforms.stormWallColor.value, [
        Math.max(daylight.dust[0] * WALL_SHADE, NIGHT_WALL[0]),
        Math.max(daylight.dust[1] * WALL_SHADE, NIGHT_WALL[1]),
        Math.max(daylight.dust[2] * WALL_SHADE, NIGHT_WALL[2]),
      ]);
      stormWallUniforms.stormWallOpacity.value = wall.opacity;
      wallDistance.value = wallZ - cameraPosition.z;
      wallOpacity.value = wall.opacity;
      wallAlong.value = cameraPosition.x;
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
