import type { Pile } from "../core/ecs";
import type { ItemId } from "../data/items";
import { addItems, type Inventory } from "./inventory";

/**
 * Piles (prototype design 4.7): what was thrown out of a bag lies on the ground and can be
 * picked up again. Like a container's contents, a pile has one entry per kind of thing and
 * no stack limit. Nothing here ever makes or loses an item.
 */

export function createPile(): Pile {
  return { items: [] };
}

/** Lays `count` of `item` on the pile, with what is there of the same kind. */
export function addToPile(pile: Pile, item: ItemId, count: number): void {
  if (!(count > 0)) {
    return;
  }
  const entry = pile.items.find((stack) => stack.item === item);
  if (entry) {
    entry.count += count;
  } else {
    pile.items.push({ item, count });
  }
}

/**
 * Moves what is on the pile into a bag, from the first entry on, as far as it fits. Returns
 * how many things went; the rest stays on the pile.
 */
export function takeFromPile(pile: Pile, bag: Inventory): number {
  let moved = 0;
  for (const stack of pile.items) {
    const went = addItems(bag, stack.item, stack.count);
    stack.count -= went;
    moved += went;
  }
  pile.items = pile.items.filter((stack) => stack.count > 0);
  return moved;
}

/** How many things lie on the pile in all. */
export function pileTotal(pile: Pile): number {
  return pile.items.reduce((sum, stack) => sum + stack.count, 0);
}

/**
 * Of the places given, the one nearest to `at` (level distance) that is within `reach`
 * metres and no more than `reach` above or below, or undefined.
 */
export function nearestWithin<T extends { x: number; y: number; z: number }>(
  places: Iterable<T>,
  at: { x: number; y: number; z: number },
  reach: number,
): T | undefined {
  let best: T | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const place of places) {
    const distance = Math.hypot(place.x - at.x, place.z - at.z);
    if (distance <= reach && Math.abs(place.y - at.y) <= reach && distance < bestDistance) {
      best = place;
      bestDistance = distance;
    }
  }
  return best;
}
