import { describe, expect, it } from "vitest";
import { menuAction, moveSelection } from "../../src/ui/menuKeys";
import { hudBounds, isWindowTooSmall, uiScale } from "../../src/ui/uiScale";

describe("uiScale", () => {
  it("is 1 at the design height", () => {
    expect(uiScale(1080)).toBe(1);
  });

  it("follows the window height", () => {
    expect(uiScale(1440)).toBeCloseTo(1440 / 1080);
    expect(uiScale(900)).toBeCloseTo(900 / 1080);
  });

  it("does not shrink below the smallest supported height", () => {
    expect(uiScale(720)).toBeCloseTo(720 / 1080);
    expect(uiScale(400)).toBeCloseTo(720 / 1080);
  });

  it("does not grow without limit", () => {
    expect(uiScale(2160)).toBe(2);
    expect(uiScale(4320)).toBe(2);
  });

  it("falls back to 1 for a height that makes no sense", () => {
    expect(uiScale(Number.NaN)).toBe(1);
  });
});

describe("isWindowTooSmall", () => {
  it("accepts the smallest supported size and anything larger", () => {
    expect(isWindowTooSmall(1280, 720)).toBe(false);
    expect(isWindowTooSmall(1920, 1080)).toBe(false);
  });

  it("rejects a window that is too narrow or too short", () => {
    expect(isWindowTooSmall(1279, 720)).toBe(true);
    expect(isWindowTooSmall(1280, 719)).toBe(true);
    expect(isWindowTooSmall(800, 600)).toBe(true);
  });
});

describe("hudBounds", () => {
  it("uses the whole width at 16:9 and on narrower windows", () => {
    expect(hudBounds(1920, 1080)).toEqual({ left: 0, width: 1920 });
    expect(hudBounds(1280, 1024)).toEqual({ left: 0, width: 1280 });
  });

  it("keeps the HUD in a centred 16:9 area on an ultrawide window", () => {
    // 3440 x 1440: the 16:9 area is 2560 wide, with 440 left over on each side.
    expect(hudBounds(3440, 1440)).toEqual({ left: 440, width: 2560 });
  });
});

describe("menuAction", () => {
  it("moves with the arrow keys and Tab", () => {
    expect(menuAction("ArrowDown")).toBe("next");
    expect(menuAction("ArrowRight")).toBe("next");
    expect(menuAction("Tab")).toBe("next");
    expect(menuAction("ArrowUp")).toBe("previous");
    expect(menuAction("ArrowLeft")).toBe("previous");
    expect(menuAction("Tab", true)).toBe("previous");
  });

  it("chooses with Enter or Space and closes with Escape", () => {
    expect(menuAction("Enter")).toBe("activate");
    expect(menuAction("NumpadEnter")).toBe("activate");
    expect(menuAction("Space")).toBe("activate");
    expect(menuAction("Escape")).toBe("close");
  });

  it("leaves other keys to the game", () => {
    for (const code of ["KeyW", "KeyE", "Digit1", "F3", "ShiftLeft"]) {
      expect(menuAction(code)).toBeUndefined();
    }
  });
});

describe("moveSelection", () => {
  it("moves one step", () => {
    expect(moveSelection(0, 3, "next")).toBe(1);
    expect(moveSelection(2, 3, "previous")).toBe(1);
  });

  it("goes from the last item back to the first", () => {
    expect(moveSelection(2, 3, "next")).toBe(0);
  });

  it("goes from the first item to the last", () => {
    expect(moveSelection(0, 3, "previous")).toBe(2);
  });

  it("stays put with a single item", () => {
    expect(moveSelection(0, 1, "next")).toBe(0);
    expect(moveSelection(0, 1, "previous")).toBe(0);
  });

  it("copes with no items", () => {
    expect(moveSelection(0, 0, "next")).toBe(0);
  });
});
