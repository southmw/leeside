import { isItemId, type ItemId, ITEMS } from "../data/items";
import { BAG_SLOTS } from "../data/tuning";

/**
 * The bag (prototype design 4.4): a row of slots, each holding one kind of thing up to its
 * stack limit. These functions are all there is to changing a bag; none of them ever makes
 * or loses an item except as asked, and what does not fit is reported, not dropped.
 */

export interface ItemStack {
  item: ItemId;
  count: number;
}

/** Plain data, so it can be saved and sent. An empty slot is null. */
export interface Inventory {
  slots: Array<ItemStack | null>;
}

export function createInventory(size: number = BAG_SLOTS): Inventory {
  return { slots: Array.from({ length: size }, () => null) };
}

/** A whole number of things, never negative; anything else counts as none. */
function wholeCount(count: number): number {
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
}

/** How many more of `item` the bag can take: the room left in its stacks of it, and every empty slot. */
export function roomFor(inventory: Inventory, item: ItemId): number {
  const { stack } = ITEMS[item];
  let room = 0;
  for (const slot of inventory.slots) {
    if (!slot) {
      room += stack;
    } else if (slot.item === item) {
      room += Math.max(stack - slot.count, 0);
    }
  }
  return room;
}

/**
 * Puts up to `count` of `item` into the bag and returns how many went in. Stacks of the same
 * thing that are not full are topped up first, front to back; then empty slots are used,
 * front to back. What does not fit stays where it was: the caller keeps the rest.
 */
export function addItems(inventory: Inventory, item: ItemId, count: number): number {
  const { stack } = ITEMS[item];
  let left = wholeCount(count);
  const wanted = left;
  for (const slot of inventory.slots) {
    if (left === 0) {
      break;
    }
    if (slot && slot.item === item && slot.count < stack) {
      const moved = Math.min(stack - slot.count, left);
      slot.count += moved;
      left -= moved;
    }
  }
  for (let index = 0; index < inventory.slots.length && left > 0; index += 1) {
    if (!inventory.slots[index]) {
      const moved = Math.min(stack, left);
      inventory.slots[index] = { item, count: moved };
      left -= moved;
    }
  }
  return wanted - left;
}

/**
 * Takes up to `count` of `item` out of the bag and returns how many came out. The last stack
 * of it goes first, so the stacks that are not full do not end up scattered.
 */
export function removeItems(inventory: Inventory, item: ItemId, count: number): number {
  let left = wholeCount(count);
  const wanted = left;
  for (let index = inventory.slots.length - 1; index >= 0 && left > 0; index -= 1) {
    const slot = inventory.slots[index];
    if (slot && slot.item === item) {
      const moved = Math.min(slot.count, left);
      slot.count -= moved;
      left -= moved;
      if (slot.count === 0) {
        inventory.slots[index] = null;
      }
    }
  }
  return wanted - left;
}

/**
 * Takes up to `count` things out of one slot and returns what came out, or null if the slot
 * is empty or does not exist. An emptied slot stays where it is: the others do not move up.
 */
export function removeFromSlot(inventory: Inventory, index: number, count = 1): ItemStack | null {
  const slot = Number.isInteger(index) ? inventory.slots[index] : undefined;
  const moved = Math.min(wholeCount(count), slot?.count ?? 0);
  if (!slot || moved === 0) {
    return null;
  }
  slot.count -= moved;
  if (slot.count === 0) {
    inventory.slots[index] = null;
  }
  return { item: slot.item, count: moved };
}

/** How many of `item` are in the bag. */
export function countOf(inventory: Inventory, item: ItemId): number {
  return inventory.slots.reduce((sum, slot) => sum + (slot?.item === item ? slot.count : 0), 0);
}

/** How many slots have something in them. */
export function usedSlots(inventory: Inventory): number {
  return inventory.slots.filter((slot) => slot !== null).length;
}

/** Full means no empty slot, even if more of something already carried would still fit. */
export function isFull(inventory: Inventory): boolean {
  return inventory.slots.every((slot) => slot !== null);
}

/** Takes everything out. */
export function emptyInventory(inventory: Inventory): void {
  inventory.slots.fill(null);
}

/**
 * Reads a list such as "scrap:7,water_bottle:2" (the `?bag` start condition). A name alone
 * counts as one. Parts that name no item or give no whole number above zero are left out.
 */
export function parseBag(text: string | null | undefined): ItemStack[] {
  const stacks: ItemStack[] = [];
  for (const part of (text ?? "").split(",")) {
    const [name = "", amount] = part.split(":").map((piece) => piece.trim());
    const count = amount === undefined ? 1 : Number(amount);
    if (isItemId(name) && Number.isInteger(count) && count > 0) {
      stacks.push({ item: name, count });
    }
  }
  return stacks;
}
