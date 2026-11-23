import { describe, expect, it } from "vitest";
import { REPAIR_NEEDS, REVEAL_COUNT } from "../../src/data/tuning";
import { addItems, createInventory } from "../../src/gameplay/inventory";
import { createRepair, deliverMaterials, isRepairDone } from "../../src/gameplay/repair";
import { revealAfterStorm, shortfall, stormJustPassed } from "../../src/gameplay/reveal";

const SPOTS = 12;
const nothingShort = { scrap: 0, cloth: 0, tape: 0 };

describe("shortfall", () => {
  it("is what the door needs, less what is in it and what is in the bag", () => {
    const repair = createRepair();
    repair.scrap = 5;
    const bag = createInventory();
    addItems(bag, "scrap", 4);
    addItems(bag, "tape", 5);
    expect(shortfall(repair, bag)).toEqual({ scrap: 6, cloth: 8, tape: 0 });
  });
});

describe("what a storm uncovers", () => {
  it("is four things at four different spots of the zone's", () => {
    for (let seed = 1; seed <= 50; seed += 1) {
      const reveals = revealAfterStorm(SPOTS, shortfall(createRepair(), createInventory()), seed);
      expect(reveals).toHaveLength(REVEAL_COUNT);
      expect(new Set(reveals.map((reveal) => reveal.spot)).size).toBe(REVEAL_COUNT);
      expect(reveals.every((reveal) => Number.isInteger(reveal.spot) && reveal.spot >= 0 && reveal.spot < SPOTS)).toBe(true);
    }
  });

  it("is the same for the same seed and differs between seeds", () => {
    const short = shortfall(createRepair(), createInventory());
    expect(revealAfterStorm(SPOTS, short, 7)).toEqual(revealAfterStorm(SPOTS, short, 7));
    const spots = new Set(Array.from({ length: 20 }, (_, seed) => revealAfterStorm(SPOTS, short, seed).map((reveal) => reveal.spot).join()));
    expect(spots.size).toBeGreaterThan(10);
  });

  it("is the material the repair is short of, when it is short of only one", () => {
    const reveals = revealAfterStorm(SPOTS, { scrap: 0, cloth: 0, tape: 3 }, 3);
    expect(reveals.slice(0, 3).map((reveal) => reveal.item)).toEqual(["tape", "tape", "tape"]);
    // The fourth is a free draw: the three were all that was short.
    expect(["scrap", "cloth", "tape"]).toContain(reveals[3]?.item);
  });

  it("mixes the materials when the repair is short of all of them", () => {
    const reveals = revealAfterStorm(SPOTS, { ...REPAIR_NEEDS }, 3);
    expect(reveals.map((reveal) => reveal.item)).toEqual(["scrap", "cloth", "tape", "scrap"]);
  });

  it("is drawn by weight when nothing is short: mostly scrap, some cloth, a little tape", () => {
    const counts = { scrap: 0, cloth: 0, tape: 0 } as Record<string, number>;
    for (let seed = 0; seed < 500; seed += 1) {
      for (const reveal of revealAfterStorm(SPOTS, nothingShort, seed)) {
        counts[reveal.item] = (counts[reveal.item] ?? 0) + 1;
      }
    }
    expect(counts.scrap).toBeGreaterThan(1000);
    expect(counts.cloth).toBeGreaterThan(350);
    expect(counts.tape).toBeGreaterThan(150);
    expect(counts.scrap).toBeGreaterThan((counts.cloth ?? 0) * 1.5);
    expect(counts.cloth).toBeGreaterThan(counts.tape ?? 0);
  });

  it("is fewer where there are fewer spots, and nothing where there are none", () => {
    expect(revealAfterStorm(2, nothingShort, 1)).toHaveLength(2);
    expect(revealAfterStorm(0, nothingShort, 1)).toEqual([]);
  });

  it("lets someone who has lost everything finish the repair by picking up after storm upon storm", () => {
    const repair = createRepair();
    let storms = 0;
    while (!isRepairDone(repair) && storms < 20) {
      storms += 1;
      const bag = createInventory();
      for (const reveal of revealAfterStorm(SPOTS, shortfall(repair, bag), 100 + storms)) {
        addItems(bag, reveal.item, 1);
      }
      deliverMaterials(repair, bag);
    }
    expect(isRepairDone(repair)).toBe(true);
    // 26 materials, four to a storm.
    expect(storms).toBe(7);
  });
});

describe("stormJustPassed", () => {
  it("is true in the step the weather stops being a storm", () => {
    expect(stormJustPassed("storm", "fading")).toBe(true);
    expect(stormJustPassed("storm", "clear")).toBe(true);
    expect(stormJustPassed("storm", "storm")).toBe(false);
    expect(stormJustPassed("warning", "storm")).toBe(false);
    expect(stormJustPassed("fading", "clear")).toBe(false);
    expect(stormJustPassed("clear", "warning")).toBe(false);
  });
});
