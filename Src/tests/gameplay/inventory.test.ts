import { describe, expect, it } from "vitest";
import { ITEM_IDS, ITEMS, isItemId } from "../../src/data/items";
import { BAG_SLOTS, CONSUMABLE_STACK, MATERIAL_STACK } from "../../src/data/tuning";
import {
  addItems,
  countOf,
  createInventory,
  emptyInventory,
  type Inventory,
  isFull,
  parseBag,
  removeFromSlot,
  removeItems,
  roomFor,
  usedSlots,
} from "../../src/gameplay/inventory";

/** The bag written the way the HUD shows it: "scrap 5", or "-" for an empty slot. */
const layout = (bag: Inventory): string[] => bag.slots.map((slot) => (slot ? `${slot.item} ${slot.count}` : "-"));
const total = (bag: Inventory): number => bag.slots.reduce((sum, slot) => sum + (slot?.count ?? 0), 0);

describe("the items", () => {
  it("are the prototype's five, with the stack limits of the design", () => {
    expect(ITEM_IDS).toEqual(["scrap", "cloth", "tape", "water_bottle", "bandage"]);
    expect(ITEMS.scrap.stack).toBe(5);
    expect(ITEMS.cloth.stack).toBe(5);
    expect(ITEMS.tape.stack).toBe(5);
    expect(ITEMS.water_bottle.stack).toBe(3);
    expect(ITEMS.bandage.stack).toBe(3);
  });

  it("say what using them gives back: only water and bandages can be used", () => {
    expect(ITEMS.water_bottle.use).toEqual({ restores: "thirst", amount: 40 });
    expect(ITEMS.bandage.use).toEqual({ restores: "health", amount: 30 });
    for (const id of ["scrap", "cloth", "tape"] as const) {
      expect(ITEMS[id].category).toBe("material");
      expect("use" in ITEMS[id]).toBe(false);
    }
  });

  it("are told from other words", () => {
    expect(isItemId("scrap")).toBe(true);
    expect(isItemId("gold")).toBe(false);
    expect(isItemId(3)).toBe(false);
  });
});

describe("createInventory", () => {
  it("is eight empty slots", () => {
    const bag = createInventory();
    expect(bag.slots).toHaveLength(BAG_SLOTS);
    expect(BAG_SLOTS).toBe(8);
    expect(usedSlots(bag)).toBe(0);
    expect(isFull(bag)).toBe(false);
  });
});

describe("addItems", () => {
  it("puts a thing into the first empty slot", () => {
    const bag = createInventory();
    expect(addItems(bag, "scrap", 1)).toBe(1);
    expect(layout(bag).slice(0, 2)).toEqual(["scrap 1", "-"]);
  });

  it("stacks the same thing in one slot up to its limit, then starts another", () => {
    const bag = createInventory();
    expect(addItems(bag, "scrap", MATERIAL_STACK + 2)).toBe(MATERIAL_STACK + 2);
    expect(layout(bag).slice(0, 3)).toEqual(["scrap 5", "scrap 2", "-"]);
    expect(addItems(bag, "water_bottle", CONSUMABLE_STACK + 1)).toBe(CONSUMABLE_STACK + 1);
    expect(layout(bag).slice(0, 5)).toEqual(["scrap 5", "scrap 2", "water_bottle 3", "water_bottle 1", "-"]);
  });

  it("tops up a stack that is not full before using an empty slot", () => {
    const bag = createInventory();
    addItems(bag, "scrap", 3);
    addItems(bag, "cloth", 1);
    expect(addItems(bag, "scrap", 4)).toBe(4);
    expect(layout(bag).slice(0, 4)).toEqual(["scrap 5", "cloth 1", "scrap 2", "-"]);
  });

  it("uses a slot that was emptied in the middle", () => {
    const bag = createInventory();
    addItems(bag, "scrap", 1);
    addItems(bag, "cloth", 1);
    addItems(bag, "tape", 1);
    removeFromSlot(bag, 1);
    addItems(bag, "bandage", 1);
    expect(layout(bag).slice(0, 4)).toEqual(["scrap 1", "bandage 1", "tape 1", "-"]);
  });

  it("refuses when there is no room at all", () => {
    const bag = createInventory(2);
    addItems(bag, "scrap", 10);
    expect(isFull(bag)).toBe(true);
    expect(addItems(bag, "cloth", 1)).toBe(0);
    expect(addItems(bag, "scrap", 1)).toBe(0);
    expect(layout(bag)).toEqual(["scrap 5", "scrap 5"]);
  });

  it("takes only what fits and says how much that was", () => {
    const bag = createInventory(2);
    addItems(bag, "cloth", 5);
    addItems(bag, "scrap", 3);
    // No slot is empty, but two more scrap fit on the stack.
    expect(isFull(bag)).toBe(true);
    expect(roomFor(bag, "scrap")).toBe(2);
    expect(roomFor(bag, "tape")).toBe(0);
    expect(addItems(bag, "scrap", 4)).toBe(2);
    expect(layout(bag)).toEqual(["cloth 5", "scrap 5"]);
  });

  it("adds nothing for a count that is not a whole number above zero", () => {
    const bag = createInventory();
    expect(addItems(bag, "scrap", 0)).toBe(0);
    expect(addItems(bag, "scrap", -3)).toBe(0);
    expect(addItems(bag, "scrap", Number.NaN)).toBe(0);
    expect(usedSlots(bag)).toBe(0);
    // A fraction is rounded down: there is no half a bandage.
    expect(addItems(bag, "bandage", 2.9)).toBe(2);
  });

  it("holds eight full stacks and not one thing more", () => {
    const bag = createInventory();
    expect(addItems(bag, "scrap", 100)).toBe(BAG_SLOTS * MATERIAL_STACK);
    expect(roomFor(bag, "scrap")).toBe(0);
  });
});

