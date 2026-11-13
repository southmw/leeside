import { describe, expect, it } from "vitest";
import { createWorld } from "../../src/core/ecs";
import { createEmptyActions, type PlayerActions } from "../../src/input/actions";
import { createInputSystem } from "../../src/input/inputSystem";

function sourceOf(actions: Partial<PlayerActions>) {
  return { sample: (): PlayerActions => ({ ...createEmptyActions(), ...actions }) };
}

describe("createInputSystem", () => {
  it("writes sampled actions onto the local player", () => {
    const world = createWorld();
    const player = world.add({ localPlayer: true, input: createEmptyActions() });

    createInputSystem(world, sourceOf({ moveY: 1, jump: true }))();

    expect(player.input?.moveY).toBe(1);
    expect(player.input?.jump).toBe(true);
  });

  it("does not touch entities that are not the local player", () => {
    const world = createWorld();
    const remote = world.add({ input: createEmptyActions() });

    createInputSystem(world, sourceOf({ moveY: 1 }))();

    expect(remote.input?.moveY).toBe(0);
  });

  it("keeps the same input object so other systems can hold a reference", () => {
    const world = createWorld();
    const input = createEmptyActions();
    world.add({ localPlayer: true, input });

    createInputSystem(world, sourceOf({ moveX: -1 }))();

    expect(input.moveX).toBe(-1);
  });
});
