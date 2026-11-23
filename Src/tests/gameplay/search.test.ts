import { describe, expect, it } from "vitest";
import { type Container, createTransform, createWorld } from "../../src/core/ecs";
import { SEARCH_SECONDS } from "../../src/data/tuning";
import type { Command } from "../../src/gameplay/commands";
import { containerState, createSearch, createSearchSystem, searchProgress, type SearchSituation, stepSearch } from "../../src/gameplay/search";
import { createEmptyActions } from "../../src/input/actions";

const TICK = 1 / 60;
const closed = { id: "crate", state: "closed" } as const;
const holding = (over: Partial<SearchSituation> = {}): SearchSituation => ({ interact: true, moving: false, target: closed, dead: false, ...over });
const idle = (over: Partial<SearchSituation> = {}): SearchSituation => holding({ interact: false, ...over });
/** Steps until something is opened or `seconds` have passed; returns what was opened and how many steps it took. */
const hold = (search: ReturnType<typeof createSearch>, seconds: number, situation = holding()) => {
  const steps = Math.round(seconds / TICK);
  for (let step = 1; step <= steps; step += 1) {
    const opened = stepSearch(search, situation, TICK);
    if (opened !== null) {
      return { opened, steps: step };
    }
  }
  return { opened: null, steps };
};

describe("containerState", () => {
  it("tells a container not yet opened from one with things left and one emptied", () => {
    expect(containerState({ opened: false, items: [{ item: "scrap", count: 1 }] })).toBe("closed");
    expect(containerState({ opened: false, items: [] })).toBe("closed");
    expect(containerState({ opened: true, items: [{ item: "scrap", count: 1 }] })).toBe("stocked");
    expect(containerState({ opened: true, items: [] })).toBe("empty");
  });
});

describe("stepSearch on a container not yet searched", () => {
  it("opens it after the key has been held for the search time", () => {
    const search = createSearch();
    const result = hold(search, 3);
    expect(result.opened).toBe("crate");
    expect(result.steps * TICK).toBeGreaterThanOrEqual(SEARCH_SECONDS - TICK / 2);
    expect(result.steps * TICK).toBeLessThan(SEARCH_SECONDS + 2 * TICK);
  });

  it("shows its progress on the way", () => {
    const search = createSearch();
    expect(searchProgress(search)).toBe(0);
    hold(search, SEARCH_SECONDS / 2);
    expect(searchProgress(search)).toBeCloseTo(0.5, 1);
    expect(search.target).toBe("crate");
  });

  it("starts over when the key is let go", () => {
    const search = createSearch();
    hold(search, 1);
    stepSearch(search, idle(), TICK);
    expect(searchProgress(search)).toBe(0);
    expect(hold(search, 1).opened).toBeNull();
    expect(hold(search, 1).opened).toBe("crate");
  });

  it("is cancelled by moving, and needs a fresh press afterwards", () => {
    const search = createSearch();
    hold(search, 1);
    stepSearch(search, holding({ moving: true }), TICK);
    expect(searchProgress(search)).toBe(0);
    // Standing still again with the key still down does not pick it up again.
    expect(hold(search, 3).opened).toBeNull();
    stepSearch(search, idle(), TICK);
    expect(hold(search, 3).opened).toBe("crate");
  });

  it("does not begin while moving", () => {
    const search = createSearch();
    expect(hold(search, 3, holding({ moving: true })).opened).toBeNull();
    expect(searchProgress(search)).toBe(0);
  });

  it("is cancelled when the target changes, and does not carry over to the new one", () => {
    const search = createSearch();
    hold(search, 1);
    const other = holding({ target: { id: "trunk", state: "closed" } });
    expect(hold(search, 3, other).opened).toBeNull();
    stepSearch(search, idle(), TICK);
    expect(hold(search, 3, other).opened).toBe("trunk");
  });

  it("is cancelled when there is no target any more, or the character collapses", () => {
    const search = createSearch();
    hold(search, 1);
    stepSearch(search, holding({ target: null }), TICK);
    expect(searchProgress(search)).toBe(0);
    stepSearch(search, idle(), TICK);
    hold(search, 1);
    stepSearch(search, holding({ dead: true }), TICK);
    expect(searchProgress(search)).toBe(0);
  });

  it("does not open a second time while the key stays down", () => {
    const search = createSearch();
    expect(hold(search, 3).opened).toBe("crate");
    expect(hold(search, 5).opened).toBeNull();
  });

  it("takes the same time however long the steps are", () => {
    const search = createSearch();
    stepSearch(search, holding(), 0.5);
    stepSearch(search, holding(), 0.5);
    expect(stepSearch(search, holding(), 0.5)).toBe("crate");
  });
});

