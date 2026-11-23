import type { ItemId } from "../data/items";
import { REPAIR_NEEDS } from "../data/tuning";
import { countOf, type Inventory, type ItemStack, removeItems } from "./inventory";

/**
 * The shelter door's repair, the prototype's goal (prototype design 2.1). Materials brought
 * back go into it by themselves, as many as are still missing; what is in stays in. The
 * progress is the shelter's, not a player's: in multiplayer everyone fills the same door.
 */

export type RepairMaterial = keyof typeof REPAIR_NEEDS;
/** The materials in the order they are shown. */
export const REPAIR_MATERIALS = Object.keys(REPAIR_NEEDS) as RepairMaterial[];

/** How many of each material have gone into the door. Plain data. */
export type RepairProgress = Record<RepairMaterial, number>;

export function createRepair(): RepairProgress {
  return { scrap: 0, cloth: 0, tape: 0 };
}

/** Starts the repair over. */
export function resetRepair(repair: RepairProgress): void {
  for (const material of REPAIR_MATERIALS) {
    repair[material] = 0;
  }
}

/** How many of a material the door still wants. */
export function missing(repair: RepairProgress, material: RepairMaterial): number {
  return Math.max(REPAIR_NEEDS[material] - repair[material], 0);
}

/**
 * Moves materials out of a bag into the repair: of each, as many as are still missing and
 * no more. What is left over stays in the bag. Returns what went in.
 */
export function deliverMaterials(repair: RepairProgress, bag: Inventory): ItemStack[] {
  const delivered: ItemStack[] = [];
  for (const material of REPAIR_MATERIALS) {
    const count = removeItems(bag, material, Math.min(missing(repair, material), countOf(bag, material)));
    if (count > 0) {
      repair[material] += count;
      delivered.push({ item: material, count });
    }
  }
  return delivered;
}

export function isRepairDone(repair: RepairProgress): boolean {
  return REPAIR_MATERIALS.every((material) => missing(repair, material) === 0);
}

/** One material of the repair as the screen shows it. */
export interface RepairRow {
  item: ItemId;
  /** How many are in, of how many needed. */
  have: number;
  need: number;
  /** How many of those went in just now. */
  added: number;
}

/** The repair material by material, with what `delivered` has just added marked out. */
export function repairRows(repair: RepairProgress, delivered: readonly ItemStack[] = []): RepairRow[] {
  return REPAIR_MATERIALS.map((material) => ({
    item: material,
    have: repair[material],
    need: REPAIR_NEEDS[material],
    added: delivered.find((stack) => stack.item === material)?.count ?? 0,
  }));
}
