import { describe, expect, it } from "vitest";
import { type Container, createCharacter, createTransform, createWorld } from "../../src/core/ecs";
import { CHARACTER_HEIGHT, PILE_MERGE_DISTANCE } from "../../src/data/tuning";
import { createHealth } from "../../src/gameplay/health";
import { createQuickSlots } from "../../src/gameplay/quickSlots";
import { createThirst } from "../../src/gameplay/thirst";
import { type Command, CONTAINER_REACH, createCommandSystem } from "../../src/gameplay/commands";
import { addItems, countOf, createInventory, usedSlots } from "../../src/gameplay/inventory";

const setUp = () => {
  const world = createWorld();
  const player = world.add({ id: "player_1", inventory: createInventory(), transform: createTransform(0, 0, 0) });
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

describe("things thrown out", () => {
  const setUpPiles = () => {
    const world = createWorld();
    const player = world.add({
      id: "player_1",
      inventory: createInventory(),
      quickSlots: createQuickSlots(),
      health: createHealth(50),
      thirst: createThirst(50),
      transform: createTransform(10, 0, 10),
    });
    const commands = createCommandSystem(world);
    const run = (command: Command) => {
      commands.push(command);
      const [result] = commands.run();
      if (!result) {
        throw new Error("no result");
      }
      return result;
    };
    const piles = world.with("pile", "interactable", "transform");
    const lying = (): number => [...piles].reduce((sum, entity) => sum + entity.pile.items.reduce((all, stack) => all + stack.count, 0), 0);
    const carried = (): number => player.inventory.slots.reduce((sum, slot) => sum + (slot?.count ?? 0), 0);
    return { world, player, run, piles, lying, carried };
  };
  const discard = (slot = 0, count = 1): Command => ({ type: "discardItem", actor: "player_1", slot, count });

  it("lie in a pile at the feet of whoever threw them out", () => {
    const { player, run, piles } = setUpPiles();
    addItems(player.inventory, "scrap", 3);
    run(discard(0, 2));
    const [pile] = [...piles];
    expect(piles.size).toBe(1);
    expect(pile?.transform).toMatchObject({ x: 10, y: 0, z: 10 });
    expect(pile?.interactable).toMatchObject({ id: "pile_1", kind: "pickup" });
    expect(pile?.pile.items).toEqual([{ item: "scrap", count: 2 }]);
  });

  it("land at the feet of a character, whose position is its middle", () => {
    const { world, player, run, piles } = setUpPiles();
    world.addComponent(player, "character", createCharacter());
    player.transform.y = 5 + CHARACTER_HEIGHT / 2;
    addItems(player.inventory, "tape", 1);
    run(discard());
    expect([...piles][0]?.transform.y).toBeCloseTo(5);
  });

  it("land on the floor the game points out", () => {
    const world = createWorld();
    const player = world.add({ id: "player_1", inventory: createInventory(), transform: createTransform(0, 7, 0) });
    const commands = createCommandSystem(world, { floorUnder: () => 2 });
    addItems(player.inventory, "tape", 1);
    commands.push(discard());
    commands.run();
    expect([...world.with("pile", "transform")][0]?.transform.y).toBe(2);
  });

  it("join the pile that lies there already, and start a new one further off", () => {
    const { player, run, piles } = setUpPiles();
    addItems(player.inventory, "scrap", 2);
    addItems(player.inventory, "cloth", 2);
    run(discard(0));
    player.transform.x += PILE_MERGE_DISTANCE * 0.9;
    run(discard(0));
    run(discard(1));
    expect(piles.size).toBe(1);
    expect([...piles][0]?.pile.items).toEqual([
      { item: "scrap", count: 2 },
      { item: "cloth", count: 1 },
    ]);
    player.transform.x += PILE_MERGE_DISTANCE * 1.2;
    run(discard(1));
    expect(piles.size).toBe(2);
    expect([...piles].map((entity) => entity.interactable.id).sort()).toEqual(["pile_1", "pile_2"]);
  });

  it("are picked up again, and the pile is gone; nothing is made or lost", () => {
    const { player, run, piles, lying, carried } = setUpPiles();
    addItems(player.inventory, "scrap", 7);
    addItems(player.inventory, "water_bottle", 2);
    run(discard(0, 5));
    run(discard(2, 1));
    expect(carried()).toBe(3);
    expect(lying()).toBe(6);
    expect(run({ type: "pickUp", actor: "player_1", pile: "pile_1" })).toMatchObject({ ok: true, moved: 6 });
    expect(piles.size).toBe(0);
    expect(countOf(player.inventory, "scrap")).toBe(7);
    expect(countOf(player.inventory, "water_bottle")).toBe(2);
  });

  it("stay on the ground as far as the bag has no room for them", () => {
    const { player, run, piles, lying, carried } = setUpPiles();
    addItems(player.inventory, "cloth", 1);
    run(discard(0));
    addItems(player.inventory, "scrap", 40);
    expect(run({ type: "pickUp", actor: "player_1", pile: "pile_1" })).toMatchObject({ ok: false, moved: 0, reason: "bag_full" });
    expect(piles.size).toBe(1);
    expect(lying() + carried()).toBe(41);
  });

  it("are not picked up from out of reach, nor from a pile that is not there", () => {
    const { player, run, lying } = setUpPiles();
    addItems(player.inventory, "cloth", 1);
    run(discard(0));
    expect(run({ type: "pickUp", actor: "player_1", pile: "pile_9" })).toMatchObject({ ok: false, reason: "nothing_there" });
    player.transform.z += CONTAINER_REACH + 0.1;
    expect(run({ type: "pickUp", actor: "player_1", pile: "pile_1" })).toMatchObject({ ok: false, reason: "out_of_reach" });
    expect(lying()).toBe(1);
  });

  it("go to one taker only when two reach for the pile in the same step", () => {
    const { world, player, piles } = setUpPiles();
    const other = world.add({ id: "player_2", inventory: createInventory(), transform: createTransform(10.5, 0, 10) });
    addItems(player.inventory, "tape", 1);
    const commands = createCommandSystem(world);
    commands.push(discard());
    commands.run();
    const id = [...piles][0]?.interactable.id ?? "";
    commands.push({ type: "pickUp", actor: "player_2", pile: id });
    commands.push({ type: "pickUp", actor: "player_1", pile: id });
    expect(commands.run().map((result) => result.ok)).toEqual([true, false]);
    expect(countOf(player.inventory, "tape") + countOf(other.inventory, "tape")).toBe(1);
  });

  it("cannot be thrown out by someone who is nowhere; the bag stays as it was", () => {
    const world = createWorld();
    const player = world.add({ id: "player_1", inventory: createInventory() });
    const commands = createCommandSystem(world);
    addItems(player.inventory, "scrap", 1);
    commands.push(discard());
    expect(commands.run()[0]).toMatchObject({ ok: false, reason: "nowhere" });
    expect(countOf(player.inventory, "scrap")).toBe(1);
  });

  it("leave no pile when they are destroyed instead (development)", () => {
    const { player, run, piles } = setUpPiles();
    addItems(player.inventory, "scrap", 4);
    expect(run({ type: "destroyItem", actor: "player_1", slot: 0, count: 4 })).toMatchObject({ ok: true, moved: 4 });
    expect(piles.size).toBe(0);
    expect(usedSlots(player.inventory)).toBe(0);
  });
});

describe("using things and the quick slots", () => {
  const setUpUser = () => {
    const world = createWorld();
    const player = world.add({
      id: "player_1",
      inventory: createInventory(),
      quickSlots: createQuickSlots(),
      health: createHealth(50),
      thirst: createThirst(50),
      transform: createTransform(0, 0, 0),
    });
    addItems(player.inventory, "water_bottle", 2);
    addItems(player.inventory, "bandage", 1);
    addItems(player.inventory, "scrap", 2);
    const commands = createCommandSystem(world);
    const run = (command: Command) => {
      commands.push(command);
      const [result] = commands.run();
      if (!result) {
        throw new Error("no result");
      }
      return result;
    };
    return { world, player, run };
  };

  it("uses an item out of the bag", () => {
    const { player, run } = setUpUser();
    expect(run({ type: "useItem", actor: "player_1", item: "water_bottle" })).toMatchObject({ ok: true, moved: 1 });
    expect(countOf(player.inventory, "water_bottle")).toBe(1);
    expect(player.thirst.value).toBe(90);
  });

  it("says why an item was not used", () => {
    const { player, run } = setUpUser();
    expect(run({ type: "useItem", actor: "player_1", item: "scrap" })).toMatchObject({ ok: false, reason: "not_usable" });
    expect(run({ type: "useItem", actor: "player_1", item: "gold" } as unknown as Command)).toMatchObject({ ok: false, reason: "unknown_item" });
    player.health.current = player.health.max;
    expect(run({ type: "useItem", actor: "player_1", item: "bandage" })).toMatchObject({ ok: false, reason: "nothing_to_restore" });
    expect(countOf(player.inventory, "bandage")).toBe(1);
  });

  it("puts an item on a quick slot and uses it from there", () => {
    const { player, run } = setUpUser();
    expect(run({ type: "assignQuickSlot", actor: "player_1", slot: 1, item: "bandage" })).toMatchObject({ ok: true });
    expect(player.quickSlots.slots).toEqual([null, "bandage", null, null]);
    expect(run({ type: "useQuickSlot", actor: "player_1", slot: 1 })).toMatchObject({ ok: true, moved: 1 });
    expect(player.health.current).toBe(80);
    // Used up: the slot is free again, and the key does nothing.
    expect(player.quickSlots.slots).toEqual([null, null, null, null]);
    expect(run({ type: "useQuickSlot", actor: "player_1", slot: 1 })).toMatchObject({ ok: false, reason: "empty_quick_slot" });
  });

  it("keeps an item on its slot while any of it is left, however it is used", () => {
    const { player, run } = setUpUser();
    run({ type: "assignQuickSlot", actor: "player_1", slot: 0, item: "water_bottle" });
    run({ type: "useItem", actor: "player_1", item: "water_bottle" });
    expect(player.quickSlots.slots[0]).toBe("water_bottle");
    // The last one, used from the bag window: the slot is freed just the same.
    player.thirst.value = 10;
    run({ type: "useItem", actor: "player_1", item: "water_bottle" });
    expect(player.quickSlots.slots[0]).toBeNull();
  });

  it("frees the slot when the last of an item is thrown out, the same as when it is used", () => {
    const { player, run } = setUpUser();
    run({ type: "assignQuickSlot", actor: "player_1", slot: 2, item: "bandage" });
    run({ type: "assignQuickSlot", actor: "player_1", slot: 0, item: "water_bottle" });
    // One of two bottles thrown out: still on its slot.
    run({ type: "discardItem", actor: "player_1", slot: 0, count: 1 });
    expect(player.quickSlots.slots).toEqual(["water_bottle", null, "bandage", null]);
    run({ type: "discardItem", actor: "player_1", slot: 1, count: 1 });
    expect(countOf(player.inventory, "bandage")).toBe(0);
    expect(player.quickSlots.slots).toEqual(["water_bottle", null, null, null]);
    run({ type: "destroyItem", actor: "player_1", slot: 0, count: 1 });
    expect(player.quickSlots.slots).toEqual([null, null, null, null]);
    // Picked up again, it has to be put on a slot again.
    run({ type: "pickUp", actor: "player_1", pile: "pile_1" });
    expect(countOf(player.inventory, "bandage")).toBe(1);
    expect(player.quickSlots.slots).toEqual([null, null, null, null]);
  });

  it("does nothing for a slot with nothing on it, or one that does not exist", () => {
    const { player, run } = setUpUser();
    const before = JSON.stringify(player.inventory);
    expect(run({ type: "useQuickSlot", actor: "player_1", slot: 0 })).toMatchObject({ ok: false, reason: "empty_quick_slot" });
    expect(run({ type: "useQuickSlot", actor: "player_1", slot: 7 })).toMatchObject({ ok: false, reason: "empty_quick_slot" });
    expect(JSON.stringify(player.inventory)).toBe(before);
  });

  it("does not put repair materials on a quick slot", () => {
    const { player, run } = setUpUser();
    expect(run({ type: "assignQuickSlot", actor: "player_1", slot: 0, item: "scrap" })).toMatchObject({ ok: false, reason: "not_assignable" });
    expect(run({ type: "assignQuickSlot", actor: "player_1", slot: 9, item: "bandage" })).toMatchObject({ ok: false, reason: "not_assignable" });
    expect(player.quickSlots.slots).toEqual([null, null, null, null]);
  });

  it("is refused for someone without quick slots", () => {
    const { world, run } = setUpUser();
    world.add({ id: "player_2", inventory: createInventory() });
    expect(run({ type: "useQuickSlot", actor: "player_2", slot: 0 })).toMatchObject({ ok: false, reason: "no_quick_slots" });
    expect(run({ type: "assignQuickSlot", actor: "player_2", slot: 0, item: "bandage" })).toMatchObject({ ok: false, reason: "no_quick_slots" });
  });
});

describe("useExit", () => {
  const atExit = () => {
    const world = createWorld();
    const player = world.add({ id: "player_1", inventory: createInventory(), health: createHealth(50), transform: createTransform(0, 0, 0) });
    world.add({ transform: createTransform(1, 0, 0), interactable: { id: "to_shelter", kind: "travel" }, exit: { to: "shelter", entry: "from_riverbed" } });
    const commands = createCommandSystem(world);
    const run = (command: Command) => {
      commands.push(command);
      const [result] = commands.run();
      if (!result) {
        throw new Error("no result");
      }
      return result;
    };
    return { player, run };
  };
  const leave: Command = { type: "useExit", actor: "player_1", exit: "to_shelter" };

  it("is allowed for someone standing at the exit", () => {
    expect(atExit().run(leave)).toMatchObject({ ok: true });
  });

  it("is refused from out of reach, for an exit that is not there, and for someone who has collapsed", () => {
    const { player, run } = atExit();
    expect(run({ ...leave, exit: "to_the_moon" } as Command)).toMatchObject({ ok: false, reason: "nothing_there" });
    player.transform.x = -CONTAINER_REACH;
    expect(run(leave)).toMatchObject({ ok: false, reason: "out_of_reach" });
    player.transform.x = 0;
    player.health.current = 0;
    expect(run(leave)).toMatchObject({ ok: false, reason: "collapsed" });
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
