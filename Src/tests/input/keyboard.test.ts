import { describe, expect, it } from "vitest";
import { createKeyboard, type KeyboardTarget } from "../../src/input/keyboard";
import { createLocalInput } from "../../src/input/localInput";

function setup() {
  const target = new EventTarget();
  const keyboard = createKeyboard(target as unknown as KeyboardTarget);
  const key = (type: "keydown" | "keyup", code: string): void => {
    target.dispatchEvent(Object.assign(new Event(type), { code }));
  };
  return { target, keyboard, key };
}

describe("createKeyboard", () => {
  it("tracks keys as they go down and up", () => {
    const { keyboard, key } = setup();
    key("keydown", "KeyW");
    key("keydown", "KeyD");
    expect([...keyboard.pressed].sort()).toEqual(["KeyD", "KeyW"]);

    key("keyup", "KeyW");
    expect([...keyboard.pressed]).toEqual(["KeyD"]);
  });

  it.each(["blur", "visibilitychange"])("releases every key on %s", (type) => {
    const { target, keyboard, key } = setup();
    key("keydown", "KeyW");
    key("keydown", "Space");

    target.dispatchEvent(new Event(type));
    expect(keyboard.pressed.size).toBe(0);
  });

  it("suppresses the context menu and releases the keys it would leave stuck", () => {
    const { target, keyboard, key } = setup();
    key("keydown", "KeyW");

    const event = new Event("contextmenu", { cancelable: true });
    target.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(keyboard.pressed.size).toBe(0);
  });

  it("stops listening after dispose", () => {
    const { keyboard, key } = setup();
    keyboard.dispose();
    key("keydown", "KeyW");
    expect(keyboard.pressed.size).toBe(0);
  });
});

describe("createLocalInput", () => {
  function setupInput() {
    const target = new EventTarget();
    let focused = true;
    const input = createLocalInput({ target: target as unknown as KeyboardTarget, hasFocus: () => focused });
    const press = (code: string): void => {
      target.dispatchEvent(Object.assign(new Event("keydown"), { code }));
    };
    return { input, press, setFocused: (value: boolean) => (focused = value) };
  }

  it("turns held keys into actions", () => {
    const { input, press } = setupInput();
    press("KeyW");
    expect(input.sample().moveY).toBe(1);
  });

  it("drops held keys while the page has no focus, and keeps them dropped afterwards", () => {
    const { input, press, setFocused } = setupInput();
    press("KeyW");

    setFocused(false);
    expect(input.sample().moveY).toBe(0);

    // The key-up was missed while unfocused, so the key must not come back by itself.
    setFocused(true);
    expect(input.sample().moveY).toBe(0);

    press("KeyW");
    expect(input.sample().moveY).toBe(1);
  });
});
