import { describe, expect, it } from "vitest";
import { createTransform, createWorld } from "../../src/core/ecs";
import { createCommandSystem } from "../../src/gameplay/commands";
import { addItems, createInventory } from "../../src/gameplay/inventory";
import { createZoneState, putPiles, resetZoneState, takePiles } from "../../src/world/zoneState";
import { loadZones } from "../../src/world/zones";

const zones = loadZones();

describe("a zone's state", () => {
  it("starts with every container closed and empty and nothing on the ground", () => {
    const state = createZoneState(zones.dry_riverbed);
    expect(state.containers.size).toBe(14);
    expect([...state.containers.values()].every((container) => !container.opened && container.items.length === 0)).toBe(true);
    expect(state.piles).toEqual([]);
    expect(createZoneState(zones.shelter).containers.size).toBe(0);
  });

  it("is filled by seed, the same way for the same seed", () => {
    const one = createZoneState(zones.dry_riverbed);
    const other = createZoneState(zones.dry_riverbed);
    resetZoneState(one, zones.dry_riverbed, 7);
    resetZoneState(other, zones.dry_riverbed, 7);
    expect(JSON.stringify([...one.containers])).toBe(JSON.stringify([...other.containers]));
    expect([...one.containers.values()].some((container) => container.items.length > 0)).toBe(true);
  });

  it("resets a zone without containers without complaint", () => {
    const state = createZoneState(zones.shelter);
    state.piles = [{ id: "pile_1", x: 0, y: 0, z: 0, rotationY: 0, items: [{ item: "scrap", count: 1 }] }];
    expect(() => resetZoneState(state, zones.shelter, 7)).not.toThrow();
    expect(state.piles).toEqual([]);
  });

  it("keeps a container open while the zone is away, in the very object the zone's entity shares", () => {
    const state = createZoneState(zones.dry_riverbed);
    resetZoneState(state, zones.dry_riverbed, 7);
    const trunk = state.containers.get("car_line_second_trunk");
    if (!trunk) {
      throw new Error("no trunk");
    }
    trunk.opened = true;
    trunk.items.length = 0;
    // The zone is taken down and put up again: its state is asked for anew, and is as it was left.
    const again = state.containers.get("car_line_second_trunk");
    expect(again).toBe(trunk);
    expect(again).toMatchObject({ opened: true, items: [] });
  });

  it("is put back to the beginning by a reset: closed, filled, the ground clear", () => {
    const state = createZoneState(zones.dry_riverbed);
    resetZoneState(state, zones.dry_riverbed, 7);
    const before = JSON.stringify([...state.containers]);
    const trunk = [...state.containers.values()][0];
    if (trunk) {
      trunk.opened = true;
      trunk.items = [];
    }
    state.piles = [{ id: "pile_1", x: 0, y: 0, z: 0, rotationY: 0, items: [{ item: "scrap", count: 1 }] }];
    resetZoneState(state, zones.dry_riverbed, 7);
    expect(JSON.stringify([...state.containers])).toBe(before);
    expect(state.piles).toEqual([]);
    // The objects are the same ones as before: entities that share them see the reset.
    expect([...state.containers.values()][0]).toBe(trunk);
  });
});

describe("piles when the zone changes", () => {
  const worldWithPiles = () => {
    const world = createWorld();
    const player = world.add({ id: "player_1", inventory: createInventory(), transform: createTransform(5, 1, 7, 0.5) });
    addItems(player.inventory, "scrap", 3);
    addItems(player.inventory, "cloth", 1);
    const commands = createCommandSystem(world);
    commands.push({ type: "discardItem", actor: "player_1", slot: 0, count: 2 });
    commands.push({ type: "discardItem", actor: "player_1", slot: 1, count: 1 });
    commands.run();
    player.transform.x = 50;
    commands.push({ type: "discardItem", actor: "player_1", slot: 0, count: 1 });
    commands.run();
    return { world, player, commands, piles: world.with("pile", "interactable", "transform") };
  };

  it("are taken out of the world and written down", () => {
    const { world, piles } = worldWithPiles();
    const taken = takePiles(world);
    expect(piles.size).toBe(0);
    expect([...taken].sort((one, other) => one.id.localeCompare(other.id))).toEqual([
      { id: "pile_1", x: 5, y: 1, z: 7, rotationY: 0.5, items: [{ item: "scrap", count: 2 }, { item: "cloth", count: 1 }] },
      { id: "pile_2", x: 50, y: 1, z: 7, rotationY: 0.5, items: [{ item: "scrap", count: 1 }] },
    ]);
  });

  it("lie where they lay when they are put back, and can be picked up", () => {
    const { world, player, commands, piles } = worldWithPiles();
    const taken = takePiles(world);
    putPiles(world, taken);
    expect(piles.size).toBe(2);
    const near = [...piles].find((entity) => entity.interactable.id === "pile_1");
    expect(near?.transform).toEqual({ x: 5, y: 1, z: 7, rotationY: 0.5 });
    expect(near?.interactable.kind).toBe("pickup");
    player.transform.x = 5;
    commands.push({ type: "pickUp", actor: "player_1", pile: "pile_1" });
    expect(commands.run()[0]).toMatchObject({ ok: true, moved: 3 });
    expect(piles.size).toBe(1);
  });

  it("do not share their contents with the note taken of them", () => {
    const { world, piles } = worldWithPiles();
    const taken = takePiles(world);
    putPiles(world, taken);
    const first = taken[0];
    if (first?.items[0]) {
      first.items[0].count = 99;
    }
    expect([...piles].every((entity) => entity.pile.items.every((stack) => stack.count < 99))).toBe(true);
  });

  it("get new names after the ones there have been, also across a change of zone", () => {
    const { world, player, commands, piles } = worldWithPiles();
    const away = takePiles(world);
    addItems(player.inventory, "tape", 1);
    commands.push({ type: "discardItem", actor: "player_1", slot: 0, count: 1 });
    commands.run();
    expect([...piles].map((entity) => entity.interactable.id)).toEqual(["pile_3"]);
    expect(away).toHaveLength(2);
  });
});
