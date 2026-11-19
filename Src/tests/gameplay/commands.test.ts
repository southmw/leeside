import { describe, expect, it } from "vitest";
import { type Container, createTransform, createWorld } from "../../src/core/ecs";
import { type Command, CONTAINER_REACH, createCommandSystem } from "../../src/gameplay/commands";
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

describe("commands about a container", () => {
  const withCrate = (items: Container["items"] = [{ item: "scrap", count: 4 }, { item: "water_bottle", count: 2 }]) => {
    const world = createWorld();
    const player = world.add({ id: "player_1", inventory: createInventory(), transform: createTransform(0, 0, 0) });
    const state: Container = { kind: "crate", opened: false, items };
    world.add({ transform: createTransform(0, 0, -1), interactable: { id: "crate", kind: "search" }, container: state });
    const commands = createCommandSystem(world);
    const run = (command: Command) => {
      commands.push(command);
      const [result] = commands.run();
      if (!result) {
        throw new Error("no result");
      }
      return result;
    };
    const open = (): void => {
      run({ type: "openContainer", actor: "player_1", container: "crate" });
    };
    const owned = (): number =>
      state.items.reduce((sum, stack) => sum + stack.count, 0) + player.inventory.slots.reduce((sum, slot) => sum + (slot?.count ?? 0), 0);
    return { player, state, run, open, owned };
  };
  const takeFirst: Command = { type: "takeItem", actor: "player_1", container: "crate", index: 0 };
  const takeAll: Command = { type: "takeAll", actor: "player_1", container: "crate" };

  it("opens a container for someone standing at it", () => {
    const { state, run } = withCrate();
    expect(run({ type: "openContainer", actor: "player_1", container: "crate" })).toMatchObject({ ok: true });
    expect(state.opened).toBe(true);
  });

  it("does not open one that does not exist or is out of reach", () => {
    const { player, state, run } = withCrate();
    expect(run({ type: "openContainer", actor: "player_1", container: "nothing" })).toMatchObject({ ok: false, reason: "unknown_container" });
    player.transform.z = CONTAINER_REACH;
    expect(run({ type: "openContainer", actor: "player_1", container: "crate" })).toMatchObject({ ok: false, reason: "out_of_reach" });
    expect(state.opened).toBe(false);
  });

  it("takes nothing from a container that has not been opened", () => {
    const { state, run, owned } = withCrate();
    expect(run(takeFirst)).toMatchObject({ ok: false, reason: "not_open" });
    expect(run(takeAll)).toMatchObject({ ok: false, reason: "not_open" });
    expect(state.items).toHaveLength(2);
    expect(owned()).toBe(6);
  });

  it("takes one entry whole into the bag", () => {
    const { player, state, run, open } = withCrate();
    open();
    expect(run(takeFirst)).toMatchObject({ ok: true, moved: 4 });
    expect(countOf(player.inventory, "scrap")).toBe(4);
    expect(state.items).toEqual([{ item: "water_bottle", count: 2 }]);
  });

  it("takes everything, and nothing is left to take again", () => {
    const { player, state, run, open, owned } = withCrate();
    open();
    expect(run(takeAll)).toMatchObject({ ok: true, moved: 6 });
    expect(state.items).toEqual([]);
    expect(usedSlots(player.inventory)).toBe(2);
    expect(run(takeAll)).toMatchObject({ ok: false, reason: "nothing_there" });
    expect(run(takeFirst)).toMatchObject({ ok: false, reason: "nothing_there" });
    expect(owned()).toBe(6);
  });

  it("splits a big entry over as many slots as it needs", () => {
    const { player, run, open } = withCrate([{ item: "scrap", count: 12 }]);
    open();
    expect(run(takeFirst)).toMatchObject({ ok: true, moved: 12 });
    expect(usedSlots(player.inventory)).toBe(3);
  });

  it("takes only what fits and leaves the rest in the container", () => {
    const { player, state, run, open, owned } = withCrate();
    addItems(player.inventory, "cloth", 35);
    addItems(player.inventory, "scrap", 3);
    open();
    const before = owned();
    // Two more scrap fit on the stack; there is no slot for the water.
    expect(run(takeAll)).toMatchObject({ ok: true, moved: 2 });
    expect(state.items).toEqual([
      { item: "scrap", count: 2 },
      { item: "water_bottle", count: 2 },
    ]);
    expect(owned()).toBe(before);
    expect(run(takeAll)).toMatchObject({ ok: false, moved: 0, reason: "bag_full" });
    expect(owned()).toBe(before);
  });

  it("when not all fits, takes from the top of the list first", () => {
    const { player, state, run, open } = withCrate([
      { item: "water_bottle", count: 3 },
      { item: "bandage", count: 3 },
    ]);
    addItems(player.inventory, "cloth", 35);
    open();
    run(takeAll);
    expect(countOf(player.inventory, "water_bottle")).toBe(3);
    expect(state.items).toEqual([{ item: "bandage", count: 3 }]);
  });

  it("is refused for an entry that is not there, and for someone who has walked away", () => {
    const { player, run, open, owned } = withCrate();
    open();
    expect(run({ ...takeFirst, index: 5 } as Command)).toMatchObject({ ok: false, reason: "nothing_there" });
    player.transform.x = 10;
    expect(run(takeFirst)).toMatchObject({ ok: false, reason: "out_of_reach" });
    expect(run(takeAll)).toMatchObject({ ok: false, reason: "out_of_reach" });
    expect(owned()).toBe(6);
  });

  it("gives a thing to one taker only when two ask for it in the same step", () => {
    const world = createWorld();
    const one = world.add({ id: "player_1", inventory: createInventory(), transform: createTransform(0, 0, 0) });
    const two = world.add({ id: "player_2", inventory: createInventory(), transform: createTransform(1, 0, 0) });
    world.add({
      transform: createTransform(0, 0, -1),
      interactable: { id: "crate", kind: "search" },
      container: { kind: "crate", opened: true, items: [{ item: "tape", count: 1 }] },
    });
    const commands = createCommandSystem(world);
    commands.push({ type: "takeAll", actor: "player_1", container: "crate" });
    commands.push({ type: "takeAll", actor: "player_2", container: "crate" });
    expect(commands.run().map((result) => result.ok)).toEqual([true, false]);
    expect(countOf(one.inventory, "tape") + countOf(two.inventory, "tape")).toBe(1);
  });
});
