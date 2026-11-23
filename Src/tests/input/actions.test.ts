import { describe, expect, it } from "vitest";
import {
  actionsFromKeys,
  createEmptyActions,
  DEFAULT_KEY_BINDINGS,
  moveVector,
  type KeyBindings,
} from "../../src/input/actions";

const keys = (...codes: string[]): Set<string> => new Set(codes);

describe("moveVector", () => {
  it("is zero with no input", () => {
    expect(moveVector(false, false, false, false)).toEqual({ x: 0, y: 0 });
  });

  it("maps single directions to unit axes", () => {
    expect(moveVector(true, false, false, false)).toEqual({ x: 0, y: 1 });
    expect(moveVector(false, true, false, false)).toEqual({ x: 0, y: -1 });
    expect(moveVector(false, false, true, false)).toEqual({ x: -1, y: 0 });
    expect(moveVector(false, false, false, true)).toEqual({ x: 1, y: 0 });
  });

  it("normalises diagonals so they are not faster", () => {
    const { x, y } = moveVector(true, false, false, true);
    expect(Math.hypot(x, y)).toBeCloseTo(1);
    expect(x).toBeCloseTo(Math.SQRT1_2);
    expect(y).toBeCloseTo(Math.SQRT1_2);
  });

  it("cancels opposite directions", () => {
    expect(moveVector(true, true, false, false)).toEqual({ x: 0, y: 0 });
    expect(moveVector(false, false, true, true)).toEqual({ x: 0, y: 0 });
    expect(moveVector(true, true, false, true)).toEqual({ x: 1, y: 0 });
  });
});

describe("actionsFromKeys", () => {
  it("returns empty actions when nothing is pressed", () => {
    expect(actionsFromKeys(keys())).toEqual(createEmptyActions());
  });

  it("maps WASD to movement", () => {
    expect(actionsFromKeys(keys("KeyW")).moveY).toBe(1);
    expect(actionsFromKeys(keys("KeyS")).moveY).toBe(-1);
    expect(actionsFromKeys(keys("KeyA")).moveX).toBe(-1);
    expect(actionsFromKeys(keys("KeyD")).moveX).toBe(1);
  });

  it("maps the button keys", () => {
    const actions = actionsFromKeys(keys("Space", "KeyE", "Digit1", "Digit2"));
    expect(actions.jump).toBe(true);
    expect(actions.interact).toBe(true);
    expect(actions.quick1).toBe(true);
    expect(actions.quick2).toBe(true);
    expect(actions.quick3).toBe(false);
    expect(actionsFromKeys(keys("Digit3", "Digit4"))).toMatchObject({ quick1: false, quick3: true, quick4: true });
  });

  it("ignores keys that are not bound", () => {
    expect(actionsFromKeys(keys("KeyQ", "F5", "ArrowUp"))).toEqual(createEmptyActions());
  });

  it("honours custom bindings, including several keys for one action", () => {
    const bindings: KeyBindings = { ...DEFAULT_KEY_BINDINGS, moveForward: ["KeyW", "ArrowUp"], jump: ["KeyJ"] };
    expect(actionsFromKeys(keys("ArrowUp"), bindings).moveY).toBe(1);
    expect(actionsFromKeys(keys("KeyJ"), bindings).jump).toBe(true);
    expect(actionsFromKeys(keys("Space"), bindings).jump).toBe(false);
  });
});
