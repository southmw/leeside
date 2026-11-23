import { createTransform, type Entity, type GameWorld } from "../core/ecs";
import { isItemId, type ItemId } from "../data/items";
import { CHARACTER_HEIGHT, INTERACT_DISTANCE, PILE_MERGE_DISTANCE } from "../data/tuning";
import { addItems, countOf, type Inventory, removeFromSlot } from "./inventory";
import { useItem, type UseRefusal } from "./itemUse";
import { addToPile, createPile, nearestWithin, takeFromPile } from "./piles";
import { assignQuickSlot, releaseQuickSlot } from "./quickSlots";

/**
 * Commands: the one way anything outside the simulation changes the world (technical design
 * 18). A command is plain data saying who wants what. It is put in the queue, and the queue
 * is worked through inside the fixed step, in order. In multiplayer the same data is what
 * goes over the network, and the host is the one who works through it.
 *
 * The commands are about the bag, the containers, using things and the quick slots, and what
 * lies on the ground.
 */

/**
 * A command about a container is carried out only for someone this close to it, in metres:
 * the interaction distance and a little more, for a step taken between asking and doing.
 */
export const CONTAINER_REACH = INTERACT_DISTANCE + 0.5;

export type Command =
  /** Puts items into the actor's bag out of nowhere. For development and tests. */
  | { type: "giveItem"; actor: string; item: ItemId; count: number }
  /** Throws things out of one slot of the actor's bag. They land on a pile at the actor's feet. */
  | { type: "discardItem"; actor: string; slot: number; count: number }
  /** Takes things out of one slot of the actor's bag and out of the world. For development. */
  | { type: "destroyItem"; actor: string; slot: number; count: number }
  /** Uses one of an item out of the actor's bag. */
  | { type: "useItem"; actor: string; item: ItemId }
  /** Uses one of whatever is on a quick slot of the actor's. */
  | { type: "useQuickSlot"; actor: string; slot: number }
  /** The slot's number pressed with `item` chosen: puts it on the slot, takes it off, or swaps two slots. */
  | { type: "assignQuickSlot"; actor: string; slot: number; item: ItemId }
  /** Moves what lies on a pile into the actor's bag, as far as it fits. */
  | { type: "pickUp"; actor: string; pile: string }
  /** Leaves the zone through one of its exits. The command only says the actor may; the game changes the zone. */
  | { type: "useExit"; actor: string; exit: string }
  /** Opens a container (a search has been completed, or it was open already). */
  | { type: "openContainer"; actor: string; container: string }
  /** Moves one entry of an open container into the actor's bag, as far as it fits. */
  | { type: "takeItem"; actor: string; container: string; index: number }
  /** Moves everything in an open container into the actor's bag, as far as it fits. */
  | { type: "takeAll"; actor: string; container: string };

export type CommandRefusal =
  | "unknown_actor"
  | "no_bag"
  | "unknown_item"
  | "bag_full"
  | "empty_slot"
  | "unknown_container"
  | "out_of_reach"
  | "not_open"
  | "nothing_there"
  /** The actor is nowhere, so there is no ground to put anything on. */
  | "nowhere"
  | "no_quick_slots"
  /** No such quick slot, or nothing on it. */
  | "empty_quick_slot"
  /** Not an item for quick slots. */
  | "not_assignable"
  | UseRefusal;

export interface CommandResult {
  command: Command;
  /** False if nothing at all was done; `reason` then says why. */
  ok: boolean;
  /** How many things were moved. Fewer than asked if only some fitted or were there. */
  moved: number;
  reason?: CommandRefusal;
}

export interface CommandSystem {
  /** Queues a command for the next step. */
  push(command: Command): void;
  /** Carries out everything queued, in order, and returns what became of each. Call once per step. */
  run(): CommandResult[];
}

