import { describe, expect, it } from "vitest";
import { benchCameraAt, pathLength, pointOnPath } from "../../src/bench/benchPath";
import { BenchRecorder, benchRows, type BenchFrame, judge, summarize } from "../../src/bench/benchRecorder";
import { benchRoute, DRY_RIVERBED_STOPS } from "../../src/bench/benchRoute";
import { MOVE_SPEED } from "../../src/data/tuning";
import { PERF_BUDGETS } from "../../src/debug/perfBudget";
import { loadDryRiverbed } from "../../src/world/zones/dryRiverbed";

// A square 10 m on a side, walked clockwise from its north-west corner.
const square = [
  { x: 0, z: 0 },
  { x: 10, z: 0 },
  { x: 10, z: 10 },
  { x: 0, z: 10 },
];

describe("pathLength", () => {
  it("includes the way back to the start", () => {
    expect(pathLength(square)).toBe(40);
  });

  it("is 0 for a single point or none", () => {
    expect(pathLength([{ x: 3, z: 4 }])).toBe(0);
    expect(pathLength([])).toBe(0);
  });
});

describe("pointOnPath", () => {
  it("is at the start for distance 0", () => {
    expect(pointOnPath(square, 0)).toEqual({ x: 0, z: 0 });
  });

  it("moves along each side in turn", () => {
    expect(pointOnPath(square, 5)).toEqual({ x: 5, z: 0 });
    expect(pointOnPath(square, 15)).toEqual({ x: 10, z: 5 });
    expect(pointOnPath(square, 25)).toEqual({ x: 5, z: 10 });
    expect(pointOnPath(square, 35)).toEqual({ x: 0, z: 5 });
  });

  it("wraps round past the end and counts backwards for negative distances", () => {
    expect(pointOnPath(square, 45)).toEqual({ x: 5, z: 0 });
    expect(pointOnPath(square, -5)).toEqual({ x: 0, z: 5 });
  });

  it("copes with a route of one point or none", () => {
    expect(pointOnPath([{ x: 3, z: 4 }], 100)).toEqual({ x: 3, z: 4 });
    expect(pointOnPath([], 100)).toEqual({ x: 0, z: 0 });
  });
});

describe("benchCameraAt", () => {
  it("starts at the start, looking ahead along the route", () => {
    expect(benchCameraAt(square, 0, 4)).toEqual({ position: { x: 0, z: 0 }, target: { x: 4, z: 0 } });
  });

  it("is half way round at half time", () => {
    expect(benchCameraAt(square, 0.5, 4).position).toEqual({ x: 10, z: 10 });
  });

  it("is back at the start at the end, having gone round exactly once", () => {
    const end = benchCameraAt(square, 1, 4).position;
    expect(end.x).toBeCloseTo(0);
    expect(end.z).toBeCloseTo(0);
  });

  it("looks round the corner before it gets there", () => {
    const nearCorner = benchCameraAt(square, 9 / 40, 4);
    expect(nearCorner.position).toEqual({ x: 9, z: 0 });
    expect(nearCorner.target).toEqual({ x: 10, z: 3 });
  });

  it("moves at constant speed", () => {
    const a = benchCameraAt(square, 0.1, 4).position;
    const b = benchCameraAt(square, 0.2, 4).position;
    expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeCloseTo(4);
  });

  it("stays within the route for fractions outside 0 to 1", () => {
    expect(benchCameraAt(square, -3, 4).position).toEqual({ x: 0, z: 0 });
    const beyond = benchCameraAt(square, 7, 4).position;
    expect(beyond.x).toBeCloseTo(0);
    expect(beyond.z).toBeCloseTo(0);
  });
});

describe("benchRoute", () => {
  const zone = loadDryRiverbed();

  it("starts at the zone's start and visits every stop in order", () => {
    const route = benchRoute(zone, DRY_RIVERBED_STOPS);
    expect(route).toHaveLength(DRY_RIVERBED_STOPS.length + 1);
    expect(route[0]).toEqual({ x: 360, z: 619 });
    expect(route[1]).toEqual({ x: 375, z: 491 });
    expect(route[6]).toEqual({ x: 281, z: 281 });
  });

  it("skips places the zone does not have", () => {
    expect(benchRoute(zone, ["nowhere", "house_a"])).toEqual([
      { x: 360, z: 619 },
      { x: 281, z: 281 },
    ]);
  });

  it("stays inside the zone and passes all three houses", () => {
    const route = benchRoute(zone, DRY_RIVERBED_STOPS);
    for (const point of route) {
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(zone.size);
      expect(point.z).toBeGreaterThanOrEqual(0);
      expect(point.z).toBeLessThanOrEqual(zone.size);
    }
    for (const house of zone.buildings) {
      expect(route).toContainEqual({ x: house.position[0], z: house.position[1] });
    }
  });

  it("is long enough to be flown faster than walking in a minute", () => {
    const speed = pathLength(benchRoute(zone, DRY_RIVERBED_STOPS)) / 60;
    expect(speed).toBeGreaterThan(MOVE_SPEED);
    expect(speed).toBeLessThan(60);
  });
});

const frame = (frameMs: number, overrides: Partial<BenchFrame> = {}): BenchFrame => ({
  frameMs,
  drawCalls: 20,
  triangles: 100_000,
  simMs: 0.5,
  renderMs: 0.4,
  ...overrides,
});

