import { describe, expect, it } from "vitest";
import {
  averageFps,
  countFramesOver,
  FrameStats,
  LONG_FRAME_MS,
  lowPercentileFps,
  VERY_LONG_FRAME_MS,
} from "../../src/debug/frameStats";

const repeat = (value: number, count: number): number[] => Array.from({ length: count }, () => value);

describe("averageFps", () => {
  it("is 60 for steady 60 Hz frames", () => {
    expect(averageFps(repeat(1000 / 60, 120))).toBeCloseTo(60);
  });

  it("is based on mean frame time, not mean of per-frame rates", () => {
    // 10 ms and 30 ms average to 20 ms, which is 50 fps (not the 66.7 a naive mean gives).
    expect(averageFps([10, 30])).toBeCloseTo(50);
  });

  it("is 0 for an empty list", () => {
    expect(averageFps([])).toBe(0);
  });
});

describe("lowPercentileFps", () => {
  it("reports the slowest 1% of frames", () => {
    // 99 fast frames and one 100 ms stall: the 1% low is that single stall.
    const frames = [...repeat(10, 99), 100];
    expect(lowPercentileFps(frames, 0.01)).toBeCloseTo(10);
  });

  it("averages the slowest frames when 1% covers more than one", () => {
    const frames = [...repeat(10, 198), 40, 60];
    expect(lowPercentileFps(frames, 0.01)).toBeCloseTo(1000 / 50);
  });

  it("uses the single worst frame for short lists", () => {
    expect(lowPercentileFps([10, 20, 25], 0.01)).toBeCloseTo(40);
  });

  it("equals the average when every frame is the same", () => {
    const frames = repeat(1000 / 60, 300);
    expect(lowPercentileFps(frames, 0.01)).toBeCloseTo(averageFps(frames));
  });

  it("is 0 for an empty list", () => {
    expect(lowPercentileFps([])).toBe(0);
  });
});

describe("countFramesOver", () => {
  it("counts only frames strictly over the threshold", () => {
    expect(countFramesOver([10, 34, 35, 50, 51], 34)).toBe(3);
    expect(countFramesOver([10, 34, 35, 50, 51], 50)).toBe(1);
  });
});

describe("FrameStats", () => {
  it("summarises steady frames", () => {
    const stats = new FrameStats();
    for (const frame of repeat(1000 / 60, 120)) {
      stats.add(frame);
    }
    const snapshot = stats.snapshot();
    expect(snapshot.fps).toBeCloseTo(60);
    expect(snapshot.avgFps).toBeCloseTo(60);
    expect(snapshot.low1Fps).toBeCloseTo(60);
    expect(snapshot.frameMs).toBeCloseTo(1000 / 60);
    expect(snapshot.longFrames).toBe(0);
    expect(snapshot.veryLongFrames).toBe(0);
    expect(snapshot.samples).toBe(120);
  });

  it("does not count a steady 30 fps as long frames", () => {
    const stats = new FrameStats();
    for (const frame of repeat(1000 / 30, 60)) {
      stats.add(frame);
    }
    expect(stats.snapshot().longFrames).toBe(0);
  });

  it("counts hitches and stalls", () => {
    const stats = new FrameStats();
    for (const frame of [16, 16, LONG_FRAME_MS + 1, 16, VERY_LONG_FRAME_MS + 1, 16]) {
      stats.add(frame);
    }
    const snapshot = stats.snapshot();
    expect(snapshot.longFrames).toBe(2);
    expect(snapshot.veryLongFrames).toBe(1);
    expect(snapshot.maxFrameMs).toBe(VERY_LONG_FRAME_MS + 1);
  });

  it("keeps counting long frames after they leave the window", () => {
    const stats = new FrameStats(10);
    stats.add(100);
    for (const frame of repeat(16, 20)) {
      stats.add(frame);
    }
    const snapshot = stats.snapshot();
    expect(snapshot.samples).toBe(10);
    expect(snapshot.maxFrameMs).toBe(16);
    expect(snapshot.veryLongFrames).toBe(1);
  });

  it("reads current fps from recent frames only", () => {
    const stats = new FrameStats(300, 30);
    for (const frame of repeat(1000 / 30, 100)) {
      stats.add(frame);
    }
    for (const frame of repeat(1000 / 60, 30)) {
      stats.add(frame);
    }
    const snapshot = stats.snapshot();
    expect(snapshot.fps).toBeCloseTo(60);
    expect(snapshot.avgFps).toBeLessThan(40);
  });

  it("ignores invalid frame times", () => {
    const stats = new FrameStats();
    stats.add(0);
    stats.add(-5);
    stats.add(Number.NaN);
    expect(stats.snapshot().samples).toBe(0);
  });

  it("starts over after reset", () => {
    const stats = new FrameStats();
    stats.add(100);
    stats.reset();
    const snapshot = stats.snapshot();
    expect(snapshot.samples).toBe(0);
    expect(snapshot.veryLongFrames).toBe(0);
    expect(snapshot.fps).toBe(0);
  });
});