describe("stepSearch on a container already opened", () => {
  const stocked = { id: "crate", state: "stocked" } as const;
  const empty = { id: "crate", state: "empty" } as const;

  it("opens it again at once on a press, if something is left in it", () => {
    const search = createSearch();
    expect(stepSearch(search, holding({ target: stocked }), TICK)).toBe("crate");
  });

  it("opens it once per press, not for as long as the key is down", () => {
    const search = createSearch();
    stepSearch(search, holding({ target: stocked }), TICK);
    expect(hold(search, 2, holding({ target: stocked })).opened).toBeNull();
    stepSearch(search, idle({ target: stocked }), TICK);
    expect(stepSearch(search, holding({ target: stocked }), TICK)).toBe("crate");
  });

  it("does not take the key still held from the search as a press to open again", () => {
    const search = createSearch();
    expect(hold(search, 3).opened).toBe("crate");
    expect(hold(search, 2, holding({ target: stocked })).opened).toBeNull();
  });

  it("does nothing with an empty one", () => {
    const search = createSearch();
    expect(hold(search, 3, holding({ target: empty })).opened).toBeNull();
    expect(searchProgress(search)).toBe(0);
  });
});

describe("stepSearch on a pile on the ground", () => {
  const pile = { id: "pile_1", state: "pile" } as const;

  it("picks it up at once on a press, also while walking", () => {
    expect(stepSearch(createSearch(), holding({ target: pile }), TICK)).toBe("pile_1");
    expect(stepSearch(createSearch(), holding({ target: pile, moving: true }), TICK)).toBe("pile_1");
  });

  it("picks it up once per press", () => {
    const search = createSearch();
    stepSearch(search, holding({ target: pile }), TICK);
    expect(hold(search, 2, holding({ target: pile })).opened).toBeNull();
  });

  it("does not start a search with the key still held when a container comes into reach next", () => {
    const search = createSearch();
    stepSearch(search, holding({ target: pile }), TICK);
    expect(hold(search, 3).opened).toBeNull();
    expect(searchProgress(search)).toBe(0);
  });

  it("is left alone by someone who has collapsed", () => {
    expect(stepSearch(createSearch(), holding({ target: pile, dead: true }), TICK)).toBeNull();
  });
});

describe("createSearchSystem", () => {
  const setUp = () => {
    const world = createWorld();
    const state: Container = { kind: "crate", opened: false, items: [{ item: "scrap", count: 2 }] };
    world.add({ transform: createTransform(0, 0, -1), interactable: { id: "crate", kind: "search" }, container: state });
    const player = world.add({
      id: "player_1",
      input: createEmptyActions(),
      interaction: { target: "crate" as string | null },
      search: createSearch(),
      character: { velocityY: 0, grounded: true as boolean, jumpHeld: false, facing: 0 },
      health: { current: 100, max: 100 },
    });
    const pushed: Command[] = [];
    const step = createSearchSystem(world, (command) => pushed.push(command));
    const run = (seconds: number): void => {
      for (let time = 0; time < seconds; time += TICK) {
        step(TICK);
      }
    };
    return { player, state, pushed, run };
  };

  it("asks for the container to be opened once the key has been held long enough", () => {
    const { player, pushed, run } = setUp();
    player.input.interact = true;
    run(1);
    expect(pushed).toEqual([]);
    run(1);
    expect(pushed).toEqual([{ type: "openContainer", actor: "player_1", container: "crate" }]);
  });

  it("asks for a pile to be picked up on a press", () => {
    const world = createWorld();
    world.add({ transform: createTransform(0, 0, 0), interactable: { id: "pile_1", kind: "pickup" }, pile: { items: [{ item: "tape", count: 1 }] } });
    const player = world.add({ id: "player_1", input: createEmptyActions(), interaction: { target: "pile_1" as string | null }, search: createSearch() });
    const pushed: Command[] = [];
    const step = createSearchSystem(world, (command) => pushed.push(command));
    step(TICK);
    player.input.interact = true;
    step(TICK);
    step(TICK);
    expect(pushed).toEqual([{ type: "pickUp", actor: "player_1", pile: "pile_1" }]);
  });

  it("counts walking, jumping and being in the air as moving", () => {
    for (const disturb of [
      (player: ReturnType<typeof setUp>["player"]) => (player.input.moveY = 1),
      (player: ReturnType<typeof setUp>["player"]) => (player.input.jump = true),
      (player: ReturnType<typeof setUp>["player"]) => (player.character.grounded = false),
    ]) {
      const { player, pushed, run } = setUp();
      player.input.interact = true;
      disturb(player);
      run(3);
      expect(pushed).toEqual([]);
    }
  });

  it("asks nothing without a target, or for a collapsed character", () => {
    const { player, pushed, run } = setUp();
    player.input.interact = true;
    player.interaction.target = null;
    run(3);
    player.interaction.target = "crate";
    player.health.current = 0;
    player.input.interact = false;
    run(0.1);
    player.input.interact = true;
    run(3);
    expect(pushed).toEqual([]);
  });

  it("asks at once, on a press, for a container opened before", () => {
    const { player, state, pushed, run } = setUp();
    state.opened = true;
    player.input.interact = true;
    run(TICK);
    expect(pushed).toHaveLength(1);
  });
});
