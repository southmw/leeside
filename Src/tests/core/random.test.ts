import { describe, expect, it } from "vitest";
import { createRandom } from "../../src/core/random";

describe("createRandom", () => {
  it("gives the same sequence for the same seed", () => {
    const a = createRandom(42);
    const b = createRandom(42);
    for (let i = 0; i < 100; i += 1) {
      expect(a.next()).toBe(b.next());
    }
  });

  it("gives a different sequence for a different seed", () => {
    const a = createRandom(1);
    const b = createRandom(2);
    const same = Array.from({ length: 20 }, () => a.next() === b.next()).filter(Boolean);
    expect(same.length).toBeLessThan(3);
  });

  it("stays within 0 (inclusive) and 1 (exclusive) and spreads evenly", () => {
    const random = createRandom(7);
    let sum = 0;
    for (let i = 0; i < 10_000; i += 1) {
      const value = random.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      sum += value;
    }
    expect(sum / 10_000).toBeCloseTo(0.5, 1);
  });

  it("keeps range within its limits", () => {
    const random = createRandom(3);
    for (let i = 0; i < 1000; i += 1) {
      const value = random.range(-2, 5);
      expect(value).toBeGreaterThanOrEqual(-2);
      expect(value).toBeLessThan(5);
    }
  });

  it("returns whole numbers including both ends for int", () => {
    const random = createRandom(9);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i += 1) {
      seen.add(random.int(1, 4));
    }
    expect([...seen].sort()).toEqual([1, 2, 3, 4]);
  });

  it("does not depend on Math.random", () => {
    const original = Math.random;
    Math.random = () => {
      throw new Error("Math.random must not be used");
    };
    try {
      expect(() => createRandom(5).next()).not.toThrow();
    } finally {
      Math.random = original;
    }
  });
});
