import type { GameWorld, Thirst } from "../core/ecs";
import { MAX_THIRST, THIRST_DAMAGE_PER_SECOND, THIRST_PER_SECOND } from "../data/tuning";
import { hurt } from "./health";

/**
 * Thirst (prototype design 3.4). The figure counts down from 100, the same everywhere and at
 * any hour; at zero it takes health. Drinking brings it back up.
 */

export function createThirst(value = MAX_THIRST): Thirst {
  return { value: Math.min(Math.max(value, 0), MAX_THIRST) };
}

/** The figure after `seconds` of game time without a drink. It stops at zero. */
export function stepThirst(value: number, seconds: number): number {
  return Math.max(value - THIRST_PER_SECOND * Math.max(seconds, 0), 0);
}

export function isParched(thirst: Thirst): boolean {
  return thirst.value <= 0;
}

/** Health that thirst takes over `seconds` of game time: nothing until the figure is at zero. */
export function thirstDamage(parched: boolean, seconds: number): number {
  return parched ? THIRST_DAMAGE_PER_SECOND * Math.max(seconds, 0) : 0;
}

/** Drinking: brings the figure up by `amount`, to the full figure at most. */
export function drink(thirst: Thirst, amount: number): void {
  thirst.value = Math.min(thirst.value + Math.max(amount, 0), MAX_THIRST);
}

/** Makes everyone thirstier, and hurts those who have run dry. The step is in game time. */
export function createThirstSystem(world: GameWorld): (gameSeconds: number) => void {
  const drinkers = world.with("thirst");
  return (gameSeconds) => {
    if (gameSeconds <= 0) {
      return;
    }
    for (const { thirst, health } of drinkers) {
      thirst.value = stepThirst(thirst.value, gameSeconds);
      if (health) {
        hurt(health, thirstDamage(isParched(thirst), gameSeconds), "thirst");
      }
    }
  };
}
