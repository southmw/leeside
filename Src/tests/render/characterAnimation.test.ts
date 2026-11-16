import { describe, expect, it } from "vitest";
import {
  type AnimationInput,
  chooseAnimation,
  JUMP_CLIP_AIR_END,
  JUMP_CLIP_AIR_START,
  jumpAirSeconds,
  jumpClipTime,
  RUN_CLIP_SPEED,
  runPlaybackRate,
} from "../../src/render/characterAnimation";

const standing: AnimationInput = { moving: false, speed: 12, grounded: true, velocityY: 0, airborneSeconds: 0 };

describe("chooseAnimation", () => {
  it("idles when standing and runs when moving", () => {
    expect(chooseAnimation(standing)).toBe("idle");
    expect(chooseAnimation({ ...standing, moving: true })).toBe("run");
  });

  it("jumps as soon as the character takes off", () => {
    expect(chooseAnimation({ ...standing, grounded: false, velocityY: 6.6, airborneSeconds: 0.016 })).toBe("jump");
  });

  it("jumps while falling, once it has been in the air for a moment", () => {
    expect(chooseAnimation({ ...standing, grounded: false, velocityY: -5, airborneSeconds: 0.3 })).toBe("jump");
  });

  it("keeps running over a bump that lifts the feet for an instant", () => {
    const bump = { ...standing, moving: true, grounded: false, velocityY: -0.3, airborneSeconds: 0.03 };
    expect(chooseAnimation(bump)).toBe("run");
  });

  it("goes back to idle or run on landing", () => {
    expect(chooseAnimation({ ...standing, grounded: true, velocityY: 0, airborneSeconds: 0 })).toBe("idle");
    expect(chooseAnimation({ ...standing, moving: true, grounded: true })).toBe("run");
  });
});

describe("runPlaybackRate", () => {
  it("plays at normal rate at the clip's own speed", () => {
    expect(runPlaybackRate(RUN_CLIP_SPEED)).toBe(1);
  });

  it("speeds the steps up in proportion to the movement speed", () => {
    expect(runPlaybackRate(12, 6)).toBe(2);
    expect(runPlaybackRate(9, 6)).toBe(1.5);
  });

  it("stays within sensible limits", () => {
    expect(runPlaybackRate(100, 6)).toBe(3);
    expect(runPlaybackRate(0.1, 6)).toBe(0.5);
  });

  it("falls back to normal rate for values that make no sense", () => {
    expect(runPlaybackRate(0)).toBe(1);
    expect(runPlaybackRate(Number.NaN)).toBe(1);
    expect(runPlaybackRate(5, 0)).toBe(1);
  });
});

describe("jump timing", () => {
  it("knows how long a jump stays in the air", () => {
    // 1.1 m under 20 m/s^2: 0.33 s up and 0.33 s down.
    expect(jumpAirSeconds(1.1, 20)).toBeCloseTo(0.663, 2);
  });

  it("spreads the clip's airborne part over the jump", () => {
    expect(jumpClipTime(0, 0.66)).toBeCloseTo(JUMP_CLIP_AIR_START);
    expect(jumpClipTime(0.33, 0.66)).toBeCloseTo((JUMP_CLIP_AIR_START + JUMP_CLIP_AIR_END) / 2);
    expect(jumpClipTime(0.66, 0.66)).toBeCloseTo(JUMP_CLIP_AIR_END);
  });

  it("holds the last airborne pose in a longer fall", () => {
    expect(jumpClipTime(5, 0.66)).toBeCloseTo(JUMP_CLIP_AIR_END);
  });

  it("never leaves the airborne part of the clip", () => {
    expect(jumpClipTime(-1, 0.66)).toBeCloseTo(JUMP_CLIP_AIR_START);
    expect(jumpClipTime(1, 0)).toBeCloseTo(JUMP_CLIP_AIR_END);
  });
});
