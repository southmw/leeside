import { describe, expect, it } from "vitest";
import { createRandom } from "../../src/core/random";
import type { ItemId } from "../../src/data/items";
import { GUARANTEED_PER_CONTAINER, REPAIR_NEEDS } from "../../src/data/tuning";
import { dealGuaranteed, drawExtra, EXTRA_DRAWS, fillContainers, type LootContainer, MATERIAL_HOMES } from "../../src/gameplay/loot";
import { loadDryRiverbed } from "../../src/world/zones/dryRiverbed";

const zone = loadDryRiverbed();
const containers: readonly LootContainer[] = zone.containers;
const kindOf = (id: string): LootContainer["kind"] => containers.find((container) => container.id === id)?.kind ?? "crate";
const INTRO = "car_line_second_trunk";
const SEEDS = 1000;

const totalOf = (filled: Map<string, Array<{ item: ItemId; count: number }>>, item: ItemId): number =>
  [...filled.values()].reduce((sum, items) => sum + items.reduce((inner, stack) => inner + (stack.item === item ? stack.count : 0), 0), 0);

describe("dealGuaranteed", () => {
  it("deals out exactly what the repair needs, counting what the fixed trunk already holds", () => {
    for (let seed = 0; seed < SEEDS; seed += 1) {
      const dealt = dealGuaranteed(containers, createRandom(seed));
      const sum = (material: keyof typeof REPAIR_NEEDS): number => [...dealt.values()].reduce((total, counts) => total + (counts[material] ?? 0), 0);
      expect(sum("scrap")).toBe(REPAIR_NEEDS.scrap);
      // Two of the eight cloth are in the trunk of the introduction.
      expect(sum("cloth")).toBe(REPAIR_NEEDS.cloth - 2);
      expect(sum("tape")).toBe(REPAIR_NEEDS.tape);
    }
  });

  it("never deals more than three of a material to one container", () => {
    for (let seed = 0; seed < SEEDS; seed += 1) {
      for (const counts of dealGuaranteed(containers, createRandom(seed)).values()) {
        for (const count of Object.values(counts)) {
          expect(count).toBeLessThanOrEqual(GUARANTEED_PER_CONTAINER);
        }
      }
    }
  });

  it("deals each material only to the kinds of container it belongs in", () => {
    for (let seed = 0; seed < SEEDS; seed += 1) {
      for (const [id, counts] of dealGuaranteed(containers, createRandom(seed))) {
        for (const material of Object.keys(counts) as Array<keyof typeof REPAIR_NEEDS>) {
          expect(MATERIAL_HOMES[material], `${material} in ${id}`).toContain(kindOf(id));
        }
      }
    }
  });

  it("deals nothing to a container whose contents are fixed", () => {
    expect(dealGuaranteed(containers, createRandom(1)).has(INTRO)).toBe(false);
  });

  it("refuses a zone whose containers cannot hold what the repair needs", () => {
    const tooFew: LootContainer[] = [{ id: "only", kind: "crate" }];
    expect(() => dealGuaranteed(tooFew, createRandom(1))).toThrow(/cannot hold/);
  });
});

