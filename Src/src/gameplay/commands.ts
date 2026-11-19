import type { GameWorld } from "../core/ecs";
import { isItemId, type ItemId } from "../data/items";
import { addItems, removeFromSlot } from "./inventory";

/**
 * Commands: the one way anything outside the simulation changes the world (technical design
 * 18). A command is plain data saying who wants what. It is put in the queue, and the queue
 * is worked through inside the fixed step, in order. In multiplayer the same data is what
 * goes over the network, and the host is the one who works through it.
 *
 * So far the commands are about the bag. Taking from a container (step 2.14) and using an
 * item (2.15) join them here.
 */

export type Command =
  /** Puts items into the actor's bag out of nowhere. For development and tests. */
  | { type: "giveItem"; actor: string; item: ItemId; count: number }
  /** Throws things out of one slot of the actor's bag. They are gone (until step 2.15 lays them on the ground). */
  | { type: "discardItem"; actor: string; slot: number; count: number };

export type CommandRefusal = "unknown_actor" | "no_bag" | "unknown_item" | "bag_full" | "empty_slot";

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
    const taken = removeFromSlot(bag, command.slot, command.count);
    return taken ? { command, ok: true, moved: taken.count } : refuse("empty_slot");
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
