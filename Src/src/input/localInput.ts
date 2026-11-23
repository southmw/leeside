import { actionsFromKeys, DEFAULT_KEY_BINDINGS, type KeyBindings, type PlayerActions } from "./actions";
import { MOUSE_SENSITIVITY } from "../data/tuning";
import { createKeyboard, type KeyboardTarget } from "./keyboard";
import type { Mouse } from "./mouse";

export interface LocalInput {
  /** Reads the devices and returns this step's actions for the player at this machine. */
  sample(): PlayerActions;
  /**
   * Look input that has arrived since the last `sample` and will be part of the next one, in
   * radians. Drawing adds it to the view, so the camera follows the mouse every frame.
   */
  pendingLook(): { lookX: number; lookY: number };
  dispose(): void;
}

export interface LocalInputOptions {
  bindings?: KeyBindings;
  /** Where key events are listened for. Defaults to `window`. */
  target?: KeyboardTarget;
  /** Whether the page has keyboard focus. Defaults to `document.hasFocus()`. */
  hasFocus?: () => boolean;
  /** Mouse look. Without it the view cannot be turned. */
  mouse?: Mouse;
  /** Radians of turn per pixel of mouse movement. */
  sensitivity?: number;
  /**
   * The player's settings for looking, asked for each time: a factor on the sensitivity, and
   * whether moving the mouse up looks down. Without it the factor is 1 and nothing is inverted.
   */
  look?: () => { sensitivity: number; invertY: boolean };
}

/**
 * Input for the local player: keyboard and mouse look merged into one `PlayerActions`.
 * The gamepad (step 0.8) will plug in here too.
 */
export function createLocalInput(options: LocalInputOptions = {}): LocalInput {
  const bindings = options.bindings ?? DEFAULT_KEY_BINDINGS;
  const hasFocus = options.hasFocus ?? (() => document.hasFocus());
  const keyboard = createKeyboard(options.target);
  const { mouse } = options;
  const sensitivity = options.sensitivity ?? MOUSE_SENSITIVITY;
  /** Mouse movement in pixels as a turn of the view in radians. */
  const turn = (movement: { x: number; y: number }): { lookX: number; lookY: number } => {
    const look = options.look?.() ?? { sensitivity: 1, invertY: false };
    const scale = sensitivity * look.sensitivity;
    return { lookX: movement.x * scale, lookY: movement.y * scale * (look.invertY ? -1 : 1) };
  };
  return {
    sample(): PlayerActions {
      // Without focus the page receives no key events, so whatever is held cannot be trusted.
      if (!hasFocus()) {
        keyboard.releaseAll();
      }
      // Keys tapped between two steps count for this one, so a quick press is never lost.
      const actions = actionsFromKeys(keyboard.takeHeld(), bindings);
      if (mouse) {
        Object.assign(actions, turn(mouse.takeMovement()));
      }
      return actions;
    },
    pendingLook() {
      return turn(mouse?.peekMovement() ?? { x: 0, y: 0 });
    },
    dispose: () => keyboard.dispose(),
  };
}
