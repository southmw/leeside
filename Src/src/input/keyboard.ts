export interface Keyboard {
  /** Codes of the keys currently held down (`KeyboardEvent.code`). */
  readonly pressed: ReadonlySet<string>;
  dispose(): void;
}

/** Tracks which keys are held. Keys are released when the window loses focus, so none get stuck. */
export function createKeyboard(target: Window = window): Keyboard {
  const pressed = new Set<string>();

  const onKeyDown = (event: KeyboardEvent): void => {
    pressed.add(event.code);
  };
  const onKeyUp = (event: KeyboardEvent): void => {
    pressed.delete(event.code);
  };
  const onBlur = (): void => {
    pressed.clear();
  };

  target.addEventListener("keydown", onKeyDown);
  target.addEventListener("keyup", onKeyUp);
  target.addEventListener("blur", onBlur);

  return {
    pressed,
    dispose(): void {
      target.removeEventListener("keydown", onKeyDown);
      target.removeEventListener("keyup", onKeyUp);
      target.removeEventListener("blur", onBlur);
      pressed.clear();
    },
  };
}
