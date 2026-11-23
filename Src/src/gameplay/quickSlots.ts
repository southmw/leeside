import type { GameWorld, QuickSlots } from "../core/ecs";
import { isQuickSlotItem, type ItemId } from "../data/items";
import { QUICK_SLOTS } from "../data/tuning";
import { QUICK_ACTIONS } from "../input/actions";
import type { Command } from "./commands";

/**
 * Quick slots (prototype design 4.5): four keys that use something out of the bag without
 * opening it. A slot holds nothing; it names a kind of item, and the count shown on it is
 * however many of that the bag has. All slots start empty and the player fills them.
 */

export function createQuickSlots(size: number = QUICK_SLOTS): QuickSlots {
  return { slots: Array.from({ length: size }, () => null), held: Array.from({ length: size }, () => false) };
}

/** Which slot `item` is on, or -1. An item is on one slot at most. */
export function quickSlotOf(quick: Pick<QuickSlots, "slots">, item: ItemId): number {
  return quick.slots.indexOf(item);
}

export type AssignOutcome = "assigned" | "cleared" | "swapped";

/**
 * What pressing a slot's number does with `item` chosen in the bag window: puts the item on
 * the slot; or, if it is there already, takes it off; or, if it is on another slot, lets the
 * two slots change places. Returns null, and changes nothing, if there is no such slot or
 * the item is not one for quick slots.
 */
export function assignQuickSlot(quick: Pick<QuickSlots, "slots">, index: number, item: ItemId): AssignOutcome | null {
  if (!Number.isInteger(index) || index < 0 || index >= quick.slots.length || !isQuickSlotItem(item)) {
    return null;
  }
  const there = quick.slots[index] ?? null;
  if (there === item) {
    quick.slots[index] = null;
    return "cleared";
  }
  const elsewhere = quickSlotOf(quick, item);
  quick.slots[index] = item;
  if (elsewhere < 0) {
    return "assigned";
  }
  quick.slots[elsewhere] = there;
  return "swapped";
}

/**
 * Takes `item` off its slot, if it is on one. Called when the last of it has left the bag,
 * used or thrown out: a slot never stays behind for something that is gone (decided when
 * step 2.15 was checked), so no slot ever shows a count of zero.
 */
export function releaseQuickSlot(quick: Pick<QuickSlots, "slots">, item: ItemId): void {
  const index = quickSlotOf(quick, item);
  if (index >= 0) {
    quick.slots[index] = null;
  }
}

/** Takes every item off its slot. */
export function clearQuickSlots(quick: QuickSlots): void {
  quick.slots.fill(null);
  quick.held.fill(false);
}

/**
 * Turns each player's fresh press of a quick slot key into a command to use that slot. A key
 * held down counts once. Whether anything can be used is the command's business.
 */
export function createQuickUseSystem(world: GameWorld, push: (command: Command) => void): () => void {
  const users = world.with("quickSlots", "input", "id");
  return () => {
    for (const user of users) {
      const { quickSlots, input } = user;
      for (let slot = 0; slot < quickSlots.slots.length; slot += 1) {
        const action = QUICK_ACTIONS[slot];
        const down = action !== undefined && input[action];
        if (down && !quickSlots.held[slot]) {
          push({ type: "useQuickSlot", actor: user.id, slot });
        }
        quickSlots.held[slot] = down;
      }
    }
  };
}
