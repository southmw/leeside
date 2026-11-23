import { describe, expect, it } from "vitest";
import { createWorld } from "../../src/core/ecs";
import { ITEM_IDS, isQuickSlotItem } from "../../src/data/items";
import { QUICK_SLOTS } from "../../src/data/tuning";
import type { Command } from "../../src/gameplay/commands";
import { assignQuickSlot, clearQuickSlots, createQuickSlots, createQuickUseSystem, quickSlotOf } from "../../src/gameplay/quickSlots";
import { createEmptyActions } from "../../src/input/actions";

describe("quick slots", () => {
  it("start with nothing on any of the four", () => {
    const quick = createQuickSlots();
    expect(QUICK_SLOTS).toBe(4);
    expect(quick.slots).toEqual([null, null, null, null]);
  });

  it("take only things that can be used", () => {
    expect(ITEM_IDS.filter(isQuickSlotItem)).toEqual(["water_bottle", "bandage"]);
    const quick = createQuickSlots();
    expect(assignQuickSlot(quick, 0, "scrap")).toBeNull();
    expect(assignQuickSlot(quick, 1, "cloth")).toBeNull();
    expect(assignQuickSlot(quick, 2, "tape")).toBeNull();
    expect(quick.slots).toEqual([null, null, null, null]);
  });

  it("put an item on a slot, and take it off when the same number is pressed again", () => {
    const quick = createQuickSlots();
    expect(assignQuickSlot(quick, 1, "water_bottle")).toBe("assigned");
    expect(quick.slots).toEqual([null, "water_bottle", null, null]);
    expect(quickSlotOf(quick, "water_bottle")).toBe(1);
    expect(assignQuickSlot(quick, 1, "water_bottle")).toBe("cleared");
    expect(quick.slots).toEqual([null, null, null, null]);
    expect(quickSlotOf(quick, "water_bottle")).toBe(-1);
  });

  it("move an item to another slot, so that it is never on two", () => {
    const quick = createQuickSlots();
    assignQuickSlot(quick, 0, "water_bottle");
    expect(assignQuickSlot(quick, 3, "water_bottle")).toBe("swapped");
    expect(quick.slots).toEqual([null, null, null, "water_bottle"]);
  });

  it("swap two slots when the item goes where another one is", () => {
    const quick = createQuickSlots();
    assignQuickSlot(quick, 0, "water_bottle");
    assignQuickSlot(quick, 1, "bandage");
    expect(assignQuickSlot(quick, 0, "bandage")).toBe("swapped");
    expect(quick.slots).toEqual(["bandage", "water_bottle", null, null]);
  });

  it("replace what is on a slot with an item that was on none", () => {
    const quick = createQuickSlots();
    assignQuickSlot(quick, 0, "water_bottle");
    expect(assignQuickSlot(quick, 0, "bandage")).toBe("assigned");
    expect(quick.slots).toEqual(["bandage", null, null, null]);
  });

  it("know no slots but their own", () => {
    const quick = createQuickSlots();
    for (const index of [-1, 4, 1.5, Number.NaN]) {
      expect(assignQuickSlot(quick, index, "bandage")).toBeNull();
    }
    expect(quick.slots).toEqual([null, null, null, null]);
  });

  it("can all be cleared", () => {
    const quick = createQuickSlots();
    assignQuickSlot(quick, 2, "bandage");
    clearQuickSlots(quick);
    expect(quick.slots).toEqual([null, null, null, null]);
  });
});

describe("the quick use system", () => {
  const setUp = () => {
    const world = createWorld();
    const player = world.add({ id: "player_1", quickSlots: createQuickSlots(), input: createEmptyActions() });
    const pushed: Command[] = [];
    return { player, pushed, step: createQuickUseSystem(world, (command) => pushed.push(command)) };
  };

  it("asks for a slot to be used once per press, however long the key is held", () => {
    const { player, pushed, step } = setUp();
    step();
    expect(pushed).toEqual([]);
    player.input.quick2 = true;
    step();
    step();
    step();
    expect(pushed).toEqual([{ type: "useQuickSlot", actor: "player_1", slot: 1 }]);
    player.input.quick2 = false;
    step();
    player.input.quick2 = true;
    step();
    expect(pushed).toHaveLength(2);
  });

  it("tells the keys apart", () => {
    const { player, pushed, step } = setUp();
    player.input.quick1 = true;
    player.input.quick4 = true;
    step();
    expect(pushed.map((command) => (command.type === "useQuickSlot" ? command.slot : -1))).toEqual([0, 3]);
  });
});
