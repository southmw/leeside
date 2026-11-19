import type { ContainerKind } from "../core/ecs";
import { createRandom, type Random } from "../core/random";
import { ITEM_IDS, type ItemId } from "../data/items";
import { GUARANTEED_PER_CONTAINER, REPAIR_NEEDS } from "../data/tuning";
import type { ItemStack } from "./inventory";

/**
 * What is in the containers (prototype design 4.2), decided once when a game starts.
 *
 * First everything the repair needs is dealt out among the containers, so that it is always
 * there to be found and only where differs from game to game. Then each container draws a
 * little more. A container whose contents the zone fixes (the trunk of the introduction)
 * takes no part in either, but what it holds counts towards the need.
 */

type Material = keyof typeof REPAIR_NEEDS;
const MATERIALS = Object.keys(REPAIR_NEEDS) as Material[];

/** The kinds of container each material turns up in: cloth indoors, scrap in cars and out of doors. */
export const MATERIAL_HOMES: Readonly<Record<Material, readonly ContainerKind[]>> = {
  scrap: ["trunk", "crate"],
  cloth: ["cabinet", "crate"],
  tape: ["trunk", "cabinet"],
};

/** The extra draw of each kind of container: how likely it is to draw at all, and what from (weights). */
export const EXTRA_DRAWS: Readonly<Record<ContainerKind, { chance: number; weights: Partial<Record<ItemId, number>> }>> = {
  trunk: { chance: 1, weights: { scrap: 30, tape: 10, water_bottle: 40, bandage: 20 } },
  cabinet: { chance: 1, weights: { cloth: 25, tape: 10, water_bottle: 40, bandage: 25 } },
  crate: { chance: 0.5, weights: { scrap: 40, cloth: 30, water_bottle: 30 } },
};
/** One draw gives this many, each as likely as the other. */
const EXTRA_AMOUNTS = [1, 2] as const;

export interface LootContainer {
  id: string;
  kind: ContainerKind;
  /** Contents fixed by the zone. Such a container gets nothing dealt or drawn. */
  contents?: readonly ItemStack[] | undefined;
}

type Counts = Partial<Record<ItemId, number>>;

const add = (counts: Counts, item: ItemId, amount: number): void => {
  counts[item] = (counts[item] ?? 0) + amount;
};

/**
 * Deals out what the repair needs. Returns, for each container that is not fixed, how many of
 * each material it was dealt. Throws if the containers cannot hold it all, which is a mistake
 * in the zone and not something to play on with.
 */
export function dealGuaranteed(containers: readonly LootContainer[], random: Random): Map<string, Counts> {
  const dealt = new Map<string, Counts>();
  const open = containers.filter((container) => !container.contents);
  for (const container of open) {
    dealt.set(container.id, {});
  }
  for (const material of MATERIALS) {
    const fixed = containers.reduce(
      (sum, container) => sum + (container.contents?.reduce((inner, stack) => inner + (stack.item === material ? stack.count : 0), 0) ?? 0),
      0,
    );
    const homes = open.filter((container) => MATERIAL_HOMES[material].includes(container.kind));
    for (let left = REPAIR_NEEDS[material] - fixed; left > 0; left -= 1) {
      const withRoom = homes.filter((container) => (dealt.get(container.id)?.[material] ?? 0) < GUARANTEED_PER_CONTAINER);
      const chosen = withRoom[random.int(0, withRoom.length - 1)];
      const counts = chosen && dealt.get(chosen.id);
      if (!counts) {
        throw new Error(`The containers cannot hold the ${REPAIR_NEEDS[material]} ${material} the repair needs`);
      }
      add(counts, material, 1);
    }
  }
  return dealt;
}

/** One extra draw for a container of `kind`: nothing, or one or two of something. */
export function drawExtra(kind: ContainerKind, random: Random): ItemStack | null {
  const { chance, weights } = EXTRA_DRAWS[kind];
  // The roll is made even when the draw is certain, so every container uses the same number of rolls.
  if (random.next() >= chance) {
    return null;
  }
  const entries = ITEM_IDS.flatMap((item) => (weights[item] ? [{ item, weight: weights[item] }] : []));
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = random.next() * total;
  let picked = entries[entries.length - 1];
  for (const entry of entries) {
    roll -= entry.weight;
    if (roll < 0) {
      picked = entry;
      break;
    }
  }
  const count = EXTRA_AMOUNTS[random.int(0, EXTRA_AMOUNTS.length - 1)] ?? 1;
  return picked ? { item: picked.item, count } : null;
}

/**
 * The contents of every container for the game with this seed, by container id. The same
 * seed gives the same contents. Within a container a thing is listed once, in the items' own
 * order; there is no stack limit in a container (the bag splits things up as they go in).
 */
export function fillContainers(containers: readonly LootContainer[], seed: number): Map<string, ItemStack[]> {
  const random = createRandom(seed);
  const dealt = dealGuaranteed(containers, random);
  const filled = new Map<string, ItemStack[]>();
  for (const container of containers) {
    const counts: Counts = {};
    if (container.contents) {
      for (const stack of container.contents) {
        add(counts, stack.item, stack.count);
      }
    } else {
      for (const [item, count] of Object.entries(dealt.get(container.id) ?? {}) as Array<[ItemId, number]>) {
        add(counts, item, count);
      }
      const extra = drawExtra(container.kind, random);
      if (extra) {
        add(counts, extra.item, extra.count);
      }
    }
    filled.set(
      container.id,
      ITEM_IDS.flatMap((item) => (counts[item] ? [{ item, count: counts[item] }] : [])),
    );
  }
  return filled;
}