describe("summarize", () => {
  it("averages by frame time, so slow frames count for their length", () => {
    const summary = summarize([frame(10), frame(30)]);
    expect(summary.avgFrameMs).toBe(20);
    expect(summary.avgFps).toBeCloseTo(50);
    expect(summary.seconds).toBeCloseTo(0.04);
    expect(summary.frames).toBe(2);
  });

  it("finds the worst frame and counts long ones", () => {
    const frames = [...Array.from({ length: 97 }, () => frame(16.7)), frame(40), frame(60), frame(120)];
    const summary = summarize(frames);
    expect(summary.maxFrameMs).toBe(120);
    expect(summary.longFrames).toBe(3);
    expect(summary.veryLongFrames).toBe(2);
    // The slowest 1% of 100 frames is the single worst one.
    expect(summary.low1Fps).toBeCloseTo(1000 / 120);
  });

  it("reports the peak of what was drawn and the average of what it cost", () => {
    const summary = summarize([
      frame(16, { drawCalls: 20, triangles: 50_000, simMs: 1, renderMs: 2 }),
      frame(16, { drawCalls: 35, triangles: 90_000, simMs: 3, renderMs: 4 }),
    ]);
    expect(summary.maxDrawCalls).toBe(35);
    expect(summary.maxTriangles).toBe(90_000);
    expect(summary.avgSimMs).toBe(2);
    expect(summary.avgRenderMs).toBe(3);
  });

  it("is all zeros for no frames", () => {
    const summary = summarize([]);
    expect(summary.frames).toBe(0);
    expect(summary.avgFps).toBe(0);
    expect(summary.maxFrameMs).toBe(0);
  });
});

describe("judge", () => {
  const smooth = summarize(Array.from({ length: 600 }, () => frame(16.7)));

  it("passes a smooth run within the drawing limits", () => {
    const verdict = judge(smooth, PERF_BUDGETS.high);
    expect(Object.values(verdict).every(Boolean)).toBe(true);
  });

  it("fails a run that is too slow", () => {
    const slow = summarize(Array.from({ length: 600 }, () => frame(25)));
    const verdict = judge(slow, PERF_BUDGETS.high);
    expect(verdict.avgFps).toBe(false);
    // The same run is fine for the low quality budget (30 fps).
    expect(judge(slow, PERF_BUDGETS.low).avgFps).toBe(true);
  });

  it("fails on too many stalls, too many draw calls or too many triangles", () => {
    const stalls = summarize([...Array.from({ length: 600 }, () => frame(16.7)), ...Array.from({ length: 6 }, () => frame(80))]);
    expect(judge(stalls, PERF_BUDGETS.high).veryLongFrames).toBe(false);

    const heavy = summarize([frame(16.7, { drawCalls: 900, triangles: 2_000_000 })]);
    const verdict = judge(heavy, PERF_BUDGETS.high);
    expect(verdict.drawCalls).toBe(false);
    expect(verdict.triangles).toBe(false);
  });
});

describe("BenchRecorder", () => {
  it("leaves out the warm-up and stops after the duration", () => {
    const recorder = new BenchRecorder(2, 1);
    // Half-second frames: two in the warm-up, four measured, the rest after the end.
    for (let i = 0; i < 10; i += 1) {
      recorder.add(frame(500));
    }
    expect(recorder.done).toBe(true);
    expect(recorder.summary().frames).toBe(4);
    expect(recorder.summary().seconds).toBeCloseTo(2);
  });

  it("reports progress from 0 to 1, staying at 0 during the warm-up", () => {
    const recorder = new BenchRecorder(4, 1);
    recorder.add(frame(500));
    expect(recorder.progress).toBe(0);
    recorder.add(frame(500));
    recorder.add(frame(1000));
    expect(recorder.progress).toBeCloseTo(0.25);
    expect(recorder.done).toBe(false);
    for (let i = 0; i < 10; i += 1) {
      recorder.add(frame(1000));
    }
    expect(recorder.progress).toBe(1);
    expect(recorder.done).toBe(true);
  });

  it("ignores frames without a usable time", () => {
    const recorder = new BenchRecorder(1, 0);
    recorder.add(frame(0));
    recorder.add(frame(Number.NaN));
    recorder.add(frame(-5));
    expect(recorder.summary().frames).toBe(0);
    expect(recorder.progress).toBe(0);
  });
});

describe("benchRows", () => {
  const summary = summarize([frame(16.7), frame(16.7), frame(60, { drawCalls: 26, triangles: 104_892 })]);
  const rows = benchRows(summary, judge(summary, PERF_BUDGETS.high));
  const row = (key: string) => rows.find((candidate) => candidate.key === key);

  it("has every figure of the design, in a fixed order", () => {
    expect(rows.map((candidate) => candidate.key)).toEqual([
      "avgFps",
      "low1Fps",
      "avgFrameMs",
      "maxFrameMs",
      "longFrames",
      "veryLongFrames",
      "maxDrawCalls",
      "maxTriangles",
      "avgSimMs",
      "avgRenderMs",
      "duration",
      "frames",
    ]);
  });

  it("formats values for reading", () => {
    expect(row("maxTriangles")?.value).toBe("104,892");
    expect(row("maxFrameMs")?.value).toBe("60.0 ms");
    expect(row("maxDrawCalls")?.value).toBe("26");
  });

  it("marks only the figures that have a budget", () => {
    expect(row("maxDrawCalls")?.ok).toBe(true);
    expect(row("avgFps")?.ok).toBe(false);
    expect(row("maxFrameMs")?.ok).toBeUndefined();
    expect(row("avgSimMs")?.ok).toBeUndefined();
  });
});
