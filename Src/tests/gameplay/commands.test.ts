import { describe, expect, it } from "vitest";
import { createWorld } from "../../src/core/ecs";
import { type Command, createCommandSystem } from "../../src/gameplay/commands";
import { addItems, countOf, createInventory, usedSlots } from "../../src/gameplay/inventory";

const setUp = () => {
  const world = createWorld();
  const player = world.add({ id: "player_1", inventory: createInventory() });
  return { world, player, commands: createCommandSystem(world) };
};
const give = (count: number, item: "scrap" | "cloth" = "scrap", actor = "player_1"): Command => ({ type: "giveItem", actor, item, count });

describe("the command system", () => {
  it("does nothing until it is run", () => {
    const { player, commands } = setUp();
    commands.push(give(2));
    expect(usedSlots(player.inventory)).toBe(0);
    expect(commands.run()).toHaveLength(1);
    expect(countOf(player.inventory, "scrap")).toBe(2);
  });

  it("carries commands out once, in the order they came", () => {
    const { player, commands } = setUp();
    commands.push(give(1, "cloth"));
    commands.push(give(1, "scrap"));
    commands.push({ type: "discardItem", actor: "player_1", slot: 0, count: 1 });
    const results = commands.run();
    expect(results.map((result) => result.ok)).toEqual([true, true, true]);
    expect(player.inventory.slots.slice(0, 2)).toEqual([null, { item: "scrap", count: 1 }]);
    expect(commands.run()).toEqual([]);
  });

  it("gives each player their own bag", () => {
    const { world, player, commands } = setUp();
    const other = world.add({ id: "player_2", inventory: createInventory() });
    commands.push(give(3, "scrap", "player_2"));
    commands.run();
    expect(countOf(other.inventory, "scrap")).toBe(3);
    expect(usedSlots(player.inventory)).toBe(0);
  });
});

describe("giveItem", () => {
  it("says how many went in when only some fit", () => {
    const { player, commands } = setUp();
    addItems(player.inventory, "scrap", 39);
    commands.push(give(4));
    expect(commands.run()[0]).toMatchObject({ ok: true, moved: 1 });
    expect(countOf(player.inventory, "scrap")).toBe(40);
  });

  it("is refused when the bag has no room, and the bag stays as it was", () => {
    const { player, commands } = setUp();
    addItems(player.inventory, "scrap", 40);
    const before = JSON.stringify(player.inventory);
    commands.push(give(1, "cloth"));
    expect(commands.run()[0]).toMatchObject({ ok: false, moved: 0, reason: "bag_full" });
    expect(JSON.stringify(player.inventory)).toBe(before);
  });

  it("is refused for an item that does not exist", () => {
    const { player, commands } = setUp();
    commands.push({ type: "giveItem", actor: "player_1", item: "gold", count: 1 } as unknown as Command);
    expect(commands.run()[0]).toMatchObject({ ok: false, reason: "unknown_item" });
    expect(usedSlots(player.inventory)).toBe(0);
  });
});

describe("discardItem", () => {
  it("throws out as many as asked from the slot", () => {
    const { player, commands } = setUp();
    addItems(player.inventory, "scrap", 4);
    commands.push({ type: "discardItem", actor: "player_1", slot: 0, count: 3 });
    expect(commands.run()[0]).toMatchObject({ ok: true, moved: 3 });
    expect(countOf(player.inventory, "scrap")).toBe(1);
  });

  it("is refused for an empty slot", () => {
    const { commands } = setUp();
    commands.push({ type: "discardItem", actor: "player_1", slot: 3, count: 1 });
    expect(commands.run()[0]).toMatchObject({ ok: false, moved: 0, reason: "empty_slot" });
  });

  it("is refused twice over when the same thing is thrown out twice", () => {
    const { player, commands } = setUp();
    addItems(player.inventory, "scrap", 1);
    const once: Command = { type: "discardItem", actor: "player_1", slot: 0, count: 1 };
    commands.push(once);
    commands.push(once);
    expect(commands.run().map((result) => result.ok)).toEqual([true, false]);
    expect(usedSlots(player.inventory)).toBe(0);
  });
});

describe("commands from nobody", () => {
  it("are refused for an actor that does not exist", () => {
    const { commands } = setUp();
    commands.push(give(1, "scrap", "ghost"));
    expect(commands.run()[0]).toMatchObject({ ok: false, reason: "unknown_actor" });
  });

  it("are refused for an actor without a bag", () => {
    const { world, commands } = setUp();
    world.add({ id: "crate" });
    commands.push(give(1, "scrap", "crate"));
    expect(commands.run()[0]).toMatchObject({ ok: false, reason: "no_bag" });
  });
});
