import { describe, expect, it } from "vitest";
import { createTransform, createWorld } from "../../src/core/ecs";
import { TICK_RATE, TICK_SECONDS } from "../../src/core/fixedTimestep";
import { COLD_TEMPERATURE, HYPOTHERMIA_DAMAGE_PER_SECOND, MAX_HEALTH, MIN_TEMPERATURE } from "../../src/data/tuning";
import { createHealth } from "../../src/gameplay/health";
import {
  coldDamage,
  createTemperature,
  createTemperatureSystem,
  stepTemperature,
  temperatureStage,
} from "../../src/gameplay/temperature";

describe("createTemperature", () => {
  it("starts comfortable unless told otherwise, and stays within the scale the prototype uses", () => {
    expect(createTemperature()).toEqual({ value: 0 });
    expect(createTemperature(-80).value).toBe(-80);
    expect(createTemperature(-500).value).toBe(MIN_TEMPERATURE);
    expect(createTemperature(40).value).toBe(0);
  });
});

describe("temperatureStage", () => {
  it("is comfortable down to -50, cold from there, and hypothermia at the bottom", () => {
    expect(COLD_TEMPERATURE).toBe(-50);
    expect(MIN_TEMPERATURE).toBe(-100);
    expect(temperatureStage(0)).toBe("comfortable");
    expect(temperatureStage(-49.9)).toBe("comfortable");
    expect(temperatureStage(-50)).toBe("cold");
    expect(temperatureStage(-99.9)).toBe("cold");
    expect(temperatureStage(-100)).toBe("hypothermia");
  });
});

describe("stepTemperature", () => {
  it("falls at night in the open: cold after 60 seconds, hypothermia after 120", () => {
    expect(temperatureStage(stepTemperature(0, true, false, 59))).toBe("comfortable");
    expect(temperatureStage(stepTemperature(0, true, false, 60.01))).toBe("cold");
    expect(temperatureStage(stepTemperature(0, true, false, 119))).toBe("cold");
    expect(temperatureStage(stepTemperature(0, true, false, 120.01))).toBe("hypothermia");
    expect(stepTemperature(0, true, false, 1000)).toBe(MIN_TEMPERATURE);
  });

  it("rises in shelter at night: from hypothermia to comfortable in 20 seconds", () => {
    expect(stepTemperature(MIN_TEMPERATURE, true, true, 10)).toBeCloseTo(-50);
    expect(stepTemperature(MIN_TEMPERATURE, true, true, 20)).toBeCloseTo(0);
    expect(stepTemperature(MIN_TEMPERATURE, true, true, 500)).toBe(0);
  });

  it("rises by day, in the open as well as indoors", () => {
    expect(stepTemperature(-60, false, false, 2)).toBeCloseTo(-50);
    expect(stepTemperature(-60, false, true, 2)).toBeCloseTo(-50);
    expect(stepTemperature(0, false, false, 60)).toBe(0);
  });

  it("does not change in no time, and ignores negative time", () => {
    expect(stepTemperature(-30, true, false, 0)).toBe(-30);
    expect(stepTemperature(-30, true, false, -5)).toBe(-30);
  });
});

describe("coldDamage", () => {
  it("takes 2 a second in hypothermia and nothing before", () => {
    expect(HYPOTHERMIA_DAMAGE_PER_SECOND).toBe(2);
    expect(coldDamage("hypothermia", 1)).toBeCloseTo(2);
    expect(coldDamage("cold", 1)).toBe(0);
    expect(coldDamage("comfortable", 1)).toBe(0);
  });
});

describe("temperature system", () => {
  function setup(night: boolean, zone: string | null, start = 0) {
    const world = createWorld();
    const player = world.add({
      transform: createTransform(0, 0, 0),
      shelter: { zone },
      health: createHealth(),
      temperature: createTemperature(start),
    });
    const state = { night };
    const system = createTemperatureSystem(world, () => state.night);
    const run = (seconds: number, scale = 1): void => {
      for (let tick = 0; tick < Math.round((seconds * TICK_RATE) / scale); tick += 1) {
        system(TICK_SECONDS * scale);
      }
    };
    return { player, state, run, system };
  }

  it("cools a player out at night and leaves health alone until hypothermia", () => {
    const { player, run } = setup(true, null);
    run(119);
    expect(temperatureStage(player.temperature.value)).toBe("cold");
    expect(player.health.current).toBe(MAX_HEALTH);
    expect(player.health.lastHurtBy).toBeUndefined();
  });

  it("takes health in hypothermia, 100 in 50 seconds, and names the cold as the cause", () => {
    const { player, run } = setup(true, null, MIN_TEMPERATURE);
    run(25);
    expect(player.health.current).toBeCloseTo(50, 0);
    expect(player.health.lastHurtBy).toBe("cold");
    run(25.1);
    expect(player.health.current).toBe(0);
  });

  it("warms a player who gets indoors, and the damage stops at once", () => {
    const { player, run } = setup(true, null, MIN_TEMPERATURE);
    run(5);
    const hurtSoFar = player.health.current;
    player.shelter.zone = "house";
    run(20.1);
    expect(player.temperature.value).toBe(0);
    expect(player.health.current).toBeCloseTo(hurtSoFar, 0);
  });

  it("warms a player when the day comes", () => {
    const { player, state, run } = setup(true, null, -70);
    state.night = false;
    run(14.1);
    expect(player.temperature.value).toBe(0);
  });

  it("cools as much over a night at any clock speed, and not at all with the clock stopped", () => {
    const normal = setup(true, null);
    const fast = setup(true, null);
    normal.run(30);
    fast.run(30, 30);
    expect(fast.player.temperature.value).toBeCloseTo(normal.player.temperature.value, 5);
    const stopped = setup(true, null);
    for (let tick = 0; tick < 600; tick += 1) {
      stopped.system(0);
    }
    expect(stopped.player.temperature.value).toBe(0);
  });
});
