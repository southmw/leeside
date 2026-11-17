import { type AnimationAction, AnimationMixer, Box3, Group, LoopRepeat, type Object3D } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  type AnimationInput,
  type CharacterAnimation,
  chooseAnimation,
  runPlaybackRate,
} from "./characterAnimation";
import type { CharacterDefinition } from "./characterCatalog";

/** Seconds to blend from one animation to the next. Leaving the ground is quicker than landing. */
const BLEND_SECONDS = 0.15;
const JUMP_BLEND_SECONDS = 0.06;

/** What the animation needs to know each frame. Time in the air is tracked by the model itself. */
export type CharacterModelInput = Omit<AnimationInput, "airborneSeconds">;

export interface CharacterModel {
  /** Add this to the scene (or to the object that follows the entity). Its origin is at the feet. */
  readonly object: Object3D;
  /** The animation playing now. */
  readonly animation: CharacterAnimation;
  /** Advances the animation. Call once per rendered frame. */
  update(dtSeconds: number, input: CharacterModelInput): void;
}

/**
 * Loads the character described by `definition` and scales it to `height` metres. `baseUrl`
 * is the folder the definition's path is relative to. The model is turned so that it faces
 * -Z, the direction a facing of 0 means in the game (the files' characters face +Z).
 */
export async function loadCharacterModel(
  definition: CharacterDefinition,
  baseUrl: string,
  height: number,
): Promise<CharacterModel> {
  const gltf = await new GLTFLoader().loadAsync(`${baseUrl}${definition.url}`);
  const model = gltf.scene;

  // Skinned meshes are measured in their posed shape, which needs the bones' matrices.
  model.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(model);
  const modelHeight = bounds.max.y - bounds.min.y;
  const scale = modelHeight > 0 ? height / modelHeight : 1;
  model.scale.setScalar(scale);
  // Feet on the origin, whatever the file's own origin is.
  model.position.y = -bounds.min.y * scale;
  model.rotation.y = Math.PI;

  const object = new Group();
  object.add(model);

  const mixer = new AnimationMixer(model);
  const actions = {} as Record<CharacterAnimation, AnimationAction>;
  for (const [animation, clipName] of Object.entries(definition.clips) as Array<[CharacterAnimation, string]>) {
    const clip = gltf.animations.find((candidate) => candidate.name === clipName);
    if (!clip) {
      throw new Error(`Character "${definition.id}" has no "${clipName}" animation`);
    }
    actions[animation] = mixer.clipAction(clip).setLoop(LoopRepeat, Number.POSITIVE_INFINITY);
  }

  let current: CharacterAnimation = "idle";
  let airborneSeconds = 0;
  actions.idle.play();

  return {
    object,
    get animation(): CharacterAnimation {
      return current;
    },
    update(dtSeconds, input): void {
      const dt = Math.max(dtSeconds, 0);
      airborneSeconds = input.grounded ? 0 : airborneSeconds + dt;

      const next = chooseAnimation({ ...input, airborneSeconds });
      if (next !== current) {
        actions[next].reset().play();
        actions[current].crossFadeTo(actions[next], next === "jump" ? JUMP_BLEND_SECONDS : BLEND_SECONDS, false);
        current = next;
      }
      actions.run.timeScale = runPlaybackRate(input.speed, definition.runClipSpeed);
      mixer.update(dt);
    },
  };
}
