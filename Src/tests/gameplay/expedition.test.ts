import { describe, expect, it } from "vitest";
import { RETURN_HEALTH } from "../../src/data/tuning";
import { advanceClock, createClock, readClock, startNextDay } from "../../src/gameplay/clock";
import { broughtBack, countItems, restAtShelter } from "../../src/gameplay/expedition";
import { createHealth } from "../../src/gameplay/health";
import { addItems, createInventory, removeItems } from "../../src/gameplay/inventory";

describe("countItems", () => {
  it("counts every item over all its stacks, and the ones there are none of as zero", () => {
    const bag = createInventory();
    addItems(bag, "scrap", 7);
    addItems(bag, "water_bottle", 1);
    expect(countItems(bag)).toEqual({ scrap: 7, cloth: 0, tape: 0, water_bottle: 1, bandage: 0 });
  });
});

describe("what an outing brought back", () => {
  const outing = () => {
    const bag = createInventory();
    addItems(bag, "scrap", 2);
    addItems(bag, "water_bottle", 2);
    return { bag, before: countItems(bag) };
  };

  it("is what the bag holds more of than in the morning, in the items' own order", () => {
    const { bag, before } = outing();
    addItems(bag, "tape", 1);
    addItems(bag, "scrap", 4);
    addItems(bag, "cloth", 2);
    expect(broughtBack(before, countItems(bag))).toEqual([
      { item: "scrap", count: 4 },
      { item: "cloth", count: 2 },
      { item: "tape", count: 1 },
    ]);
  });

  it("leaves out what there is less of: water drunk on the way", () => {
    const { bag, before } = outing();
    removeItems(bag, "water_bottle", 2);
    addItems(bag, "bandage", 1);
    expect(broughtBack(before, countItems(bag))).toEqual([{ item: "bandage", count: 1 }]);
  });

  it("counts a thing found and used up again as nothing, and one thrown out and replaced by its net", () => {
    const { bag, before } = outing();
    addItems(bag, "water_bottle", 1);
    removeItems(bag, "water_bottle", 1);
    removeItems(bag, "scrap", 2);
    addItems(bag, "scrap", 3);
    expect(broughtBack(before, countItems(bag))).toEqual([{ item: "scrap", count: 1 }]);
  });

  it("is nothing when the bag is as it was", () => {
    const { bag, before } = outing();
    expect(broughtBack(before, countItems(bag))).toEqual([]);
  });
});

describe("the rest at the shelter", () => {
  it("gives 50 health back", () => {
    const health = createHealth(30);
    expect(RETURN_HEALTH).toBe(50);
    expect(restAtShelter(health)).toBe(50);
    expect(health.current).toBe(80);
  });

  it("stops at full health, and says how much it really gave", () => {
    const health = createHealth(80);
    expect(restAtShelter(health)).toBe(20);
    expect(health.current).toBe(100);
    expect(restAtShelter(health)).toBe(0);
    expect(health.current).toBe(100);
  });
});

describe("moving on to the next day", () => {
  it("is 06:00 of the day after, whatever the hour of the return", () => {
    for (const seconds of [10, 200, 470]) {
      const clock = createClock();
      advanceClock(clock, seconds);
      expect(readClock(clock).day).toBe(1);
      startNextDay(clock);
      expect(readClock(clock)).toMatchObject({ day: 2, hour: 6 });
    }
  });

  it("counts on from a later day", () => {
    const clock = createClock();
    startNextDay(clock);
    advanceClock(clock, 100);
    startNextDay(clock);
    expect(readClock(clock).day).toBe(3);
  });
});
