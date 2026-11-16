import { clamp } from "../core/math";

/**
 * Mouse look and wheel.
 *
 * The view turns while a mouse button is held down over the game and the mouse is moved;
 * letting go stops it and leaves the cursor free. While a button is held the pointer is
 * locked to the page, so the mouse can keep moving without the cursor hitting the edge of
 * the screen. If the browser refuses the lock, dragging still works, only limited by the
 * screen's edge.
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
  addEventListener(type: string, listener: (event: Event) => void): void;
  removeEventListener(type: string, listener: (event: Event) => void): void;
}
export interface PointerLockDocument {
  readonly pointerLockElement: unknown;
  exitPointerLock(): void;
  addEventListener(type: string, listener: (event: Event) => void, options?: { passive?: boolean }): void;
  removeEventListener(type: string, listener: (event: Event) => void): void;
}

/** Mouse buttons that turn the view while held: left and right (`MouseEvent.button`). */
const LOOK_BUTTONS: readonly number[] = [0, 2];

export interface Mouse {
  /** True while a button is held and mouse movement turns the view. */
  readonly looking: boolean;
  /** Returns the movement in pixels since the previous call (x: right, y: down) and resets it. */
  takeMovement(): { x: number; y: number };
  /** The movement collected so far, without resetting it. */
  peekMovement(): { x: number; y: number };
  /**
   * Returns how far the wheel was rolled since the previous call, in notches (positive:
   * rolled back, towards the player), and resets it. Counted whenever the pointer is over
   * the game, and while looking.
   */
  takeWheel(): number;
  /** Calls `listener` whenever looking starts or stops. */
  onLookChange(listener: (looking: boolean) => void): void;
  dispose(): void;
}

export function createMouse(canvas: PointerLockCanvas, doc: PointerLockDocument): Mouse {
  let x = 0;
  let y = 0;
  let wheel = 0;
  let looking = false;
  const listeners: Array<(looking: boolean) => void> = [];

  const setLooking = (next: boolean): void => {
    if (next === looking) {
      return;
    }
    looking = next;
    // Movement from before the button went down must not turn the view.
    x = 0;
    y = 0;
    for (const listener of listeners) {
      listener(looking);
    }
  };

  const stopLooking = (): void => {
    setLooking(false);
    if (doc.pointerLockElement === canvas) {
      doc.exitPointerLock();
    }
  };

  const onMouseDown = (event: Event): void => {
    if (!LOOK_BUTTONS.includes((event as MouseEvent).button)) {
      return;
    }
    setLooking(true);
    if (doc.pointerLockElement !== canvas) {
      // Browsers may refuse; dragging then works without the lock.
      void Promise.resolve(canvas.requestPointerLock()).catch(() => {});
    }
  };
  const onMouseUp = (event: Event): void => {
    // `buttons` lists what is still held; looking ends when the last look button is released.
    const stillHeld = (event as MouseEvent).buttons ?? 0;
    const LEFT_AND_RIGHT = 1 | 2;
    if ((stillHeld & LEFT_AND_RIGHT) === 0) {
      stopLooking();
    }
  };
  const onMouseMove = (event: Event): void => {
    if (looking) {
      const { movementX = 0, movementY = 0 } = event as MouseEvent;
      x += movementX;
      y += movementY;
    }
  };
  const onWheel = (event: Event): void => {
    if (looking || (event.target as unknown) === canvas) {
      const { deltaY = 0, deltaMode = 0 } = event as WheelEvent;
      wheel += wheelNotches(deltaY, deltaMode);
      // Keep the page from scrolling or zooming under the game.
      event.preventDefault();
    }
  };
  const onLockChange = (): void => {
    // The lock ended some other way (Esc, a window switch): the button's release may never arrive.
    if (looking && doc.pointerLockElement !== canvas && lockSeen) {
      setLooking(false);
    }
    lockSeen = doc.pointerLockElement === canvas;
  };
  let lockSeen = false;

  canvas.addEventListener("mousedown", onMouseDown);
  doc.addEventListener("mouseup", onMouseUp);
  doc.addEventListener("mousemove", onMouseMove);
  doc.addEventListener("pointerlockchange", onLockChange);
  doc.addEventListener("wheel", onWheel, { passive: false });

  return {
    get looking(): boolean {
      return looking;
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
    onLookChange(listener) {
      listeners.push(listener);
    },
    dispose(): void {
      canvas.removeEventListener("mousedown", onMouseDown);
      doc.removeEventListener("mouseup", onMouseUp);
      doc.removeEventListener("mousemove", onMouseMove);
      doc.removeEventListener("pointerlockchange", onLockChange);
      doc.removeEventListener("wheel", onWheel);
    },
  };
}
