import { describe, expect, it } from "vitest";
import { createLocalInput } from "../../src/input/localInput";
import type { Mouse } from "../../src/input/mouse";

/** A mouse that has moved by `x`, `y` pixels since it was last asked. */
const movedMouse = (x: number, y: number): Mouse => ({ takeMovement: () => ({ x, y }), peekMovement: () => ({ x, y }) }) as unknown as Mouse;
const target = new EventTarget() as unknown as Window;

describe("looking with the mouse", () => {
  it("turns the view by the mouse's movement times the sensitivity", () => {
    const input = createLocalInput({ target, hasFocus: () => true, mouse: movedMouse(10, -4), sensitivity: 0.01 });
    expect(input.sample()).toMatchObject({ lookX: 0.1, lookY: -0.04 });
    expect(input.pendingLook()).toEqual({ lookX: 0.1, lookY: -0.04 });
  });

  it("follows the player's sensitivity setting, also when it changes", () => {
    const look = { sensitivity: 2, invertY: false };
    const input = createLocalInput({ target, hasFocus: () => true, mouse: movedMouse(10, 10), sensitivity: 0.01, look: () => look });
    expect(input.sample().lookX).toBeCloseTo(0.2);
    look.sensitivity = 0.5;
    expect(input.sample().lookX).toBeCloseTo(0.05);
    expect(input.pendingLook().lookY).toBeCloseTo(0.05);
  });

  it("turns up and down the other way round when the setting says so, and left and right as before", () => {
    const input = createLocalInput({ target, hasFocus: () => true, mouse: movedMouse(10, 10), sensitivity: 0.01, look: () => ({ sensitivity: 1, invertY: true }) });
    const actions = input.sample();
    expect(actions.lookX).toBeCloseTo(0.1);
    expect(actions.lookY).toBeCloseTo(-0.1);
    expect(input.pendingLook().lookY).toBeCloseTo(-0.1);
  });
});
