import { describe, expect, it } from "vitest";
import { BANDAGE_HEALTH, MAX_THIRST, WATER_BOTTLE_THIRST } from "../../src/data/tuning";
import { createHealth, heal } from "../../src/gameplay/health";
import { addItems, countOf, createInventory } from "../../src/gameplay/inventory";
import { useItem, useRefusal } from "../../src/gameplay/itemUse";
import { createThirst } from "../../src/gameplay/thirst";

const user = (health = 50, thirst = 50) => {
  const inventory = createInventory();
  addItems(inventory, "water_bottle", 2);
  addItems(inventory, "bandage", 1);
  addItems(inventory, "scrap", 3);
  return { inventory, health: createHealth(health), thirst: createThirst(thirst) };
};

describe("heal", () => {
  it("gives health back, up to the most there can be", () => {
    const health = createHealth(40);
    heal(health, 30);
    expect(health.current).toBe(70);
    heal(health, 50);
    expect(health.current).toBe(health.max);
    heal(health, -10);
    expect(health.current).toBe(health.max);
  });
});

describe("using an item", () => {
  it("drinks a water bottle: one fewer, thirst restored", () => {
    const who = user();
    expect(useItem(who, "water_bottle")).toBeNull();
    expect(countOf(who.inventory, "water_bottle")).toBe(1);
    expect(who.thirst.value).toBe(50 + WATER_BOTTLE_THIRST);
    expect(who.health.current).toBe(50);
  });

  it("applies a bandage: one fewer, health restored", () => {
    const who = user();
    expect(useItem(who, "bandage")).toBeNull();
    expect(countOf(who.inventory, "bandage")).toBe(0);
    expect(who.health.current).toBe(50 + BANDAGE_HEALTH);
    expect(who.thirst.value).toBe(50);
  });

  it("does not restore beyond the full figure", () => {
    const who = user(90, 80);
    useItem(who, "water_bottle");
    useItem(who, "bandage");
    expect(who.thirst.value).toBe(MAX_THIRST);
    expect(who.health.current).toBe(who.health.max);
  });

  it("takes from the last stack of the item", () => {
    const who = user();
    addItems(who.inventory, "water_bottle", 2);
    // Two stacks now: three in the first, one after the scrap.
    expect(who.inventory.slots.map((slot) => slot?.count ?? 0).slice(0, 4)).toEqual([3, 1, 3, 1]);
    useItem(who, "water_bottle");
    expect(who.inventory.slots[0]).toEqual({ item: "water_bottle", count: 3 });
    expect(who.inventory.slots[3]).toBeNull();
  });

  it("refuses an item there is none of, and changes nothing", () => {
    const who = user();
    useItem(who, "bandage");
    const before = JSON.stringify(who);
    expect(useItem(who, "bandage")).toBe("none_left");
    expect(JSON.stringify(who)).toBe(before);
  });

  it("refuses when there is nothing to restore, and the item is not used up", () => {
    const who = user(100, 100);
    expect(useItem(who, "water_bottle")).toBe("nothing_to_restore");
    expect(useItem(who, "bandage")).toBe("nothing_to_restore");
    expect(countOf(who.inventory, "water_bottle")).toBe(2);
    expect(countOf(who.inventory, "bandage")).toBe(1);
  });

  it("refuses repair materials", () => {
    const who = user();
    expect(useItem(who, "scrap")).toBe("not_usable");
    expect(countOf(who.inventory, "scrap")).toBe(3);
  });

  it("refuses someone who has collapsed", () => {
    const who = user(0, 10);
    expect(useItem(who, "bandage")).toBe("collapsed");
    expect(useItem(who, "water_bottle")).toBe("collapsed");
    expect(who.health.current).toBe(0);
  });

  it("says beforehand what it would do, without doing it", () => {
    const who = user(100, 50);
    expect(useRefusal(who, "water_bottle")).toBeNull();
    expect(useRefusal(who, "bandage")).toBe("nothing_to_restore");
    expect(useRefusal(who, "tape")).toBe("not_usable");
    expect(countOf(who.inventory, "water_bottle")).toBe(2);
    expect(who.thirst.value).toBe(50);
  });
});
