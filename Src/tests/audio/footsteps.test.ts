import { describe, expect, it } from "vitest";
import { advanceFootsteps, createFootsteps, FOOTSTEP_VARIANTS, type FootstepSound } from "../../src/audio/footsteps";
import { createRandom } from "../../src/core/random";

const DT = 1 / 60;
const STRIDE = 2.5;
/** 12 m/s, the walking speed. */
const PER_STEP = 12 * DT;

function run(steps: number, moved: number, grounded = true, state = createFootsteps(), random = createRandom(1)): FootstepSound[] {
  const sounds: FootstepSound[] = [];
  for (let i = 0; i < steps; i += 1) {
    const sound = advanceFootsteps(state, DT, moved, grounded, STRIDE, random);
    if (sound) {
      sounds.push(sound);
    }
  }
  return sounds;
}

describe("advanceFootsteps", () => {
  it("is silent while standing still", () => {
    expect(run(600, 0)).toEqual([]);
  });

  it("sounds once per stride while walking", () => {
    // Ten seconds at 12 m/s is 120 m: 48 strides of 2.5 m, the first after half a stride.
    expect(run(600, PER_STEP)).toHaveLength(48);
  });

  it("sounds the first step half a stride after setting off", () => {
    const state = createFootsteps();
    const random = createRandom(1);
    run(10, 0, true, state, random);
    const stepsToHalfStride = Math.ceil(STRIDE / 2 / PER_STEP);
    expect(run(stepsToHalfStride - 1, PER_STEP, true, state, random)).toHaveLength(0);
    expect(run(1, PER_STEP, true, state, random)).toHaveLength(1);
  });

  it("is silent in the air and sounds once, at full volume, on landing", () => {
    const state = createFootsteps();
    const random = createRandom(1);
    expect(run(40, PER_STEP, false, state, random)).toEqual([]);
    const landing = run(1, PER_STEP, true, state, random);
    expect(landing).toHaveLength(1);
    expect(landing[0]?.volume).toBe(1);
  });

  it("does not take a moment off the ground for a landing", () => {
    const state = createFootsteps();
    const random = createRandom(1);
    run(5, PER_STEP, true, state, random);
    run(3, PER_STEP, false, state, random);
    expect(run(1, PER_STEP, true, state, random)).toEqual([]);
  });

  it("is silent when the character is moved a long way at once", () => {
    expect(run(3, 50)).toEqual([]);
  });

  it("never plays the same recording twice running, and stays within its ranges", () => {
    const sounds = run(6000, PER_STEP);
    const seen = new Set<number>();
    sounds.forEach((sound, index) => {
      seen.add(sound.variant);
      expect(sound.variant).toBeGreaterThanOrEqual(0);
      expect(sound.variant).toBeLessThan(FOOTSTEP_VARIANTS);
      expect(sound.variant).not.toBe(sounds[index - 1]?.variant);
      expect(sound.volume).toBeGreaterThanOrEqual(0.75);
      expect(sound.volume).toBeLessThanOrEqual(1);
      expect(Math.abs(sound.rate - 1)).toBeLessThanOrEqual(0.08);
    });
    expect(seen.size).toBe(FOOTSTEP_VARIANTS);
  });

  it("gives the same steps for the same seed", () => {
    expect(run(600, PER_STEP)).toEqual(run(600, PER_STEP));
  });
});
