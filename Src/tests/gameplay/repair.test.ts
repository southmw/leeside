import { describe, expect, it } from "vitest";
import { REPAIR_NEEDS } from "../../src/data/tuning";
import { addItems, countOf, createInventory, usedSlots } from "../../src/gameplay/inventory";
import { createRepair, deliverMaterials, isRepairDone, missing, REPAIR_MATERIALS, repairRows, resetRepair } from "../../src/gameplay/repair";

describe("the door's repair", () => {
  it("needs 15 scrap, 8 cloth and 3 tape, and starts with none", () => {
    expect(REPAIR_MATERIALS).toEqual(["scrap", "cloth", "tape"]);
    expect(REPAIR_NEEDS).toEqual({ scrap: 15, cloth: 8, tape: 3 });
    const repair = createRepair();
    expect(repair).toEqual({ scrap: 0, cloth: 0, tape: 0 });
    expect(isRepairDone(repair)).toBe(false);
    expect(missing(repair, "cloth")).toBe(8);
  });
});

describe("delivering materials", () => {
  it("takes the materials out of the bag and leaves everything else", () => {
    const repair = createRepair();
    const bag = createInventory();
    addItems(bag, "scrap", 6);
    addItems(bag, "water_bottle", 2);
    addItems(bag, "cloth", 2);
    addItems(bag, "bandage", 1);
    expect(deliverMaterials(repair, bag)).toEqual([
      { item: "scrap", count: 6 },
      { item: "cloth", count: 2 },
    ]);
    expect(repair).toEqual({ scrap: 6, cloth: 2, tape: 0 });
    expect(countOf(bag, "scrap") + countOf(bag, "cloth")).toBe(0);
    expect(countOf(bag, "water_bottle")).toBe(2);
    expect(countOf(bag, "bandage")).toBe(1);
  });

  it("takes only as many as are still missing; the rest stays in the bag", () => {
    const repair = createRepair();
    repair.tape = 2;
    repair.scrap = 15;
    const bag = createInventory();
    addItems(bag, "tape", 4);
    addItems(bag, "scrap", 3);
    expect(deliverMaterials(repair, bag)).toEqual([{ item: "tape", count: 1 }]);
    expect(repair).toMatchObject({ tape: 3, scrap: 15 });
    expect(countOf(bag, "tape")).toBe(3);
    expect(countOf(bag, "scrap")).toBe(3);
  });

  it("neither makes nor loses a thing", () => {
    const repair = createRepair();
    const bag = createInventory();
    addItems(bag, "scrap", 20);
    addItems(bag, "cloth", 9);
    const before = 29;
    deliverMaterials(repair, bag);
    const carried = bag.slots.reduce((sum, slot) => sum + (slot?.count ?? 0), 0);
    expect(carried + repair.scrap + repair.cloth + repair.tape).toBe(before);
  });

  it("gives nothing from a bag without materials, and nothing twice", () => {
    const repair = createRepair();
    const bag = createInventory();
    addItems(bag, "water_bottle", 1);
    expect(deliverMaterials(repair, bag)).toEqual([]);
    addItems(bag, "cloth", 1);
    deliverMaterials(repair, bag);
    expect(deliverMaterials(repair, bag)).toEqual([]);
    expect(repair.cloth).toBe(1);
    expect(usedSlots(bag)).toBe(1);
  });
});

describe("the repair's progress", () => {
  it("is shown material by material, with what has just gone in", () => {
    const repair = createRepair();
    repair.scrap = 6;
    const bag = createInventory();
    addItems(bag, "scrap", 6);
    addItems(bag, "tape", 1);
    const delivered = deliverMaterials(repair, bag);
    expect(repairRows(repair, delivered)).toEqual([
      { item: "scrap", have: 12, need: 15, added: 6 },
      { item: "cloth", have: 0, need: 8, added: 0 },
      { item: "tape", have: 1, need: 3, added: 1 },
    ]);
    expect(repairRows(repair).every((row) => row.added === 0)).toBe(true);
  });

  it("is done when every material has reached what is needed, and not before", () => {
    const repair = createRepair();
    const bag = createInventory();
    addItems(bag, "scrap", 15);
    addItems(bag, "cloth", 8);
    addItems(bag, "tape", 2);
    deliverMaterials(repair, bag);
    expect(isRepairDone(repair)).toBe(false);
    addItems(bag, "tape", 1);
    deliverMaterials(repair, bag);
    expect(isRepairDone(repair)).toBe(true);
    expect(repairRows(repair).every((row) => row.have === row.need)).toBe(true);
  });

  it("takes nothing more once it is done", () => {
    const repair = createRepair();
    Object.assign(repair, REPAIR_NEEDS);
    const bag = createInventory();
    addItems(bag, "scrap", 2);
    expect(deliverMaterials(repair, bag)).toEqual([]);
    expect(countOf(bag, "scrap")).toBe(2);
  });

  it("can be started over", () => {
    const repair = createRepair();
    Object.assign(repair, REPAIR_NEEDS);
    resetRepair(repair);
    expect(repair).toEqual(createRepair());
  });
});
