import { describe, expect, it } from "vitest";
import { frameLevel, graphBar } from "../../src/debug/frameGraph";
import { readHeapMb } from "../../src/debug/memory";

describe("frameLevel", () => {
  it("uses the long-frame thresholds", () => {
    expect(frameLevel(16.7)).toBe("ok");
    expect(frameLevel(34)).toBe("ok");
    expect(frameLevel(34.1)).toBe("long");
    expect(frameLevel(50)).toBe("long");
    expect(frameLevel(50.1)).toBe("veryLong");
  });
});

describe("graphBar", () => {
  it("scales the height to the graph", () => {
    expect(graphBar(25, 48, 50).height).toBe(24);
    expect(graphBar(50, 48, 50).height).toBe(48);
  });

  it("clamps frames beyond the scale to full height", () => {
    expect(graphBar(400, 48, 50)).toEqual({ height: 48, level: "veryLong" });
  });

  it("draws even a very short frame at least 1 px tall", () => {
    expect(graphBar(0.1, 48, 50).height).toBe(1);
  });

  it("draws nothing for an invalid frame time", () => {
    expect(graphBar(0, 48, 50).height).toBe(0);
    expect(graphBar(Number.NaN, 48, 50).height).toBe(0);
  });
});

describe("readHeapMb", () => {
  it("converts bytes to megabytes", () => {
    expect(readHeapMb({ memory: { usedJSHeapSize: 50 * 1024 * 1024 } })).toBe(50);
  });

  it("is undefined where the browser does not report memory", () => {
    expect(readHeapMb({})).toBeUndefined();
    expect(readHeapMb({ memory: {} })).toBeUndefined();
  });
});
