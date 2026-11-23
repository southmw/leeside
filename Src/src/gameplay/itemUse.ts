import type { Health, Thirst } from "../core/ecs";
import { type ItemDefinition, type ItemId, ITEMS } from "../data/items";
import { MAX_THIRST } from "../data/tuning";
import { heal } from "./health";
import { countOf, type Inventory, removeItems } from "./inventory";
import { drink } from "./thirst";

/**
 * Using things up (prototype design 4.5): a water bottle against thirst, a bandage for
 * health. One judgement serves the quick slots, the bag window and the screen that dims
 * what cannot be used, so they never disagree.
 */

export type UseRefusal =
  /** The character lies collapsed. */
  | "collapsed"
  /** Not a thing that is used: a repair material. */
  | "not_usable"
  /** None in the bag. */
  | "none_left"
  /** What it would restore is full already; using it would waste it. */
  | "nothing_to_restore";

/** Whoever uses the thing: their bag, and what the thing would restore. */
export interface ItemUser {
  inventory: Inventory;
  health?: Health;
  thirst?: Thirst;
}

/** Why `user` cannot use an `item` right now, or null if they can. */
export function useRefusal(user: ItemUser, item: ItemId): UseRefusal | null {
  if (user.health && user.health.current <= 0) {
    return "collapsed";
  }
  const definition: ItemDefinition = ITEMS[item];
  if (!definition.use) {
    return "not_usable";
  }
  if (countOf(user.inventory, item) === 0) {
    return "none_left";
  }
  const full =
    definition.use.restores === "thirst"
      ? !user.thirst || user.thirst.value >= MAX_THIRST
      : !user.health || user.health.current >= user.health.max;
  return full ? "nothing_to_restore" : null;
}

/**
 * Uses one `item` out of the bag: the last stack of it shrinks (inventory.ts) and what it
 * restores goes up. Returns null, or why nothing was done; then nothing has changed.
 */
export function useItem(user: ItemUser, item: ItemId): UseRefusal | null {
  const refusal = useRefusal(user, item);
  if (refusal) {
    return refusal;
  }
  const definition: ItemDefinition = ITEMS[item];
  removeItems(user.inventory, item, 1);
  if (definition.use?.restores === "thirst" && user.thirst) {
    drink(user.thirst, definition.use.amount);
  } else if (definition.use?.restores === "health" && user.health) {
    heal(user.health, definition.use.amount);
  }
  return null;
}
