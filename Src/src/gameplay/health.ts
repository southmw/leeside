import type { DamageCause, GameWorld, Health } from "../core/ecs";
import { MAX_HEALTH, STORM_DAMAGE_PER_SECOND } from "../data/tuning";

/**
 * Health, and what the storm takes from it (prototype design 3.4). Out in a storm health
 * drains with the storm's strength; in a shelter zone it does not. What happens at zero is
 * the game's business (game.ts), not decided here.
 */

export function createHealth(current = MAX_HEALTH): Health {
  return { current: Math.min(Math.max(current, 0), MAX_HEALTH), max: MAX_HEALTH };
}

/**
 * Health lost to a storm of strength `intensity` (0 to 1) over `seconds` of game time.
 * Nothing in shelter, nothing while the storm has not arrived.
 */
export function stormDamage(intensity: number, sheltered: boolean, seconds: number): number {
  if (sheltered) {
    return 0;
  }
  return STORM_DAMAGE_PER_SECOND * Math.min(Math.max(intensity, 0), 1) * Math.max(seconds, 0);
}

/** Takes `amount` from health, which stops at zero, and notes what did it. */
export function hurt(health: Health, amount: number, cause?: DamageCause): void {
  if (!(amount > 0)) {
    return;
  }
  health.current = Math.max(health.current - amount, 0);
  if (cause) {
    health.lastHurtBy = cause;
  }
}

/** Gives back `amount` of health, up to the most the entity can have. */
export function heal(health: Health, amount: number): void {
  health.current = Math.min(health.current + Math.max(amount, 0), health.max);
}

export function isDead(health: Health): boolean {
  return health.current <= 0;
}

/**
 * Drains the health of everyone caught outside in the storm. `intensity` gives the storm's
 * strength now. The step is in game time, so a stopped clock stops the damage and a storm
 * hurts as much in total at any clock speed.
 */
export function createExposureSystem(world: GameWorld, intensity: () => number): (gameSeconds: number) => void {
  const exposed = world.with("health", "shelter");
  return (gameSeconds) => {
    const strength = intensity();
    if (strength <= 0 || gameSeconds <= 0) {
      return;
    }
    for (const { health, shelter } of exposed) {
      hurt(health, stormDamage(strength, shelter.zone !== null, gameSeconds), "storm");
    }
  };
}
