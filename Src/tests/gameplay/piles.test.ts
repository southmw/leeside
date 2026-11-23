import { describe, expect, it } from "vitest";
import { addItems, countOf, createInventory } from "../../src/gameplay/inventory";
import { addToPile, createPile, nearestWithin, pileTotal, takeFromPile } from "../../src/gameplay/piles";

describe("a pile", () => {
  it("keeps one entry per kind of thing, without a stack limit", () => {
    const pile = createPile();
    addToPile(pile, "scrap", 4);
    addToPile(pile, "cloth", 1);
    addToPile(pile, "scrap", 9);
    addToPile(pile, "tape", 0);
    expect(pile.items).toEqual([
      { item: "scrap", count: 13 },
      { item: "cloth", count: 1 },
    ]);
    expect(pileTotal(pile)).toBe(14);
  });

  it("goes into a bag whole when there is room", () => {
    const pile = createPile();
    addToPile(pile, "scrap", 7);
    addToPile(pile, "water_bottle", 1);
    const bag = createInventory();
    expect(takeFromPile(pile, bag)).toBe(8);
    expect(pile.items).toEqual([]);
    expect(countOf(bag, "scrap")).toBe(7);
    expect(countOf(bag, "water_bottle")).toBe(1);
  });

  it("keeps what does not fit, and loses nothing", () => {
    const pile = createPile();
    addToPile(pile, "cloth", 3);
    addToPile(pile, "scrap", 4);
    const bag = createInventory();
    // Seven full stacks of scrap and one of four: room for one more scrap and no cloth.
    addItems(bag, "scrap", 39);
    expect(takeFromPile(pile, bag)).toBe(1);
    expect(pile.items).toEqual([
      { item: "cloth", count: 3 },
      { item: "scrap", count: 3 },
    ]);
    expect(countOf(bag, "scrap") + pileTotal(pile)).toBe(39 + 7);
    expect(takeFromPile(pile, bag)).toBe(0);
  });
});

describe("nearestWithin", () => {
  const places = [
    { id: "far", x: 3, y: 0, z: 0 },
    { id: "near", x: 0.5, y: 0, z: 0 },
    { id: "nearer", x: 0, y: 0, z: 0.2 },
    { id: "upstairs", x: 0, y: 3, z: 0 },
  ];

  it("picks the nearest place in reach, on the same level", () => {
    expect(nearestWithin(places, { x: 0, y: 0, z: 0 }, 1)?.id).toBe("nearer");
    expect(nearestWithin(places, { x: 0.6, y: 0, z: 0 }, 1)?.id).toBe("near");
  });

  it("finds nothing out of reach", () => {
    expect(nearestWithin(places, { x: 10, y: 0, z: 0 }, 1)).toBeUndefined();
    expect(nearestWithin([], { x: 0, y: 0, z: 0 }, 1)).toBeUndefined();
  });
});
