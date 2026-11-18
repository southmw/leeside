import { describe, expect, it } from "vitest";
import { createWorld } from "../../src/core/ecs";
import { TICK_RATE, TICK_SECONDS } from "../../src/core/fixedTimestep";
import { MAX_HEALTH, MAX_THIRST, THIRST_DAMAGE_PER_SECOND, WATER_BOTTLE_THIRST } from "../../src/data/tuning";
import { createHealth } from "../../src/gameplay/health";
import { createThirst, createThirstSystem, drink, isParched, stepThirst, thirstDamage } from "../../src/gameplay/thirst";

describe("createThirst", () => {
  it("starts full unless told otherwise, and stays within its range", () => {
    expect(createThirst()).toEqual({ value: MAX_THIRST });
    expect(createThirst(20).value).toBe(20);
    expect(createThirst(500).value).toBe(MAX_THIRST);
    expect(createThirst(-5).value).toBe(0);
  });
});

describe("stepThirst", () => {
  it("runs from 100 to nothing in ten minutes", () => {
    expect(MAX_THIRST).toBe(100);
    expect(stepThirst(100, 60)).toBeCloseTo(90);
    expect(stepThirst(100, 300)).toBeCloseTo(50);
    expect(stepThirst(100, 599)).toBeGreaterThan(0);
    expect(stepThirst(100, 600.01)).toBe(0);
    expect(stepThirst(100, 5000)).toBe(0);
  });

  it("does not change in no time, and ignores negative time", () => {
    expect(stepThirst(40, 0)).toBe(40);
    expect(stepThirst(40, -10)).toBe(40);
  });
});

describe("thirstDamage", () => {
  it("takes 1 a second once the figure is at zero, and nothing before", () => {
    expect(THIRST_DAMAGE_PER_SECOND).toBe(1);
    expect(thirstDamage(true, 1)).toBeCloseTo(1);
    expect(thirstDamage(true, 0.5)).toBeCloseTo(0.5);
    expect(thirstDamage(false, 1)).toBe(0);
  });
});

describe("drink", () => {
  it("brings the figure up by the amount, a water bottle by 40", () => {
    expect(WATER_BOTTLE_THIRST).toBe(40);
    const thirst = createThirst(10);
    drink(thirst, WATER_BOTTLE_THIRST);
    expect(thirst.value).toBe(50);
  });

  it("does not go over the full figure, and a negative amount does nothing", () => {
    const thirst = createThirst(80);
    drink(thirst, WATER_BOTTLE_THIRST);
    expect(thirst.value).toBe(MAX_THIRST);
    drink(thirst, -30);
    expect(thirst.value).toBe(MAX_THIRST);
  });
});

describe("thirst system", () => {
  function setup(start = MAX_THIRST) {
    const world = createWorld();
    const player = world.add({ health: createHealth(), thirst: createThirst(start) });
    const system = createThirstSystem(world);
    const run = (seconds: number, scale = 1): void => {
      for (let tick = 0; tick < Math.round((seconds * TICK_RATE) / scale); tick += 1) {
        system(TICK_SECONDS * scale);
      }
    };
    return { player, system, run };
  }

  it("makes the player thirstier and leaves health alone while there is any left", () => {
    const { player, run } = setup();
    run(120);
    expect(player.thirst.value).toBeCloseTo(80, 3);
    expect(player.health.current).toBe(MAX_HEALTH);
    expect(player.health.lastHurtBy).toBeUndefined();
  });

  it("takes health once the player has run dry, 100 in 100 seconds, and names thirst as the cause", () => {
    const { player, run } = setup(0);
    expect(isParched(player.thirst)).toBe(true);
    run(50);
    expect(player.health.current).toBeCloseTo(50, 0);
    expect(player.health.lastHurtBy).toBe("thirst");
    run(50.1);
    expect(player.health.current).toBe(0);
  });

  it("stops hurting after a drink", () => {
    const { player, run } = setup(0);
    run(10);
    const hurtSoFar = player.health.current;
    drink(player.thirst, WATER_BOTTLE_THIRST);
    run(10);
    expect(player.health.current).toBe(hurtSoFar);
    expect(player.thirst.value).toBeLessThan(WATER_BOTTLE_THIRST);
  });

  it("goes as far in a day at any clock speed, and nowhere with the clock stopped", () => {
    const normal = setup();
    const fast = setup();
    normal.run(60);
    fast.run(60, 30);
    expect(fast.player.thirst.value).toBeCloseTo(normal.player.thirst.value, 5);
    const stopped = setup();
    for (let tick = 0; tick < 600; tick += 1) {
      stopped.system(0);
    }
    expect(stopped.player.thirst.value).toBe(MAX_THIRST);
  });
});
