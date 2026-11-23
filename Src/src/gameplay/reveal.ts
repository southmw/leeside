import { createRandom } from "../core/random";
import type { ItemId } from "../data/items";
import { REPAIR_NEEDS, REVEAL_COUNT, REVEAL_WEIGHTS } from "../data/tuning";
import { countOf, type Inventory } from "./inventory";
import { REPAIR_MATERIALS, type RepairMaterial, type RepairProgress } from "./repair";

/**
 * What a storm uncovers (prototype design 4.2): when one has passed, a material lies at four
 * of the riverbed's twelve spots. The materials the door's repair is still short of come
 * first, which is what lets the repair be finished even by someone who has lost everything.
 */

/** How many of each material are still to be found: what the door needs, less what is in it and in the bag. */
export function shortfall(repair: RepairProgress, bag: Inventory): Record<RepairMaterial, number> {
  const short = {} as Record<RepairMaterial, number>;
  for (const material of REPAIR_MATERIALS) {
    short[material] = Math.max(REPAIR_NEEDS[material] - repair[material] - countOf(bag, material), 0);
  }
  return short;
}

export interface Reveal {
  /** Which of the zone's spots, by its place in the list. */
  spot: number;
  item: ItemId;
}

/**
 * What lies where after a storm: `REVEAL_COUNT` different spots out of `spotCount`, each with
 * one material. The material most short, as a share of what is needed, is picked first, and
 * counts as one less short from then on; with nothing short the pick goes by fixed weights.
 * The same seed gives the same result.
 */
export function revealAfterStorm(spotCount: number, short: Readonly<Record<RepairMaterial, number>>, seed: number): Reveal[] {
  const random = createRandom(seed);
  const spots = Array.from({ length: Math.max(Math.floor(spotCount), 0) }, (_, index) => index);
  const left = { ...short };
  const reveals: Reveal[] = [];
  const totalWeight = REPAIR_MATERIALS.reduce((sum, material) => sum + REVEAL_WEIGHTS[material], 0);
  while (reveals.length < REVEAL_COUNT && spots.length > 0) {
    const [spot] = spots.splice(random.int(0, spots.length - 1), 1);
    let item: RepairMaterial | undefined;
    let most = 0;
    for (const material of REPAIR_MATERIALS) {
      const share = left[material] / REPAIR_NEEDS[material];
      if (share > most) {
        most = share;
        item = material;
      }
    }
    if (item) {
      left[item] -= 1;
    } else {
      // Nothing is short: a weighted draw.
      let roll = random.next() * totalWeight;
      for (const material of REPAIR_MATERIALS) {
        item = material;
        roll -= REVEAL_WEIGHTS[material];
        if (roll < 0) {
          break;
        }
      }
    }
    if (spot !== undefined && item) {
      reveals.push({ spot, item });
    }
  }
  return reveals;
}

/** Whether a storm has just passed, going by the weather's phase in the last step and in this one. */
export function stormJustPassed(before: string, now: string): boolean {
  return before === "storm" && now !== "storm";
}
