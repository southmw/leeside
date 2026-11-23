import { ITEM_IDS } from "../data/items";
import { countOf, emptyInventory, type Inventory, type ItemStack } from "./inventory";

/**
 * The bag left behind by a death (prototype design 2.4): everything that was carried lies
 * where the character fell, to be fetched again. Nothing is lost by dying but the walk.
 */

/**
 * Takes everything out of a bag and returns it, one entry per kind of thing, in the items'
 * own order. An empty bag gives an empty list.
 */
export function emptyBagIntoStacks(bag: Inventory): ItemStack[] {
  const stacks: ItemStack[] = [];
  for (const item of ITEM_IDS) {
    const count = countOf(bag, item);
    if (count > 0) {
      stacks.push({ item, count });
    }
  }
  emptyInventory(bag);
  return stacks;
}
