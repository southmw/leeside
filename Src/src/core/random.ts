/**
 * Seeded random numbers. Game logic never uses `Math.random()`: the same seed must give the
 * same world on every machine and in every test run.
 */
export interface Random {
  /** A number from 0 (inclusive) to 1 (exclusive). */
  next(): number;
  /** A number from `min` (inclusive) to `max` (exclusive). */
  range(min: number, max: number): number;
  /** A whole number from `min` to `max`, both inclusive. */
  int(min: number, max: number): number;
}

/** Creates a generator (mulberry32) from a whole-number seed. */
export function createRandom(seed: number): Random {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (min, max) => min + (max - min) * next(),
    int: (min, max) => Math.floor(min + (max - min + 1) * next()),
  };
}