describe("removeItems", () => {
  it("takes from the last stack first and empties a slot that runs out", () => {
    const bag = createInventory();
    addItems(bag, "scrap", 7);
    expect(removeItems(bag, "scrap", 3)).toBe(3);
    expect(layout(bag).slice(0, 2)).toEqual(["scrap 4", "-"]);
  });

  it("gives only what is there", () => {
    const bag = createInventory();
    addItems(bag, "tape", 2);
    expect(removeItems(bag, "tape", 5)).toBe(2);
    expect(removeItems(bag, "tape", 1)).toBe(0);
    expect(removeItems(bag, "cloth", 1)).toBe(0);
    expect(usedSlots(bag)).toBe(0);
  });

  it("leaves other things alone", () => {
    const bag = createInventory();
    addItems(bag, "scrap", 2);
    addItems(bag, "cloth", 2);
    removeItems(bag, "scrap", 2);
    expect(layout(bag).slice(0, 2)).toEqual(["-", "cloth 2"]);
    expect(countOf(bag, "cloth")).toBe(2);
  });
});

describe("removeFromSlot", () => {
  it("takes one thing by default and says what it was", () => {
    const bag = createInventory();
    addItems(bag, "water_bottle", 2);
    expect(removeFromSlot(bag, 0)).toEqual({ item: "water_bottle", count: 1 });
    expect(layout(bag)[0]).toBe("water_bottle 1");
  });

  it("empties the slot with the last thing, and the other slots stay where they are", () => {
    const bag = createInventory();
    addItems(bag, "scrap", 1);
    addItems(bag, "cloth", 1);
    expect(removeFromSlot(bag, 0)).toEqual({ item: "scrap", count: 1 });
    expect(layout(bag).slice(0, 2)).toEqual(["-", "cloth 1"]);
  });

  it("takes no more than the slot holds", () => {
    const bag = createInventory();
    addItems(bag, "scrap", 3);
    expect(removeFromSlot(bag, 0, 10)).toEqual({ item: "scrap", count: 3 });
    expect(usedSlots(bag)).toBe(0);
  });

  it("gives nothing from an empty slot or one that is not there", () => {
    const bag = createInventory();
    addItems(bag, "scrap", 1);
    expect(removeFromSlot(bag, 1)).toBeNull();
    expect(removeFromSlot(bag, -1)).toBeNull();
    expect(removeFromSlot(bag, 99)).toBeNull();
    expect(removeFromSlot(bag, 0.5)).toBeNull();
    expect(removeFromSlot(bag, 0, 0)).toBeNull();
    expect(total(bag)).toBe(1);
  });
});

describe("the bag as a whole", () => {
  it("never makes or loses a thing over a long run of putting in and taking out", () => {
    const bag = createInventory();
    let owned = 0;
    // A fixed, arbitrary sequence: no randomness in tests.
    for (let step = 0; step < 400; step += 1) {
      const item = ITEM_IDS[(step * 7) % ITEM_IDS.length] ?? "scrap";
      const amount = (step * 5) % 9;
      if (step % 3 === 0) {
        owned -= removeItems(bag, item, amount);
      } else if (step % 11 === 0) {
        owned -= removeFromSlot(bag, step % BAG_SLOTS, amount)?.count ?? 0;
      } else {
        owned += addItems(bag, item, amount);
      }
      expect(total(bag)).toBe(owned);
      for (const slot of bag.slots) {
        if (slot) {
          expect(slot.count).toBeGreaterThan(0);
          expect(slot.count).toBeLessThanOrEqual(ITEMS[slot.item].stack);
        }
      }
    }
  });

  it("can be emptied", () => {
    const bag = createInventory();
    addItems(bag, "scrap", 12);
    emptyInventory(bag);
    expect(usedSlots(bag)).toBe(0);
    expect(bag.slots).toHaveLength(BAG_SLOTS);
  });

  it("is plain data: it survives being written out and read back", () => {
    const bag = createInventory();
    addItems(bag, "scrap", 6);
    addItems(bag, "bandage", 1);
    expect(JSON.parse(JSON.stringify(bag))).toEqual(bag);
  });
});

describe("parseBag", () => {
  it("reads items and counts", () => {
    expect(parseBag("scrap:7,water_bottle:2")).toEqual([
      { item: "scrap", count: 7 },
      { item: "water_bottle", count: 2 },
    ]);
  });

  it("counts a name alone as one, and allows spaces", () => {
    expect(parseBag(" tape , bandage : 2 ")).toEqual([
      { item: "tape", count: 1 },
      { item: "bandage", count: 2 },
    ]);
  });

  it("leaves out what it cannot make sense of", () => {
    expect(parseBag("gold:3,scrap:x,cloth:0,tape:-1,bandage:1.5,,scrap:2")).toEqual([{ item: "scrap", count: 2 }]);
    expect(parseBag("")).toEqual([]);
    expect(parseBag(null)).toEqual([]);
  });
});
