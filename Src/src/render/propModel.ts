import { Box3, Group, type Object3D, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { PropModelDefinition } from "../world/propModels";
import { PROP_SUNK, type PropBox } from "../world/props";

/**
 * Models for props. A model replaces only the picture of a prop: it is fitted to the prop's
 * box, which stays the collider, so the layout and what blocks the player do not change.
 */

/** How far a model sits into the ground, in metres, so its wheels do not hover on a slope. */
const MODEL_SUNK = 0.08;

export interface PropModelLibrary {
  /**
   * A copy of the model, placed to stand where `box` is, or undefined if the model is not
   * available. Copies share the model's geometry and materials, so they must not be disposed.
   */
  create(definition: PropModelDefinition, box: PropBox): Object3D | undefined;
}

/** A model with its length (along Z), set up so that its origin is at the middle of its underside. */
interface Template {
  object: Object3D;
  length: number;
}

function prepare(scene: Object3D, upsideDown: boolean): Template {
  const holder = new Group();
  holder.add(scene);
  if (upsideDown) {
    scene.rotation.z = Math.PI;
  }
  holder.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(holder);
  const centre = bounds.getCenter(new Vector3());
  scene.position.set(-centre.x, -bounds.min.y, -centre.z);
  return { object: holder, length: bounds.max.z - bounds.min.z };
}

/**
 * Fetches the model files at `urls` (relative to `baseUrl`). A file that cannot be fetched is
 * left out, and props that wanted it are drawn as boxes.
 */
export async function loadPropModels(baseUrl: string, urls: readonly string[]): Promise<PropModelLibrary> {
  const loader = new GLTFLoader();
  const scenes = new Map<string, Object3D>();
  await Promise.all(
    urls.map(async (url) => {
      try {
        scenes.set(url, (await loader.loadAsync(`${baseUrl}${url}`)).scene);
      } catch (error) {
        console.warn(`Prop model ${url} could not be loaded; using a box instead.`, error);
      }
    }),
  );

  const templates = new Map<string, Template>();
  const templateFor = (definition: PropModelDefinition): Template | undefined => {
    const scene = scenes.get(definition.url);
    if (!scene) {
      return undefined;
    }
    const key = `${definition.url}|${definition.upsideDown ? "down" : "up"}`;
    let template = templates.get(key);
    if (!template) {
      template = prepare(scene.clone(true), definition.upsideDown === true);
      templates.set(key, template);
    }
    return template;
  };

  return {
    create(definition, box): Object3D | undefined {
      const template = templateFor(definition);
      if (!template || !(template.length > 0)) {
        return undefined;
      }
      const object = template.object.clone(true);
      // As long as the box, whatever the model's own size; width and height follow.
      object.scale.setScalar((box.halfExtents.z * 2) / template.length);
      const ground = box.center.y - box.halfExtents.y + PROP_SUNK;
      object.position.set(box.center.x, ground - MODEL_SUNK, box.center.z);
      object.rotation.y = box.yaw;
      return object;
    },
  };
}
