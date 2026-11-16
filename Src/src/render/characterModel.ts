import { type AnimationAction, AnimationMixer, Box3, Group, LoopRepeat, type Object3D } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  type AnimationInput,
  type CharacterAnimation,
  chooseAnimation,
  jumpClipTime,
  runPlaybackRate,
} from "./characterAnimation";

/** Names of the clips in the model file for each animation the game uses. */
const CLIP_NAMES: Readonly<Record<CharacterAnimation, string>> = { idle: "Idle", run: "Running", jump: "Jump" };
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
 * Loads a character model with "Idle", "Running" and "Jump" clips and scales it to `height`
 * metres. The model is turned so that it faces -Z, the direction a facing of 0 means in the
 * game (the file's character faces +Z).
 */
export async function loadCharacterModel(url: string, height: number): Promise<CharacterModel> {
  const gltf = await new GLTFLoader().loadAsync(url);
  const model = gltf.scene;

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
  for (const [animation, clipName] of Object.entries(CLIP_NAMES) as Array<[CharacterAnimation, string]>) {
    const clip = gltf.animations.find((candidate) => candidate.name === clipName);
    if (!clip) {
      throw new Error(`Character model ${url} has no "${clipName}" animation`);
    }
    actions[animation] = mixer.clipAction(clip).setLoop(LoopRepeat, Number.POSITIVE_INFINITY);
  }
  // The jump clip does not play by itself: its position is set from the time spent in the air.
  actions.jump.timeScale = 0;

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
        if (next === "jump") {
          actions.jump.timeScale = 0;
        }
        actions[current].crossFadeTo(actions[next], next === "jump" ? JUMP_BLEND_SECONDS : BLEND_SECONDS, false);
        current = next;
      }
      actions.run.timeScale = runPlaybackRate(input.speed);
      if (current === "jump") {
        actions.jump.time = jumpClipTime(airborneSeconds);
      }
      mixer.update(dt);
    },
  };
}
