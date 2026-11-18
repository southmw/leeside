import type { GameWorld, Temperature } from "../core/ecs";
import {
  COLD_TEMPERATURE,
  COOLING_PER_SECOND,
  HYPOTHERMIA_DAMAGE_PER_SECOND,
  MIN_TEMPERATURE,
  WARMING_PER_SECOND,
} from "../data/tuning";
import { hurt } from "./health";

/**
 * Body temperature (prototype design 3.4). The prototype knows only the cold of the night:
 * out in the open at night the body cools, anywhere else it warms back up, and at the
 * bottom of the scale the cold takes health. 0 is comfortable; the scale runs down to -100.
 */

export type TemperatureStage = "comfortable" | "cold" | "hypothermia";

export function createTemperature(value = 0): Temperature {
  return { value: Math.min(Math.max(value, MIN_TEMPERATURE), 0) };
}

export function temperatureStage(value: number): TemperatureStage {
  if (value <= MIN_TEMPERATURE) {
    return "hypothermia";
  }
  return value <= COLD_TEMPERATURE ? "cold" : "comfortable";
}

/**
 * The temperature after `seconds` of game time. It falls at night out of shelter and rises
 * otherwise, and stays between the coldest and comfortable.
 */
export function stepTemperature(value: number, night: boolean, sheltered: boolean, seconds: number): number {
  const time = Math.max(seconds, 0);
  const next = night && !sheltered ? value - COOLING_PER_SECOND * time : value + WARMING_PER_SECOND * time;
  return Math.min(Math.max(next, MIN_TEMPERATURE), 0);
}

/** Health the cold takes over `seconds` of game time: nothing until hypothermia. */
export function coldDamage(stage: TemperatureStage, seconds: number): number {
  return stage === "hypothermia" ? HYPOTHERMIA_DAMAGE_PER_SECOND * Math.max(seconds, 0) : 0;
}

/**
 * Cools or warms everyone, and hurts those in hypothermia. `night` says whether it is night
 * now. The step is in game time, like the storm's damage: a stopped clock stops the cold.
 */
export function createTemperatureSystem(world: GameWorld, night: () => boolean): (gameSeconds: number) => void {
  const bodies = world.with("temperature", "shelter");
  return (gameSeconds) => {
    if (gameSeconds <= 0) {
      return;
    }
    const isNight = night();
    for (const { temperature, shelter, health } of bodies) {
      temperature.value = stepTemperature(temperature.value, isNight, shelter.zone !== null, gameSeconds);
      if (health) {
        hurt(health, coldDamage(temperatureStage(temperature.value), gameSeconds), "cold");
      }
    }
  };
}