export interface CommandOptions {
  /**
   * The height of the ground or floor under an actor, where what they throw out comes to
   * lie. Without it that is the height of the actor's feet.
   */
  floorUnder?(actor: Entity): number | undefined;
}

export function createCommandSystem(world: GameWorld, options: CommandOptions = {}): CommandSystem {
  const actors = world.with("id");
  const containers = world.with("container", "interactable", "transform");
  const piles = world.with("pile", "interactable", "transform");
  const exits = world.with("exit", "interactable", "transform");
  // Piles are numbered as they are made, so the same commands always give the same names.
  let pilesMade = 0;

  /** Lays things at an actor's feet: on a pile that lies there already, or on a new one. */
  const drop = (actor: Entity, item: ItemId, count: number): void => {
    const at = actor.transform;
    if (!at) {
      return;
    }
    // A character's position is its capsule's centre.
    const floor = options.floorUnder?.(actor) ?? at.y - (actor.character ? CHARACTER_HEIGHT / 2 : 0);
    const spots = [];
    for (const entity of piles) {
      // The bag a death left behind stays what it is: nothing thrown out joins it.
      if (!entity.pile.dropped) {
        spots.push({ x: entity.transform.x, y: entity.transform.y, z: entity.transform.z, pile: entity.pile });
      }
    }
    let pile = nearestWithin(spots, { x: at.x, y: floor, z: at.z }, PILE_MERGE_DISTANCE)?.pile;
    if (!pile) {
      pile = createPile();
      pilesMade += 1;
      world.add({
        transform: createTransform(at.x, floor, at.z, at.rotationY),
        interactable: { id: `pile_${pilesMade}`, kind: "pickup" },
        pile,
      });
    }
    addToPile(pile, item, count);
  };

  /** Moves entry `index` of a container into a bag, as far as it fits. Returns how many went. */
  const take = (items: Array<{ item: ItemId; count: number }>, index: number, bag: Inventory): number => {
    const stack = items[index];
    if (!stack) {
      return 0;
    }
    const moved = addItems(bag, stack.item, stack.count);
    stack.count -= moved;
    if (stack.count === 0) {
      items.splice(index, 1);
    }
    return moved;
  };
  /**
   * A quick slot is for something the actor has. When the last of an item leaves the bag,
   * used or thrown out alike, its slot is free again.
   */
  const freeSlotIfGone = (actor: Entity, item: ItemId): void => {
    if (actor.quickSlots && actor.inventory && countOf(actor.inventory, item) === 0) {
      releaseQuickSlot(actor.quickSlots, item);
    }
  };
  let queue: Command[] = [];

  const carryOut = (command: Command): CommandResult => {
    const refuse = (reason: CommandRefusal): CommandResult => ({ command, ok: false, moved: 0, reason });
    let actor;
    for (const candidate of actors) {
      if (candidate.id === command.actor) {
        actor = candidate;
      }
    }
    if (!actor) {
      return refuse("unknown_actor");
    }
    const bag = actor.inventory;
    if (!bag) {
      return refuse("no_bag");
    }
    if (command.type === "giveItem") {
      // Commands may come from outside (later: the network), so nothing in them is trusted.
      if (!isItemId(command.item)) {
        return refuse("unknown_item");
      }
      const moved = addItems(bag, command.item, command.count);
      return moved > 0 ? { command, ok: true, moved } : refuse("bag_full");
    }
    if (command.type === "discardItem" || command.type === "destroyItem") {
      if (command.type === "discardItem" && !actor.transform) {
        return refuse("nowhere");
      }
      const taken = removeFromSlot(bag, command.slot, command.count);
      if (!taken) {
        return refuse("empty_slot");
      }
      if (command.type === "discardItem") {
        drop(actor, taken.item, taken.count);
      }
      freeSlotIfGone(actor, taken.item);
      return { command, ok: true, moved: taken.count };
    }
    if (command.type === "useItem" || command.type === "useQuickSlot") {
      let item: ItemId | null;
      if (command.type === "useItem") {
        item = isItemId(command.item) ? command.item : null;
        if (!item) {
          return refuse("unknown_item");
        }
      } else {
        if (!actor.quickSlots) {
          return refuse("no_quick_slots");
        }
        item = (Number.isInteger(command.slot) ? actor.quickSlots.slots[command.slot] : null) ?? null;
        if (!item) {
          return refuse("empty_quick_slot");
        }
      }
      const refusal = useItem({ inventory: bag, health: actor.health, thirst: actor.thirst }, item);
      if (refusal) {
        return refuse(refusal);
      }
      freeSlotIfGone(actor, item);
      return { command, ok: true, moved: 1 };
    }
    if (command.type === "assignQuickSlot") {
      if (!actor.quickSlots) {
        return refuse("no_quick_slots");
      }
      if (!isItemId(command.item)) {
        return refuse("unknown_item");
      }
      return assignQuickSlot(actor.quickSlots, command.slot, command.item) ? { command, ok: true, moved: 0 } : refuse("not_assignable");
    }
    if (command.type === "useExit") {
      let way;
      for (const candidate of exits) {
        if (candidate.interactable.id === command.exit) {
          way = candidate;
        }
      }
      if (!way) {
        return refuse("nothing_there");
      }
      if (actor.health && actor.health.current <= 0) {
        return refuse("collapsed");
      }
      const from = actor.transform;
      if (!from || Math.hypot(from.x - way.transform.x, from.z - way.transform.z) > CONTAINER_REACH) {
        return refuse("out_of_reach");
      }
      return { command, ok: true, moved: 0 };
    }
    if (command.type === "pickUp") {
      let lying;
      for (const candidate of piles) {
        if (candidate.interactable.id === command.pile) {
          lying = candidate;
        }
      }
      // Someone else may have picked it up in the meantime.
      if (!lying) {
        return refuse("nothing_there");
      }
      const from = actor.transform;
      if (!from || Math.hypot(from.x - lying.transform.x, from.z - lying.transform.z) > CONTAINER_REACH) {
        return refuse("out_of_reach");
      }
      const picked = takeFromPile(lying.pile, bag);
      if (lying.pile.items.length === 0) {
        world.remove(lying);
      }
      return picked > 0 ? { command, ok: true, moved: picked } : refuse("bag_full");
    }

    // The rest are about a container, which the actor has to be standing at.
    let target;
    for (const candidate of containers) {
      if (candidate.interactable.id === command.container) {
        target = candidate;
      }
    }
    if (!target) {
      return refuse("unknown_container");
    }
    const at = actor.transform;
    if (!at || Math.hypot(at.x - target.transform.x, at.z - target.transform.z) > CONTAINER_REACH) {
      return refuse("out_of_reach");
    }
    const { container } = target;
    if (command.type === "openContainer") {
      container.opened = true;
      return { command, ok: true, moved: 0 };
    }
    if (!container.opened) {
      return refuse("not_open");
    }
    if (container.items.length === 0 || (command.type === "takeItem" && !container.items[command.index])) {
      return refuse("nothing_there");
    }
    let moved = 0;
    if (command.type === "takeItem") {
      moved = take(container.items, command.index, bag);
    } else {
      // From the top down, so that what is listed first goes in first when not all fits.
      for (let index = 0; index < container.items.length; ) {
        const entries = container.items.length;
        moved += take(container.items, index, bag);
        // An entry taken whole is gone and the next has moved up into its place.
        index += container.items.length === entries ? 1 : 0;
      }
    }
    return moved > 0 ? { command, ok: true, moved } : refuse("bag_full");
  };

  return {
    push(command): void {
      queue.push(command);
    },
    run(): CommandResult[] {
      if (queue.length === 0) {
        return [];
      }
      // Commands queued while these are carried out wait for the next step.
      const now = queue;
      queue = [];
      return now.map(carryOut);
    },
  };
}
