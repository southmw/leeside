import { Box3, Group, InstancedMesh, Matrix4, type Mesh, type Object3D, Quaternion, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { PropModelDefinition } from "../world/propModels";
import { PROP_SUNK, type PropBox } from "../world/props";
import type { RockInstance } from "./propMesh";

/**
 * Models for props and rocks. A model is only the picture: a prop's collider is its box,
 * whose size comes from the same definition the model is fitted to.
 */

/** How far a model sits into the ground, in metres, so its wheels do not hover on a slope. */
const MODEL_SUNK = 0.08;
/** How much of a rock model's height is under the ground, so it sits in the ground rather than on it. */
const ROCK_BURIED = 0.15;

export interface PropModelLibrary {
  /**
   * A copy of the model, placed to stand where `box` is, or undefined if the model is not
   * available. Copies share the model's geometry and materials, so they must not be disposed.
   */
  create(definition: PropModelDefinition, box: PropBox): Object3D | undefined;
  /**
   * All rocks drawn with the models at `urls`, a few draw calls however many rocks there
   * are, or undefined if none of those models is available. The returned meshes share the
   * models' geometry and materials; dispose of the meshes themselves when done.
   */
  createRocks(urls: readonly string[], rocks: readonly RockInstance[]): InstancedMesh[] | undefined;
}

/** Moves `object` inside `holder` so that the middle of its underside is at the holder's origin. */
function standOnOrigin(holder: Group, object: Object3D): Vector3 {
  holder.add(object);
  holder.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(holder);
  const centre = bounds.getCenter(new Vector3());
  object.position.x -= centre.x;
  object.position.y -= bounds.min.y;
  object.position.z -= centre.z;
  return bounds.getSize(new Vector3());
}

/** The model of a prop at its final size, standing on the origin. */
function assemble(definition: PropModelDefinition, scenes: readonly Object3D[]): Object3D | undefined {
  const [width, , length] = definition.size;
  const whole = new Group();

  if (definition.arrange === "row") {
    // Each part is as wide as its share of the width, one after the other from west to east.
    const share = width / scenes.length;
    scenes.forEach((scene, index) => {
      const part = new Group();
      const size = standOnOrigin(part, scene.clone(true));
      if (size.x > 0) {
        part.scale.setScalar(share / size.x);
      }
      part.position.x = -width / 2 + share * (index + 0.5);
      whole.add(part);
    });
  } else {
    // One model, or several that belong together and keep their places relative to each other.
    const parts = new Group();
    for (const scene of scenes) {
      parts.add(scene.clone(true));
    }
    const fitted = new Group();
    const size = standOnOrigin(fitted, parts);
    if (!(size.z > 0)) {
      return undefined;
    }
    fitted.scale.setScalar(length / size.z);
    whole.add(fitted);
  }

  if (!definition.upsideDown) {
    return whole;
  }
  whole.rotation.z = Math.PI;
  const turned = new Group();
  standOnOrigin(turned, whole);
  return turned;
}

/** One mesh of a rock model, with the transform that puts the model at the origin with radius 1. */
interface RockPart {
  mesh: Mesh;
  matrix: Matrix4;
}

function rockParts(scene: Object3D): RockPart[] {
  scene.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(scene);
  const size = bounds.getSize(new Vector3());
  const centre = bounds.getCenter(new Vector3());
  const radius = Math.max(size.x, size.z) / 2;
  if (!(radius > 0)) {
    return [];
  }
  const normalise = new Matrix4()
    .makeScale(1 / radius, 1 / radius, 1 / radius)
    .multiply(new Matrix4().makeTranslation(-centre.x, -bounds.min.y - size.y * ROCK_BURIED, -centre.z));
  const parts: RockPart[] = [];
  scene.traverse((child) => {
    if ((child as Mesh).isMesh) {
      parts.push({ mesh: child as Mesh, matrix: normalise.clone().multiply(child.matrixWorld) });
    }
  });
  return parts;
}

/**
 * Fetches the model files at `urls` (relative to `baseUrl`). A file that cannot be fetched is
 * left out, and whatever wanted it is drawn as a plain shape.
 */
export async function loadPropModels(baseUrl: string, urls: readonly string[]): Promise<PropModelLibrary> {
  const loader = new GLTFLoader();
  const scenes = new Map<string, Object3D>();
  await Promise.all(
    urls.map(async (url) => {
      try {
        scenes.set(url, (await loader.loadAsync(`${baseUrl}${url}`)).scene);
      } catch (error) {
        console.warn(`Prop model ${url} could not be loaded; using a plain shape instead.`, error);
      }
    }),
  );

  const assembled = new Map<PropModelDefinition, Object3D | undefined>();

  return {
    create(definition, box): Object3D | undefined {
      if (!assembled.has(definition)) {
        const parts = definition.urls.map((url) => scenes.get(url));
        const complete = parts.every((part): part is Object3D => part !== undefined);
        assembled.set(definition, complete ? assemble(definition, parts) : undefined);
      }
      const template = assembled.get(definition);
      if (!template) {
        return undefined;
      }
      const object = new Group();
      object.add(template.clone(true));
      const ground = box.center.y - box.halfExtents.y + PROP_SUNK;
      object.position.set(box.center.x, ground - MODEL_SUNK, box.center.z);
      object.rotation.y = box.yaw;
      return object;
    },

    createRocks(rockUrls, rocks): InstancedMesh[] | undefined {
      const models = rockUrls.flatMap((url) => {
        const scene = scenes.get(url);
        const parts = scene ? rockParts(scene) : [];
        return parts.length > 0 ? [parts] : [];
      });
      if (models.length === 0) {
        return undefined;
      }

      const meshes: InstancedMesh[] = [];
      const place = new Matrix4();
      const matrix = new Matrix4();
      const rotation = new Quaternion();
      const up = new Vector3(0, 1, 0);
      models.forEach((parts, modelIndex) => {
        // Rocks take the models in turn, which mixes them evenly over the zone.
        const own = rocks.filter((_, index) => index % models.length === modelIndex);
        for (const part of parts) {
          const mesh = new InstancedMesh(part.mesh.geometry, part.mesh.material, own.length);
          own.forEach((rock, index) => {
            rotation.setFromAxisAngle(up, rock.yaw);
            place.compose(new Vector3(rock.x, rock.groundY, rock.z), rotation, new Vector3(rock.size, rock.size, rock.size));
            mesh.setMatrixAt(index, matrix.multiplyMatrices(place, part.matrix));
          });
          mesh.instanceMatrix.needsUpdate = true;
          // Instances are spread over the whole zone; the default bounds would cull them wrongly.
          mesh.computeBoundingSphere();
          meshes.push(mesh);
        }
      });
      return meshes;
    },
  };
}