describe("drawExtra", () => {
  it("draws one or two of something the kind of container can hold", () => {
    const random = createRandom(7);
    for (const kind of ["trunk", "cabinet", "crate"] as const) {
      const seen = new Set<ItemId>();
      for (let draw = 0; draw < 2000; draw += 1) {
        const extra = drawExtra(kind, random);
        if (extra) {
          expect([1, 2]).toContain(extra.count);
          expect(Object.keys(EXTRA_DRAWS[kind].weights)).toContain(extra.item);
          seen.add(extra.item);
        }
      }
      // Everything the kind can hold turns up sooner or later.
      expect([...seen].sort()).toEqual(Object.keys(EXTRA_DRAWS[kind].weights).sort());
    }
  });

  it("always draws for trunks and cabinets, and about half the time for crates", () => {
    const random = createRandom(11);
    const drawn = (kind: "trunk" | "cabinet" | "crate"): number => Array.from({ length: 2000 }, () => drawExtra(kind, random)).filter(Boolean).length;
    expect(drawn("trunk")).toBe(2000);
    expect(drawn("cabinet")).toBe(2000);
    const crates = drawn("crate");
    expect(crates).toBeGreaterThan(900);
    expect(crates).toBeLessThan(1100);
  });

  it("follows the weights: a trunk gives water more often than tape", () => {
    const random = createRandom(3);
    const counts: Partial<Record<ItemId, number>> = {};
    for (let draw = 0; draw < 4000; draw += 1) {
      const extra = drawExtra("trunk", random);
      if (extra) {
        counts[extra.item] = (counts[extra.item] ?? 0) + 1;
      }
    }
    // Weights 40 and 10 of 100.
    expect(counts.water_bottle).toBeGreaterThan(1400);
    expect(counts.water_bottle).toBeLessThan(1800);
    expect(counts.tape).toBeGreaterThan(300);
    expect(counts.tape).toBeLessThan(500);
  });
});

describe("fillContainers", () => {
  it("holds at least what the repair needs, whatever the seed", () => {
    for (let seed = 0; seed < SEEDS; seed += 1) {
      const filled = fillContainers(containers, seed);
      expect(totalOf(filled, "scrap")).toBeGreaterThanOrEqual(REPAIR_NEEDS.scrap);
      expect(totalOf(filled, "cloth")).toBeGreaterThanOrEqual(REPAIR_NEEDS.cloth);
      expect(totalOf(filled, "tape")).toBeGreaterThanOrEqual(REPAIR_NEEDS.tape);
    }
  });

  it("gives every container an entry, each thing listed once with a count above zero", () => {
    for (let seed = 0; seed < 100; seed += 1) {
      const filled = fillContainers(containers, seed);
      expect([...filled.keys()].sort()).toEqual(containers.map((container) => container.id).sort());
      for (const items of filled.values()) {
        expect(new Set(items.map((stack) => stack.item)).size).toBe(items.length);
        expect(items.every((stack) => Number.isInteger(stack.count) && stack.count > 0)).toBe(true);
      }
    }
  });

  it("always puts a water bottle and two cloth in the trunk the introduction leads to", () => {
    for (let seed = 0; seed < 100; seed += 1) {
      expect(fillContainers(containers, seed).get(INTRO)).toEqual([
        { item: "cloth", count: 2 },
        { item: "water_bottle", count: 1 },
      ]);
    }
  });

  it("keeps each kind of thing to the containers it belongs in", () => {
    for (let seed = 0; seed < 200; seed += 1) {
      for (const [id, items] of fillContainers(containers, seed)) {
        if (id === INTRO) {
          continue;
        }
        const kind = kindOf(id);
        const allowed = new Set<string>([
          ...Object.keys(EXTRA_DRAWS[kind].weights),
          ...(Object.keys(MATERIAL_HOMES) as Array<keyof typeof MATERIAL_HOMES>).filter((material) => MATERIAL_HOMES[material].includes(kind)),
        ]);
        for (const stack of items) {
          expect(allowed.has(stack.item), `${stack.item} in ${id}`).toBe(true);
        }
      }
    }
  });

  it("gives the same contents for the same seed and other contents for another", () => {
    const write = (seed: number): string => JSON.stringify([...fillContainers(containers, seed)]);
    expect(write(5)).toBe(write(5));
    const different = new Set(Array.from({ length: 20 }, (_, seed) => write(seed)));
    expect(different.size).toBeGreaterThan(15);
  });

  it("has water and bandages to find in most games, though they are not promised", () => {
    let withWater = 0;
    for (let seed = 0; seed < SEEDS; seed += 1) {
      withWater += totalOf(fillContainers(containers, seed), "water_bottle") >= 2 ? 1 : 0;
    }
    expect(withWater).toBeGreaterThan(SEEDS * 0.95);
  });
});
