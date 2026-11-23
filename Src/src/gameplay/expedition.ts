import type { Health } from "../core/ecs";
import { ITEM_IDS, type ItemId } from "../data/items";
import { RETURN_HEALTH } from "../data/tuning";
import { heal } from "./health";
import { countOf, type Inventory, type ItemStack } from "./inventory";
import type { RepairRow } from "./repair";

/**
 * Coming back to the shelter (prototype design 2.3): what an outing brought in, and the rest
 * the shelter gives. An outing is counted from the morning's bag to the bag at the return.
 */

/** How many of each item there are. */
export type ItemCounts = Record<ItemId, number>;

/** The bag's contents counted by item, all stacks together. */
export function countItems(inventory: Inventory): ItemCounts {
  const counts = {} as ItemCounts;
  for (const item of ITEM_IDS) {
    counts[item] = countOf(inventory, item);
  }
  return counts;
}

/**
 * What the bag holds more of now than it did before, item by item in the items' own order.
 * What there is less of (water drunk on the way) is not listed.
 */
export function broughtBack(before: ItemCounts, now: ItemCounts): ItemStack[] {
  const gained: ItemStack[] = [];
  for (const item of ITEM_IDS) {
    const count = now[item] - before[item];
    if (count > 0) {
      gained.push({ item, count });
    }
  }
  return gained;
}

/** The rest on coming in: health comes back, up to the full figure. Returns how much came back. */
export function restAtShelter(health: Health): number {
  const before = health.current;
  heal(health, RETURN_HEALTH);
  return health.current - before;
}

/** A return as the tally shows it. */
export interface ReturnTally {
  /** The day that ends with this return, counted from 1: how many days the player has lasted. */
  day: number;
  brought: ItemStack[];
  /** Health given back, rounded as the bar shows it. */
  healthRestored: number;
  /** The door's repair after this return's materials went in (gameplay/repair.ts). */
  repair: RepairRow[];
  repairDone: boolean;
}
