import { describe, expect, it, vi } from "vitest";
import { createLocalInput } from "../../src/input/localInput";
import { createMouse, type PointerLockCanvas, type PointerLockDocument, wheelNotches } from "../../src/input/mouse";
import type { KeyboardTarget } from "../../src/input/keyboard";

/** Stand-ins for the canvas and the document, with the pointer lock under the test's control. */
function setup() {
  const canvasEvents = new EventTarget();
  const requestPointerLock = vi.fn();
  const canvas = Object.assign(canvasEvents, { requestPointerLock }) as unknown as PointerLockCanvas;
  const docEvents = new EventTarget();
  let lockElement: unknown = null;
  const doc = Object.defineProperty(docEvents, "pointerLockElement", { get: () => lockElement }) as unknown as PointerLockDocument;

  const mouse = createMouse(canvas, doc);
  return {
    mouse,
    requestPointerLock,
    click: () => canvasEvents.dispatchEvent(new Event("click")),
    move: (movementX: number, movementY: number) =>
      docEvents.dispatchEvent(Object.assign(new Event("mousemove"), { movementX, movementY })),
    /** Rolls the wheel with the pointer over the game canvas, or over something else on the page. */
    wheel(deltaY: number, deltaMode = 0, overGame = true) {
      const event = Object.assign(new Event("wheel", { cancelable: true }), { deltaY, deltaMode });
      Object.defineProperty(event, "target", { value: overGame ? canvas : {} });
      docEvents.dispatchEvent(event);
      return event;
    },
    setLocked(locked: boolean) {
      lockElement = locked ? canvas : null;
      docEvents.dispatchEvent(new Event("pointerlockchange"));
    },
  };
}

describe("createMouse", () => {
  it("asks for the pointer lock on a click", () => {
    const { mouse, click, requestPointerLock } = setup();
    expect(mouse.locked).toBe(false);
    click();
    expect(requestPointerLock).toHaveBeenCalledOnce();
  });

  it("does not ask again while already locked", () => {
    const { click, setLocked, requestPointerLock } = setup();
    setLocked(true);
    click();
    expect(requestPointerLock).not.toHaveBeenCalled();
  });

  it("adds up movement while locked and hands it out once", () => {
    const { mouse, move, setLocked } = setup();
    setLocked(true);
    move(3, -1);
    move(4, 6);
    expect(mouse.takeMovement()).toEqual({ x: 7, y: 5 });
    expect(mouse.takeMovement()).toEqual({ x: 0, y: 0 });
  });

  it("can be read without being reset", () => {
    const { mouse, move, setLocked } = setup();
    setLocked(true);
    move(3, 4);
    expect(mouse.peekMovement()).toEqual({ x: 3, y: 4 });
    expect(mouse.takeMovement()).toEqual({ x: 3, y: 4 });
    expect(mouse.peekMovement()).toEqual({ x: 0, y: 0 });
  });

  it("ignores movement while not locked", () => {
    const { mouse, move } = setup();
    move(50, 50);
    expect(mouse.takeMovement()).toEqual({ x: 0, y: 0 });
  });

  it("drops pending movement when the lock changes", () => {
    const { mouse, move, setLocked } = setup();
    setLocked(true);
    move(10, 10);
    setLocked(false);
    expect(mouse.takeMovement()).toEqual({ x: 0, y: 0 });
  });

  it("reports lock changes", () => {
    const { mouse, setLocked } = setup();
    const listener = vi.fn();
    mouse.onLockChange(listener);
    setLocked(true);
    setLocked(false);
    expect(listener.mock.calls).toEqual([[true], [false]]);
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
  it("adds up notches while locked and hands them out once", () => {
    const { mouse, wheel, setLocked } = setup();
    setLocked(true);
    wheel(100);
    wheel(100);
    wheel(-100);
    expect(mouse.takeWheel()).toBe(1);
    expect(mouse.takeWheel()).toBe(0);
  });

  it("keeps the page from scrolling while locked", () => {
    const { wheel, setLocked } = setup();
    setLocked(true);
    expect(wheel(100).defaultPrevented).toBe(true);
  });

  it("works without mouse look when rolled over the game", () => {
    const { mouse, wheel } = setup();
    expect(wheel(100).defaultPrevented).toBe(true);
    expect(mouse.takeWheel()).toBe(1);
  });

  it("leaves the wheel to the page when rolled over something else without mouse look", () => {
    const { mouse, wheel } = setup();
    expect(wheel(100, 0, false).defaultPrevented).toBe(false);
    expect(mouse.takeWheel()).toBe(0);
  });

  it("counts the wheel wherever the pointer is while locked", () => {
    const { mouse, wheel, setLocked } = setup();
    setLocked(true);
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
    const press = (code: string) => keys.dispatchEvent(Object.assign(new Event("keydown"), { code }));
    return { ...mouseSetup, input, press };
  }

  it("turns mouse movement into look angles using the sensitivity", () => {
    const { input, move, setLocked } = setupInput();
    setLocked(true);
    move(20, -5);
    const actions = input.sample();
    expect(actions.lookX).toBeCloseTo(0.2);
    expect(actions.lookY).toBeCloseTo(-0.05);
    expect(input.sample().lookX).toBe(0);
  });

  it("reports look input that is waiting for the next sample", () => {
    const { input, move, setLocked } = setupInput();
    setLocked(true);
    move(20, -5);
    expect(input.pendingLook().lookX).toBeCloseTo(0.2);
    expect(input.pendingLook().lookY).toBeCloseTo(-0.05);

    input.sample();
    expect(input.pendingLook()).toEqual({ lookX: 0, lookY: 0 });
  });

  it("releases held keys when mouse look ends", () => {
    const { input, press, setLocked } = setupInput();
    setLocked(true);
    press("KeyW");
    expect(input.sample().moveY).toBe(1);

    setLocked(false);
    expect(input.sample().moveY).toBe(0);
  });
});
