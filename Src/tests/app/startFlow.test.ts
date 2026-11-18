import { describe, expect, it } from "vitest";
import { advanceStartFlow, canStart, initialStartFlow, loadingFraction, type StartFlowState } from "../../src/app/startFlow";
import { checkSupport, type Environment } from "../../src/app/support";
import { CAMERA_DISTANCE, CAMERA_SHOULDER_OFFSET } from "../../src/data/tuning";
import { TITLE_CAMERA_PITCH, TITLE_CAMERA_RIG, titleCameraYaw } from "../../src/app/titleCamera";

describe("start flow", () => {
  it("goes back to ready when the player quits to the title, and can start again", () => {
    const playing: StartFlowState = { phase: "playing" };
    const back = advanceStartFlow(playing, { type: "quit" });
    expect(back).toEqual({ phase: "ready" });
    expect(canStart(back)).toBe(true);
    expect(advanceStartFlow(back, { type: "start" })).toEqual(playing);
    // Quitting means nothing before the game has started.
    expect(advanceStartFlow(initialStartFlow(4), { type: "quit" })).toEqual(initialStartFlow(4));
    expect(advanceStartFlow({ phase: "ready" }, { type: "quit" })).toEqual({ phase: "ready" });
  });

  it("starts out loading, with nothing done", () => {
    const state = initialStartFlow(4);
    expect(state).toEqual({ phase: "loading", done: 0, total: 4 });
    expect(loadingFraction(state)).toBe(0);
    expect(canStart(state)).toBe(false);
  });

  it("goes loading -> ready -> playing", () => {
    let state = initialStartFlow(2);
    state = advanceStartFlow(state, { type: "step_done" });
    expect(loadingFraction(state)).toBe(0.5);
    state = advanceStartFlow(state, { type: "step_done" });
    expect(loadingFraction(state)).toBe(1);
    expect(state.phase).toBe("loading");

    state = advanceStartFlow(state, { type: "loaded" });
    expect(state).toEqual({ phase: "ready" });
    expect(canStart(state)).toBe(true);

    state = advanceStartFlow(state, { type: "start" });
    expect(state).toEqual({ phase: "playing" });
    expect(canStart(state)).toBe(false);
  });

  it("ignores START while still loading", () => {
    const loading = initialStartFlow(3);
    expect(advanceStartFlow(loading, { type: "start" })).toEqual(loading);
  });

  it("does not count more steps than there are", () => {
    let state = initialStartFlow(2);
    for (let i = 0; i < 5; i += 1) {
      state = advanceStartFlow(state, { type: "step_done" });
    }
    expect(loadingFraction(state)).toBe(1);
  });

  it("ignores loading events once past loading", () => {
    const ready: StartFlowState = { phase: "ready" };
    expect(advanceStartFlow(ready, { type: "step_done" })).toEqual(ready);
    expect(advanceStartFlow(ready, { type: "loaded" })).toEqual(ready);
    const playing: StartFlowState = { phase: "playing" };
    expect(advanceStartFlow(playing, { type: "start" })).toEqual(playing);
    expect(advanceStartFlow(playing, { type: "loaded" })).toEqual(playing);
  });

  it("stops at an unsupported device, and START does nothing there", () => {
    let state = advanceStartFlow(initialStartFlow(3), { type: "unsupported", reason: "mobile" });
    expect(state).toEqual({ phase: "unsupported", reason: "mobile" });
    state = advanceStartFlow(state, { type: "start" });
    expect(state.phase).toBe("unsupported");
    expect(canStart(state)).toBe(false);
  });

  it("reports a failure while loading, but not after the game is up", () => {
    const failed = advanceStartFlow(initialStartFlow(3), { type: "failed", message: "network" });
    expect(failed).toEqual({ phase: "failed", message: "network" });
    expect(canStart(failed)).toBe(false);

    const playing: StartFlowState = { phase: "playing" };
    expect(advanceStartFlow(playing, { type: "failed", message: "late" })).toEqual(playing);
  });

  it("treats a flow with no steps as having one", () => {
    expect(initialStartFlow(0)).toEqual({ phase: "loading", done: 0, total: 1 });
  });
});

describe("checkSupport", () => {
  const desktop: Environment = {
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36",
    maxTouchPoints: 0,
    finePointer: true,
    webgl2: true,
  };

  it("accepts a desktop browser with WebGL 2", () => {
    expect(checkSupport(desktop)).toBeUndefined();
  });

  it("accepts a laptop with a touch screen, which still has a mouse", () => {
    expect(checkSupport({ ...desktop, maxTouchPoints: 10 })).toBeUndefined();
  });

  it.each([
    ["an iPhone", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1"],
    ["an Android phone", "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/157.0.0.0 Mobile Safari/537.36"],
    ["an Android tablet", "Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 Chrome/157.0.0.0 Safari/537.36"],
  ])("rejects %s", (_name, userAgent) => {
    expect(checkSupport({ ...desktop, userAgent, maxTouchPoints: 5, finePointer: false })).toBe("mobile");
  });

  it("rejects an iPad that pretends to be a Mac: touch input and no precise pointer", () => {
    const userAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
    expect(checkSupport({ userAgent, maxTouchPoints: 5, finePointer: false, webgl2: true })).toBe("mobile");
    // A real Mac has no touch points.
    expect(checkSupport({ userAgent, maxTouchPoints: 0, finePointer: true, webgl2: true })).toBeUndefined();
  });

  it("rejects a browser without WebGL 2", () => {
    expect(checkSupport({ ...desktop, webgl2: false })).toBe("no_webgl");
  });

  it("names the device, not the graphics, when both are a problem", () => {
    expect(checkSupport({ ...desktop, userAgent: "iPhone", webgl2: false })).toBe("mobile");
  });
});

describe("title camera", () => {
  it("starts looking the way the player will face", () => {
    expect(titleCameraYaw(1.2, 0)).toBeCloseTo(1.2);
  });

  it("sways to both sides and comes back", () => {
    const samples = Array.from({ length: 400 }, (_, i) => titleCameraYaw(0, i * 0.1));
    expect(Math.max(...samples)).toBeGreaterThan(0.25);
    expect(Math.min(...samples)).toBeLessThan(-0.25);
    expect(titleCameraYaw(0, 40)).toBeCloseTo(0);
  });

  it("moves slowly: less than 3 degrees a second", () => {
    for (let t = 0; t < 40; t += 0.5) {
      const perSecond = Math.abs(titleCameraYaw(0, t + 1) - titleCameraYaw(0, t));
      expect(perSecond).toBeLessThan((3 * Math.PI) / 180);
    }
  });

  it("stands further back and further to the side than the camera in play", () => {
    expect(TITLE_CAMERA_RIG.distance).toBeGreaterThan(CAMERA_DISTANCE);
    expect(TITLE_CAMERA_RIG.shoulderOffset).toBeGreaterThan(CAMERA_SHOULDER_OFFSET * 3);
  });

  it("looks slightly down", () => {
    expect(TITLE_CAMERA_PITCH).toBeLessThan(0);
  });
});
