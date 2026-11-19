import type { GameWorld } from "../core/ecs";
import { isItemId, type ItemId } from "../data/items";
import { INTERACT_DISTANCE } from "../data/tuning";
import { addItems, type Inventory, removeFromSlot } from "./inventory";

/**
 * Commands: the one way anything outside the simulation changes the world (technical design
 * 18). A command is plain data saying who wants what. It is put in the queue, and the queue
 * is worked through inside the fixed step, in order. In multiplayer the same data is what
 * goes over the network, and the host is the one who works through it.
 *
 * So far the commands are about the bag and the containers. Using an item (step 2.15) joins
 * them here.
 */

/**
 * A command about a container is carried out only for someone this close to it, in metres:
 * the interaction distance and a little more, for a step taken between asking and doing.
 */
export const CONTAINER_REACH = INTERACT_DISTANCE + 0.5;

export type Command =
  /** Puts items into the actor's bag out of nowhere. For development and tests. */
  | { type: "giveItem"; actor: string; item: ItemId; count: number }
  /** Throws things out of one slot of the actor's bag. They are gone (until step 2.15 lays them on the ground). */
  | { type: "discardItem"; actor: string; slot: number; count: number }
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
  | "nothing_there";

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

export function createCommandSystem(world: GameWorld): CommandSystem {
  const actors = world.with("id");
  const containers = world.with("container", "interactable", "transform");

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
    if (command.type === "discardItem") {
      const taken = removeFromSlot(bag, command.slot, command.count);
      return taken ? { command, ok: true, moved: taken.count } : refuse("empty_slot");
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
