/**
 * Mouse look. The browser only reports unbounded mouse movement while the pointer is locked
 * to the page, which it allows after a click and which the player leaves with Esc.
 */

/** The parts of the canvas and the document the mouse needs. Tests pass stand-ins. */
export interface PointerLockCanvas {
  requestPointerLock(): unknown;
  addEventListener(type: "click", listener: () => void): void;
  removeEventListener(type: "click", listener: () => void): void;
}
export interface PointerLockDocument {
  readonly pointerLockElement: unknown;
  addEventListener(type: string, listener: (event: Event) => void): void;
  removeEventListener(type: string, listener: (event: Event) => void): void;
}

export interface Mouse {
  /** True while mouse movement turns the view. */
  readonly locked: boolean;
  /** Returns the movement in pixels since the previous call (x: right, y: down) and resets it. */
  takeMovement(): { x: number; y: number };
  /** Calls `listener` whenever the lock is gained or lost. */
  onLockChange(listener: (locked: boolean) => void): void;
  dispose(): void;
}

export function createMouse(canvas: PointerLockCanvas, doc: PointerLockDocument): Mouse {
  let x = 0;
  let y = 0;
  const listeners: Array<(locked: boolean) => void> = [];
  const isLocked = (): boolean => doc.pointerLockElement === canvas;

  const onClick = (): void => {
    if (!isLocked()) {
      // Browsers may refuse (for example right after Esc); the next click simply tries again.
      void Promise.resolve(canvas.requestPointerLock()).catch(() => {});
    }
  };
  const onMouseMove = (event: Event): void => {
    if (isLocked()) {
      const { movementX = 0, movementY = 0 } = event as MouseEvent;
      x += movementX;
      y += movementY;
    }
  };
  const onLockChange = (): void => {
    // Movement from before or after the lock must not turn the view later.
    x = 0;
    y = 0;
    for (const listener of listeners) {
      listener(isLocked());
    }
  };

  canvas.addEventListener("click", onClick);
  doc.addEventListener("mousemove", onMouseMove);
  doc.addEventListener("pointerlockchange", onLockChange);

  return {
    get locked(): boolean {
      return isLocked();
    },
    takeMovement() {
      const movement = { x, y };
      x = 0;
      y = 0;
      return movement;
    },
    onLockChange(listener) {
      listeners.push(listener);
    },
    dispose(): void {
      canvas.removeEventListener("click", onClick);
      doc.removeEventListener("mousemove", onMouseMove);
      doc.removeEventListener("pointerlockchange", onLockChange);
    },
  };
}
