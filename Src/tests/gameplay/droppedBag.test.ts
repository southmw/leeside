import { describe, expect, it } from "vitest";
import { createTransform, createWorld } from "../../src/core/ecs";
import { createCommandSystem } from "../../src/gameplay/commands";
import { emptyBagIntoStacks } from "../../src/gameplay/droppedBag";
import { addItems, countOf, createInventory, usedSlots } from "../../src/gameplay/inventory";
import { createRepair, deliverMaterials } from "../../src/gameplay/repair";
import { createZoneState, forgetDroppedBag, putPiles, removeDroppedBag, takePiles } from "../../src/world/zoneState";
import { loadZones } from "../../src/world/zones";

describe("emptying the bag on dying", () => {
  it("takes everything out, one entry per kind of thing", () => {
    const bag = createInventory();
    addItems(bag, "scrap", 7);
    addItems(bag, "water_bottle", 2);
    addItems(bag, "scrap", 1);
    expect(emptyBagIntoStacks(bag)).toEqual([
      { item: "scrap", count: 8 },
      { item: "water_bottle", count: 2 },
    ]);
    expect(usedSlots(bag)).toBe(0);
  });

  it("gives nothing for an empty bag", () => {
    expect(emptyBagIntoStacks(createInventory())).toEqual([]);
  });
});

describe("the bag a death leaves behind", () => {
  const died = () => {
    const world = createWorld();
    const player = world.add({ id: "player_1", inventory: createInventory(), transform: createTransform(40, 0, 40) });
    addItems(player.inventory, "scrap", 6);
    addItems(player.inventory, "bandage", 1);
    const commands = createCommandSystem(world);
    const drop = (id: string): void => {
      removeDroppedBag(world);
      const items = emptyBagIntoStacks(player.inventory);
      if (items.length > 0) {
        putPiles(world, [{ id, x: player.transform.x, y: 0, z: player.transform.z, rotationY: 0, items, dropped: true }]);
      }
    };
    const piles = world.with("pile", "interactable", "transform");
    return { world, player, commands, drop, piles };
  };

  it("lies where the character fell, with everything that was carried, and the bag is empty", () => {
    const { player, drop, piles } = died();
    drop("dropped_bag_1");
    const [bag] = [...piles];
    expect(piles.size).toBe(1);
    expect(bag?.pile).toEqual({ items: [{ item: "scrap", count: 6 }, { item: "bandage", count: 1 }], dropped: true });
    expect(bag?.transform).toMatchObject({ x: 40, z: 40 });
    expect(usedSlots(player.inventory)).toBe(0);
  });

  it("gives everything back to whoever picks it up, and is gone", () => {
    const { player, commands, drop, piles } = died();
    drop("dropped_bag_1");
    commands.push({ type: "pickUp", actor: "player_1", pile: "dropped_bag_1" });
    expect(commands.run()[0]).toMatchObject({ ok: true, moved: 7 });
    expect(countOf(player.inventory, "scrap")).toBe(6);
    expect(countOf(player.inventory, "bandage")).toBe(1);
    expect(piles.size).toBe(0);
  });

  it("is replaced by the bag of the next death: the earlier one is lost", () => {
    const { player, drop, piles } = died();
    drop("dropped_bag_1");
    player.transform.x = 90;
    addItems(player.inventory, "tape", 2);
    drop("dropped_bag_2");
    expect([...piles].map((entity) => entity.interactable.id)).toEqual(["dropped_bag_2"]);
    expect([...piles][0]?.pile.items).toEqual([{ item: "tape", count: 2 }]);
  });

  it("is lost too when the next death has nothing to leave", () => {
    const { drop, piles } = died();
    drop("dropped_bag_1");
    drop("dropped_bag_2");
    expect(piles.size).toBe(0);
  });

  it("is not joined by things thrown out beside it, and other piles are left alone", () => {
    const { player, commands, drop, piles } = died();
    addItems(player.inventory, "cloth", 1);
    // Six scrap take two slots and the bandage the third: the cloth is in the fourth.
    commands.push({ type: "discardItem", actor: "player_1", slot: 3, count: 1 });
    commands.run();
    drop("dropped_bag_1");
    addItems(player.inventory, "tape", 1);
    commands.push({ type: "discardItem", actor: "player_1", slot: 0, count: 1 });
    commands.run();
    const byId = Object.fromEntries([...piles].map((entity) => [entity.interactable.id, entity.pile.items.map((stack) => `${stack.item} ${stack.count}`).join()]));
    expect(byId).toEqual({ pile_1: "cloth 1,tape 1", dropped_bag_1: "scrap 6,bandage 1" });
  });

  it("is still the dropped bag after its zone has been away, and can be struck from a zone's state", () => {
    const { world, drop, piles } = died();
    drop("dropped_bag_1");
    const state = createZoneState(loadZones().dry_riverbed);
    state.piles = takePiles(world);
    expect(state.piles[0]).toMatchObject({ id: "dropped_bag_1", dropped: true });
    putPiles(world, state.piles);
    expect([...piles][0]?.pile.dropped).toBe(true);
    expect(forgetDroppedBag(state)).toBe(true);
    expect(state.piles).toEqual([]);
    expect(forgetDroppedBag(state)).toBe(false);
  });

  it("does not touch what has gone into the repair", () => {
    const { player, drop } = died();
    const repair = createRepair();
    deliverMaterials(repair, player.inventory);
    drop("dropped_bag_1");
    expect(repair.scrap).toBe(6);
  });
});
