import { describe, expect, it, vi } from "vitest";
import type { KeyboardTarget } from "../../src/input/keyboard";
import { createLocalInput } from "../../src/input/localInput";
import { createMouse, type PointerLockCanvas, type PointerLockDocument, wheelNotches } from "../../src/input/mouse";

const LEFT = 0;
const MIDDLE = 1;
const RIGHT = 2;

/**
 * Stand-ins for the canvas and the document. The pointer lock is granted as soon as it is
 * requested, unless `grantLock` is false (a browser that refuses).
 */
function setup(grantLock = true) {
  const canvasEvents = new EventTarget();
  const docEvents = new EventTarget();
  let lockElement: unknown = null;
  const setLock = (element: unknown): void => {
    lockElement = element;
    docEvents.dispatchEvent(new Event("pointerlockchange"));
  };

  const requestPointerLock = vi.fn(() => {
    if (grantLock) {
      setLock(canvas);
    }
  });
  const canvas = Object.assign(canvasEvents, { requestPointerLock }) as unknown as PointerLockCanvas;
  const exitPointerLock = vi.fn(() => setLock(null));
  const doc = Object.defineProperties(docEvents, {
    pointerLockElement: { get: () => lockElement },
    exitPointerLock: { value: exitPointerLock },
  }) as unknown as PointerLockDocument;

  const mouse = createMouse(canvas, doc);
  return {
    mouse,
    requestPointerLock,
    exitPointerLock,
    isLocked: () => lockElement === canvas,
    press: (button = LEFT) => canvasEvents.dispatchEvent(Object.assign(new Event("mousedown"), { button })),
    /** Releases a button; `buttons` is the bit mask of those still held (1 left, 2 right). */
    release: (buttons = 0) => docEvents.dispatchEvent(Object.assign(new Event("mouseup"), { buttons })),
    move: (movementX: number, movementY: number) =>
      docEvents.dispatchEvent(Object.assign(new Event("mousemove"), { movementX, movementY })),
    /** Rolls the wheel with the pointer over the game canvas, or over something else on the page. */
    wheel(deltaY: number, deltaMode = 0, overGame = true) {
      const event = Object.assign(new Event("wheel", { cancelable: true }), { deltaY, deltaMode });
      Object.defineProperty(event, "target", { value: overGame ? canvas : {} });
      docEvents.dispatchEvent(event);
      return event;
    },
    /** The browser ends the lock by itself, as it does on Esc. */
    loseLock: () => setLock(null),
  };
}

describe("createMouse", () => {
  it("does not turn the view when the mouse moves without a button held", () => {
    const { mouse, move } = setup();
    move(50, 50);
    expect(mouse.looking).toBe(false);
    expect(mouse.takeMovement()).toEqual({ x: 0, y: 0 });
  });

  it("turns the view while the left button is held, and stops when it is released", () => {
    const { mouse, press, release, move } = setup();
    press(LEFT);
    expect(mouse.looking).toBe(true);
    move(3, -1);
    move(4, 6);
    expect(mouse.takeMovement()).toEqual({ x: 7, y: 5 });

    release();
    expect(mouse.looking).toBe(false);
    move(20, 20);
    expect(mouse.takeMovement()).toEqual({ x: 0, y: 0 });
  });

  it("works with the right button as well, but not the middle one", () => {
    const right = setup();
    right.press(RIGHT);
    expect(right.mouse.looking).toBe(true);

    const middle = setup();
    middle.press(MIDDLE);
    expect(middle.mouse.looking).toBe(false);
  });

  it("locks the pointer while looking and frees it afterwards", () => {
    const { press, release, requestPointerLock, exitPointerLock, isLocked } = setup();
    press();
    expect(requestPointerLock).toHaveBeenCalledOnce();
    expect(isLocked()).toBe(true);

    release();
    expect(exitPointerLock).toHaveBeenCalledOnce();
    expect(isLocked()).toBe(false);
  });

  it("keeps looking while one of two held buttons is released", () => {
    const { mouse, press, release } = setup();
    press(LEFT);
    press(RIGHT);
    release(2); // Left released, right still held.
    expect(mouse.looking).toBe(true);
    release(0);
    expect(mouse.looking).toBe(false);
  });

  it("still turns the view when the browser refuses the pointer lock", () => {
    const { mouse, press, release, move, isLocked } = setup(false);
    press();
    expect(isLocked()).toBe(false);
    expect(mouse.looking).toBe(true);
    move(10, 0);
    expect(mouse.takeMovement()).toEqual({ x: 10, y: 0 });
    release();
    expect(mouse.looking).toBe(false);
  });

  it("stops looking if the lock ends by itself, since the release may never arrive", () => {
    const { mouse, press, loseLock } = setup();
    press();
    loseLock();
    expect(mouse.looking).toBe(false);
  });

  it("hands collected movement out once", () => {
    const { mouse, press, move } = setup();
    press();
    move(3, 4);
    expect(mouse.peekMovement()).toEqual({ x: 3, y: 4 });
    expect(mouse.takeMovement()).toEqual({ x: 3, y: 4 });
    expect(mouse.takeMovement()).toEqual({ x: 0, y: 0 });
  });

  it("drops pending movement when looking stops and starts", () => {
    const { mouse, press, release, move } = setup();
    press();
    move(10, 10);
    release();
    press();
    expect(mouse.takeMovement()).toEqual({ x: 0, y: 0 });
  });

  it("reports when looking starts and stops", () => {
    const { mouse, press, release } = setup();
    const listener = vi.fn();
    mouse.onLookChange(listener);
    press();
    release();
    expect(listener.mock.calls).toEqual([[true], [false]]);
  });

  it("stops listening after dispose", () => {
    const { mouse, press } = setup();
    mouse.dispose();
    press();
    expect(mouse.looking).toBe(false);
  });
});

