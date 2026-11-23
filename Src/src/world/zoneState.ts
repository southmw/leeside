import { type Container, createTransform, type GameWorld } from "../core/ecs";
import type { ItemStack } from "../gameplay/inventory";
import { fillContainers } from "../gameplay/loot";
import type { ZoneDefinition } from "./zoneDefinition";

/**
 * What has happened in a zone and stays that way while the player is elsewhere (technical
 * design 9.4): which containers are open and what is left in them, and what lies on the
 * ground. Each zone has a state of its own; the zone in the world is built from its state.
 */

/** A pile on the ground, written down while its zone is not in the world. */
export interface PileState {
  id: string;
  x: number;
  y: number;
  z: number;
  rotationY: number;
  items: ItemStack[];
  /** Whether it is the bag a death left behind. */
  dropped?: boolean;
}

export interface ZoneState {
  /** By container id. The objects stay the same for the whole game: the zone's entities share them. */
  containers: Map<string, Container>;
  /** Piles of a zone that is not in the world. Those of the zone that is are entities. */
  piles: PileState[];
}

/** The state of a zone nobody has been to: every container closed and empty, nothing on the ground. */
export function createZoneState(zone: ZoneDefinition): ZoneState {
  return {
    containers: new Map(zone.containers.map((container) => [container.id, { kind: container.kind, opened: false, items: [] }])),
    piles: [],
  };
}

/** Puts a zone back to how a game begins: containers closed and filled by `seed`, nothing on the ground. */
export function resetZoneState(state: ZoneState, zone: ZoneDefinition, seed: number): void {
  state.piles = [];
  // A zone without containers has nothing to fill (and could not hold what filling guarantees).
  if (zone.containers.length === 0) {
    return;
  }
  const filled = fillContainers(zone.containers, seed);
  for (const [id, container] of state.containers) {
    container.opened = false;
    container.items = filled.get(id) ?? [];
  }
}

/** Takes every pile out of the world and returns them written down, for leaving a zone. */
export function takePiles(world: GameWorld): PileState[] {
  const taken: PileState[] = [];
  for (const entity of [...world.with("pile", "interactable", "transform")]) {
    const { x, y, z, rotationY } = entity.transform;
    taken.push({
      id: entity.interactable.id,
      x,
      y,
      z,
      rotationY,
      items: entity.pile.items.map((stack) => ({ ...stack })),
      ...(entity.pile.dropped ? { dropped: true } : {}),
    });
    world.remove(entity);
  }
  return taken;
}

/** Lays piles written down back into the world, for coming back to a zone. */
export function putPiles(world: GameWorld, piles: readonly PileState[]): void {
  for (const pile of piles) {
    world.add({
      transform: createTransform(pile.x, pile.y, pile.z, pile.rotationY),
      interactable: { id: pile.id, kind: "pickup" },
      pile: { items: pile.items.map((stack) => ({ ...stack })), ...(pile.dropped ? { dropped: true as const } : {}) },
    });
  }
}

/** Takes the bag a death left behind out of the world, if it is there. Returns whether one was. */
export function removeDroppedBag(world: GameWorld): boolean {
  let found = false;
  for (const entity of [...world.with("pile")]) {
    if (entity.pile.dropped) {
      world.remove(entity);
      found = true;
    }
  }
  return found;
}

/** Strikes the bag a death left behind from the piles written down for a zone. Returns whether one was there. */
export function forgetDroppedBag(state: ZoneState): boolean {
  const kept = state.piles.filter((pile) => !pile.dropped);
  const found = kept.length !== state.piles.length;
  state.piles = kept;
  return found;
}
