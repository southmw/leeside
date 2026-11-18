import { describe, expect, it } from "vitest";
import { createTransform, createWorld } from "../../src/core/ecs";
import { TICK_SECONDS } from "../../src/core/fixedTimestep";
import { MAX_HEALTH, STORM_DAMAGE_PER_SECOND, STORM_RISE_SECONDS } from "../../src/data/tuning";
import { createExposureSystem, createHealth, hurt, isDead, stormDamage } from "../../src/gameplay/health";
import { callStorm, createWeather, readWeather, stormOfDay } from "../../src/gameplay/weather";

describe("createHealth", () => {
  it("starts full unless told otherwise, and stays within its range", () => {
    expect(createHealth()).toEqual({ current: MAX_HEALTH, max: MAX_HEALTH });
    expect(createHealth(10).current).toBe(10);
    expect(createHealth(500).current).toBe(MAX_HEALTH);
    expect(createHealth(-5).current).toBe(0);
  });
});

describe("stormDamage", () => {
  it("takes 4 a second in a full storm, out in the open", () => {
    expect(STORM_DAMAGE_PER_SECOND).toBe(4);
    expect(stormDamage(1, false, 1)).toBeCloseTo(4);
    expect(stormDamage(1, false, 0.5)).toBeCloseTo(2);
  });

  it("follows the storm's strength", () => {
    expect(stormDamage(0.5, false, 1)).toBeCloseTo(2);
    expect(stormDamage(0, false, 1)).toBe(0);
    expect(stormDamage(3, false, 1)).toBeCloseTo(4);
  });

  it("takes nothing in shelter", () => {
    expect(stormDamage(1, true, 10)).toBe(0);
  });
});

describe("hurt", () => {
  it("stops at zero, where one is dead", () => {
    const health = createHealth(5);
    hurt(health, 3);
    expect(health.current).toBe(2);
    expect(isDead(health)).toBe(false);
    hurt(health, 30);
    expect(health.current).toBe(0);
    expect(isDead(health)).toBe(true);
  });

  it("never heals", () => {
    const health = createHealth(50);
    hurt(health, -20);
    expect(health.current).toBe(50);
  });
});

describe("exposure system", () => {
  const setUp = (intensity: () => number) => {
    const world = createWorld();
    const outside = world.add({ transform: createTransform(), health: createHealth(), shelter: { zone: null as string | null } });
    const inside = world.add({ transform: createTransform(), health: createHealth(), shelter: { zone: "house" } });
    return { outside, inside, system: createExposureSystem(world, intensity) };
  };

  it("kills in 25 seconds of a full storm in the open, and not a moment before", () => {
    const { outside, system } = setUp(() => 1);
    const ticks = 25 / TICK_SECONDS;
    for (let tick = 0; tick < ticks - 2; tick += 1) {
      system(TICK_SECONDS);
    }
    expect(isDead(outside.health)).toBe(false);
    expect(outside.health.current).toBeLessThan(0.2);
    for (let tick = 0; tick < 3; tick += 1) {
      system(TICK_SECONDS);
    }
    expect(isDead(outside.health)).toBe(true);
  });

  it("leaves those in shelter unhurt", () => {
    const { inside, system } = setUp(() => 1);
    for (let tick = 0; tick < 60 / TICK_SECONDS; tick += 1) {
      system(TICK_SECONDS);
    }
    expect(inside.health.current).toBe(MAX_HEALTH);
  });

  it("does nothing in clear weather or while the clock stands still", () => {
    let strength = 0;
    const { outside, system } = setUp(() => strength);
    system(10);
    expect(outside.health.current).toBe(MAX_HEALTH);
    strength = 1;
    system(0);
    expect(outside.health.current).toBe(MAX_HEALTH);
  });

  it("stops when the player gets indoors and goes on when they leave", () => {
    const { outside, system } = setUp(() => 1);
    system(5);
    expect(outside.health.current).toBeCloseTo(80);
    outside.shelter.zone = "house";
    system(5);
    expect(outside.health.current).toBeCloseTo(80);
    outside.shelter.zone = null;
    system(5);
    expect(outside.health.current).toBeCloseTo(60);
  });

  it("hurts as much in total at any clock speed", () => {
    const run = (scale: number): number => {
      const { outside, system } = setUp(() => 0.5);
      // Ten seconds of game time, at this clock speed.
      for (let tick = 0; tick < 10 / (TICK_SECONDS * scale); tick += 1) {
        system(TICK_SECONDS * scale);
      }
      return outside.health.current;
    };
    expect(run(1)).toBeCloseTo(80, 0);
    expect(run(10)).toBeCloseTo(run(1), 0);
  });

  it("takes about 27 seconds to kill from the moment a real storm arrives", () => {
    // The storm takes a few seconds to reach full strength, which buys half that time.
    const weather = createWeather(1);
    callStorm(weather, 0, { ...stormOfDay(1, 1), stormSeconds: 75 }, false);
    let elapsed = 0;
    const { outside, system } = setUp(() => readWeather(weather, elapsed).intensity);
    while (!isDead(outside.health) && elapsed < 60) {
      elapsed += TICK_SECONDS;
      system(TICK_SECONDS);
    }
    expect(elapsed).toBeCloseTo(25 + STORM_RISE_SECONDS / 2, 0);
  });
});
