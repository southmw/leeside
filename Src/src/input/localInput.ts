import { actionsFromKeys, DEFAULT_KEY_BINDINGS, type KeyBindings, type PlayerActions } from "./actions";
import { createKeyboard, type KeyboardTarget } from "./keyboard";

export interface LocalInput {
  /** Reads the devices and returns this step's actions for the player at this machine. */
  sample(): PlayerActions;
  dispose(): void;
}

export interface LocalInputOptions {
  bindings?: KeyBindings;
  /** Where key events are listened for. Defaults to `window`. */
  target?: KeyboardTarget;
  /** Whether the page has keyboard focus. Defaults to `document.hasFocus()`. */
  hasFocus?: () => boolean;
}

/**
 * Input for the local player. Mouse look (step 1.4) and gamepad (step 0.8) plug in here and
 * merge into the same `PlayerActions`.
 */
export function createLocalInput(options: LocalInputOptions = {}): LocalInput {
  const bindings = options.bindings ?? DEFAULT_KEY_BINDINGS;
  const hasFocus = options.hasFocus ?? (() => document.hasFocus());
  const keyboard = createKeyboard(options.target);
  return {
    sample(): PlayerActions {
      // Without focus the page receives no key events, so whatever is held cannot be trusted.
      if (!hasFocus()) {
        keyboard.releaseAll();
      }
      return actionsFromKeys(keyboard.pressed, bindings);
    },
    dispose: () => keyboard.dispose(),
  };
}
