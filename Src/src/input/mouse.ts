import { clamp } from "../core/math";

/**
 * Mouse look and wheel. The browser only reports unbounded mouse movement while the pointer is locked
 * to the page, which it allows after a click and which the player leaves with Esc.
 */

/** `WheelEvent.deltaMode` values. */
const DELTA_LINE = 1;
const DELTA_PAGE = 2;
/** What one notch of an ordinary mouse wheel reports, in pixels and in lines. */
const PIXELS_PER_NOTCH = 100;
const LINES_PER_NOTCH = 3;

/**
 * Converts a wheel event into notches (positive: rolled back, towards the player). Devices
 * report in different units, and touchpads send a stream of small values, so the result is
 * a fraction for those and never more than one notch per event.
 */
export function wheelNotches(deltaY: number, deltaMode: number): number {
  if (!Number.isFinite(deltaY)) {
    return 0;
  }
  const notches =
    deltaMode === DELTA_PAGE ? Math.sign(deltaY) : deltaY / (deltaMode === DELTA_LINE ? LINES_PER_NOTCH : PIXELS_PER_NOTCH);
  return clamp(notches, -1, 1);
}

/** The parts of the canvas and the document the mouse needs. Tests pass stand-ins. */
export interface PointerLockCanvas {
  requestPointerLock(): unknown;
  addEventListener(type: "click", listener: () => void): void;
  removeEventListener(type: "click", listener: () => void): void;
}
export interface PointerLockDocument {
  readonly pointerLockElement: unknown;
  addEventListener(type: string, listener: (event: Event) => void, options?: { passive?: boolean }): void;
  removeEventListener(type: string, listener: (event: Event) => void): void;
}

export interface Mouse {
  /** True while mouse movement turns the view. */
  readonly locked: boolean;
  /** Returns the movement in pixels since the previous call (x: right, y: down) and resets it. */
  takeMovement(): { x: number; y: number };
  /** The movement collected so far, without resetting it. */
  peekMovement(): { x: number; y: number };
  /**
   * Returns how far the wheel was rolled since the previous call, in notches (positive:
   * rolled back, towards the player), and resets it. Counted while locked, or whenever the
   * pointer is over the game.
   */
  takeWheel(): number;
  /** Calls `listener` whenever the lock is gained or lost. */
  onLockChange(listener: (locked: boolean) => void): void;
  dispose(): void;
}

export function createMouse(canvas: PointerLockCanvas, doc: PointerLockDocument): Mouse {
  let x = 0;
  let y = 0;
  let wheel = 0;
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
  const onWheel = (event: Event): void => {
    // The wheel works with or without mouse look, as long as it is rolled over the game.
    if (isLocked() || (event.target as unknown) === canvas) {
      const { deltaY = 0, deltaMode = 0 } = event as WheelEvent;
      wheel += wheelNotches(deltaY, deltaMode);
      // Keep the page from scrolling or zooming under the game.
      event.preventDefault();
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
  doc.addEventListener("wheel", onWheel, { passive: false });

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
    peekMovement() {
      return { x, y };
    },
    takeWheel() {
      const notches = wheel;
      wheel = 0;
      return notches;
    },
    onLockChange(listener) {
      listeners.push(listener);
    },
    dispose(): void {
      canvas.removeEventListener("click", onClick);
      doc.removeEventListener("mousemove", onMouseMove);
      doc.removeEventListener("pointerlockchange", onLockChange);
      doc.removeEventListener("wheel", onWheel);
    },
  };
}