describe("wheelNotches", () => {
  it("counts one notch for an ordinary wheel step, in pixels or in lines", () => {
    expect(wheelNotches(100, 0)).toBe(1);
    expect(wheelNotches(-100, 0)).toBe(-1);
    expect(wheelNotches(3, 1)).toBe(1);
    expect(wheelNotches(-1, 2)).toBe(-1);
  });

  it("gives a fraction for the small steps a touchpad sends", () => {
    expect(wheelNotches(4, 0)).toBeCloseTo(0.04);
  });

  it("never counts more than one notch per event", () => {
    expect(wheelNotches(1200, 0)).toBe(1);
    expect(wheelNotches(-50, 1)).toBe(-1);
  });

  it("ignores values that are not numbers", () => {
    expect(wheelNotches(Number.NaN, 0)).toBe(0);
  });
});

describe("mouse wheel", () => {
  it("adds up notches and hands them out once", () => {
    const { mouse, wheel } = setup();
    wheel(100);
    wheel(100);
    wheel(-100);
    expect(mouse.takeWheel()).toBe(1);
    expect(mouse.takeWheel()).toBe(0);
  });

  it("keeps the page from scrolling when rolled over the game", () => {
    const { wheel } = setup();
    expect(wheel(100).defaultPrevented).toBe(true);
  });

  it("leaves the wheel to the page when rolled over something else", () => {
    const { mouse, wheel } = setup();
    expect(wheel(100, 0, false).defaultPrevented).toBe(false);
    expect(mouse.takeWheel()).toBe(0);
  });

  it("counts the wheel wherever the pointer is while looking", () => {
    const { mouse, wheel, press } = setup();
    press();
    wheel(100, 0, false);
    expect(mouse.takeWheel()).toBe(1);
  });
});

describe("createLocalInput with a mouse", () => {
  function setupInput() {
    const mouseSetup = setup();
    const keys = new EventTarget();
    const input = createLocalInput({
      target: keys as unknown as KeyboardTarget,
      hasFocus: () => true,
      mouse: mouseSetup.mouse,
      sensitivity: 0.01,
    });
    const pressKey = (code: string) => keys.dispatchEvent(Object.assign(new Event("keydown"), { code }));
    return { ...mouseSetup, input, pressKey };
  }

  it("turns mouse movement into look angles using the sensitivity", () => {
    const { input, move, press } = setupInput();
    press();
    move(20, -5);
    const actions = input.sample();
    expect(actions.lookX).toBeCloseTo(0.2);
    expect(actions.lookY).toBeCloseTo(-0.05);
    expect(input.sample().lookX).toBe(0);
  });

  it("reports look input that is waiting for the next sample", () => {
    const { input, move, press } = setupInput();
    press();
    move(20, -5);
    expect(input.pendingLook().lookX).toBeCloseTo(0.2);
    expect(input.pendingLook().lookY).toBeCloseTo(-0.05);

    input.sample();
    expect(input.pendingLook()).toEqual({ lookX: 0, lookY: 0 });
  });

  it("keeps walking when the mouse button is released", () => {
    const { input, pressKey, press, release } = setupInput();
    pressKey("KeyW");
    press();
    release();
    expect(input.sample().moveY).toBe(1);
  });
});
