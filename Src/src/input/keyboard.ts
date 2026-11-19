/** The part of `window` the keyboard listens on. Tests pass a plain EventTarget. */
export type KeyboardTarget = Pick<Window, "addEventListener" | "removeEventListener">;

export interface Keyboard {
  /** Codes of the keys currently held down (`KeyboardEvent.code`). */
  readonly pressed: ReadonlySet<string>;
  /**
   * The keys to count as down for one simulation step: those held now, and those pressed and
   * let go again since the last call. Without the second kind a quick tap that falls between
   * two steps (a long frame is enough) would never be seen. The set is reused by the next call.
   */
  takeHeld(): ReadonlySet<string>;
  /** Forgets every held key. A key that is still physically down comes back with its next repeat. */
  releaseAll(): void;
  dispose(): void;
}

/**
 * Tracks which keys are held.
 *
 * A key-up that the page never receives would leave its key stuck down, and the character
 * walking on its own. The browser cannot be asked whether a key is down, so every key is
 * released whenever a key-up might be missed: when the window loses focus, when the tab is
 * hidden, and when the context menu is requested. The menu takes the keyboard without a blur
 * event, so it is also suppressed; releasing the keys covers browsers that open it anyway.
 * `createLocalInput` adds a per-step focus check as a last line of defence.
 */
export function createKeyboard(target: KeyboardTarget = window): Keyboard {
  const pressed = new Set<string>();
  /** Keys that have gone down since the last `takeHeld`, whether or not they are still down. */
  const tapped = new Set<string>();
  const held = new Set<string>();

  const onKeyDown = (event: KeyboardEvent): void => {
    pressed.add(event.code);
    tapped.add(event.code);
  };
  const onKeyUp = (event: KeyboardEvent): void => {
    pressed.delete(event.code);
  };
  const releaseAll = (): void => {
    pressed.clear();
    tapped.clear();
  };
  const onContextMenu = (event: Event): void => {
    event.preventDefault();
    releaseAll();
  };

  target.addEventListener("keydown", onKeyDown);
  target.addEventListener("keyup", onKeyUp);
  target.addEventListener("blur", releaseAll);
  target.addEventListener("visibilitychange", releaseAll);
  target.addEventListener("contextmenu", onContextMenu);

  return {
    pressed,
    takeHeld(): ReadonlySet<string> {
      held.clear();
      for (const code of pressed) {
        held.add(code);
      }
      for (const code of tapped) {
        held.add(code);
      }
      tapped.clear();
      return held;
    },
    releaseAll,
    dispose(): void {
      target.removeEventListener("keydown", onKeyDown);
      target.removeEventListener("keyup", onKeyUp);
      target.removeEventListener("blur", releaseAll);
      target.removeEventListener("visibilitychange", releaseAll);
      target.removeEventListener("contextmenu", onContextMenu);
      pressed.clear();
      tapped.clear();
    },
  };
}
