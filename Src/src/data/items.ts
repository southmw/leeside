import { BANDAGE_HEALTH, CONSUMABLE_STACK, MATERIAL_STACK, WATER_BOTTLE_THIRST } from "./tuning";

/**
 * The things that can be carried (prototype design 4.1). Everything about an item is said
 * here once; the bag, the screen and, later, containers refer to items by id.
 */

export const ITEM_IDS = ["scrap", "cloth", "tape", "water_bottle", "bandage"] as const;
export type ItemId = (typeof ITEM_IDS)[number];

export interface ItemDefinition {
  id: ItemId;
  /** Text keys of its name, of a name short enough for a bag slot, and of what it is for. */
  nameKey: string;
  shortNameKey: string;
  descriptionKey: string;
  /** Name of its icon (ui/icons.ts). */
  icon: string;
  /** How many fit in one slot of the bag. */
  stack: number;
  /** Repair materials go into the shelter's door; consumables are used up by the player. */
  category: "material" | "consumable";
  /** What using one gives back, for a consumable. */
  use?: { restores: "thirst" | "health"; amount: number };
}

export const ITEMS = {
  scrap: { id: "scrap", nameKey: "item.scrap.name", shortNameKey: "item.scrap.short", descriptionKey: "item.scrap.description", icon: "scrap", stack: MATERIAL_STACK, category: "material" },
  cloth: { id: "cloth", nameKey: "item.cloth.name", shortNameKey: "item.cloth.short", descriptionKey: "item.cloth.description", icon: "cloth", stack: MATERIAL_STACK, category: "material" },
  tape: { id: "tape", nameKey: "item.tape.name", shortNameKey: "item.tape.short", descriptionKey: "item.tape.description", icon: "tape", stack: MATERIAL_STACK, category: "material" },
  water_bottle: {
    id: "water_bottle",
    nameKey: "item.water_bottle.name",
    shortNameKey: "item.water_bottle.short",
    descriptionKey: "item.water_bottle.description",
    icon: "water-bottle",
    stack: CONSUMABLE_STACK,
    category: "consumable",
    use: { restores: "thirst", amount: WATER_BOTTLE_THIRST },
  },
  bandage: {
    id: "bandage",
    nameKey: "item.bandage.name",
    shortNameKey: "item.bandage.short",
    descriptionKey: "item.bandage.description",
    icon: "bandage",
    stack: CONSUMABLE_STACK,
    category: "consumable",
    use: { restores: "health", amount: BANDAGE_HEALTH },
  },
} as const satisfies Record<ItemId, ItemDefinition>;

export function isItemId(value: unknown): value is ItemId {
  return typeof value === "string" && (ITEM_IDS as readonly string[]).includes(value);
}
