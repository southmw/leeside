import { actionsFromKeys, DEFAULT_KEY_BINDINGS, type KeyBindings, type PlayerActions } from "./actions";
import { createKeyboard } from "./keyboard";

export interface LocalInput {
  /** Reads the devices and returns this step's actions for the player at this machine. */
  sample(): PlayerActions;
  dispose(): void;
}

/**
 * Input for the local player. Mouse look (step 1.4) and gamepad (step 0.8) plug in here and
 * merge into the same `PlayerActions`.
 */
export function createLocalInput(bindings: KeyBindings = DEFAULT_KEY_BINDINGS): LocalInput {
  const keyboard = createKeyboard();
  return {
    sample: () => actionsFromKeys(keyboard.pressed, bindings),
    dispose: () => keyboard.dispose(),
  };
}
