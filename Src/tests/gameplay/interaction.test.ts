import { describe, expect, it } from "vitest";
import { createTransform, createWorld } from "../../src/core/ecs";
import {
  CHARACTER_HEIGHT,
  INTERACT_ANGLE_DEGREES,
  INTERACT_DISTANCE,
  INTERACT_HEIGHT,
  INTERACT_NEAR_DISTANCE,
} from "../../src/data/tuning";
import { createInteractionSystem, type InteractionCandidate, pickInteractionTarget, TARGET_SIGHT_HEIGHT } from "../../src/gameplay/interaction";
import { createView } from "../../src/gameplay/view";

/** At yaw 0 the view faces north, which is -Z. */
const NORTH = 0;
const WEST = Math.PI / 2;
const SOUTH = Math.PI;
const at = (id: string, x: number, z: number, y = 0): InteractionCandidate => ({ id, x, y, z });
const here = { x: 0, feetY: 0, z: 0 };
const degrees = (value: number): number => (value * Math.PI) / 180;

describe("pickInteractionTarget", () => {
  it("picks what is near and ahead", () => {
    expect(pickInteractionTarget(here, NORTH, [at("crate", 0, -1.5)])).toBe("crate");
  });

  it("picks nothing when there is nothing", () => {
    expect(pickInteractionTarget(here, NORTH, [])).toBeNull();
  });

  it("reaches as far as the interaction distance and no further", () => {
    expect(pickInteractionTarget(here, NORTH, [at("crate", 0, -INTERACT_DISTANCE)])).toBe("crate");
    expect(pickInteractionTarget(here, NORTH, [at("crate", 0, -(INTERACT_DISTANCE + 0.01))])).toBeNull();
  });

  it("measures the distance level: a slope between the two does not shorten the reach", () => {
    expect(pickInteractionTarget(here, NORTH, [at("crate", 0, -INTERACT_DISTANCE, 1)])).toBe("crate");
  });

  it("goes by where the view points, to either side up to the angle", () => {
    const inside = degrees(INTERACT_ANGLE_DEGREES - 1);
    const outside = degrees(INTERACT_ANGLE_DEGREES + 1);
    const crate = [at("crate", 0, -1.5)];
    expect(pickInteractionTarget(here, inside, crate)).toBe("crate");
    expect(pickInteractionTarget(here, -inside, crate)).toBe("crate");
    expect(pickInteractionTarget(here, outside, crate)).toBeNull();
    expect(pickInteractionTarget(here, -outside, crate)).toBeNull();
  });

  it("does not pick what is behind", () => {
    expect(pickInteractionTarget(here, SOUTH, [at("crate", 0, -1)])).toBeNull();
  });

  it("follows the view round: a target to the west is picked looking west", () => {
    const crate = [at("crate", -1.5, 0)];
    expect(pickInteractionTarget(here, WEST, crate)).toBe("crate");
    expect(pickInteractionTarget(here, -WEST, crate)).toBeNull();
  });

  it("picks a target the character stands on whichever way the view points", () => {
    const crate = [at("crate", 0, INTERACT_NEAR_DISTANCE)];
    expect(pickInteractionTarget(here, NORTH, crate)).toBe("crate");
    expect(pickInteractionTarget(here, NORTH, [at("crate", 0, INTERACT_NEAR_DISTANCE + 0.05)])).toBeNull();
  });

  it("leaves out what stands too far above or below the feet", () => {
    expect(pickInteractionTarget(here, NORTH, [at("crate", 0, -1, INTERACT_HEIGHT)])).toBe("crate");
    expect(pickInteractionTarget(here, NORTH, [at("upstairs", 0, -1, INTERACT_HEIGHT + 0.1)])).toBeNull();
    expect(pickInteractionTarget(here, NORTH, [at("cellar", 0, -1, -(INTERACT_HEIGHT + 0.1))])).toBeNull();
  });

  it("still picks while the character is in the air from a jump", () => {
    expect(pickInteractionTarget({ x: 0, feetY: 1.1, z: 0 }, NORTH, [at("crate", 0, -1)])).toBe("crate");
  });

  it("of several, picks the one the view points at most directly", () => {
    const ahead = at("ahead", 0.2, -1.9);
    const aside = at("aside", 0.8, -0.6);
    expect(pickInteractionTarget(here, NORTH, [aside, ahead])).toBe("ahead");
    expect(pickInteractionTarget(here, NORTH, [ahead, aside])).toBe("ahead");
    // Turning towards the other one changes the pick.
    expect(pickInteractionTarget(here, -degrees(50), [ahead, aside])).toBe("aside");
  });

  it("of equally direct ones, picks the nearer", () => {
    const near = at("near", 0, -1);
    const far = at("far", 0, -1.8);
    expect(pickInteractionTarget(here, NORTH, [far, near])).toBe("near");
    expect(pickInteractionTarget(here, NORTH, [near, far])).toBe("near");
  });
});

describe("pickInteractionTarget with something in the way", () => {
  it("leaves out a candidate the way to which is not free", () => {
    expect(pickInteractionTarget(here, NORTH, [at("crate", 0, -1.5)], () => false)).toBeNull();
    expect(pickInteractionTarget(here, NORTH, [at("crate", 0, -1.5)], () => true)).toBe("crate");
  });

  it("falls back on the next best candidate", () => {
    const ahead = at("ahead", 0, -1);
    const aside = at("aside", 0.6, -1);
    expect(pickInteractionTarget(here, NORTH, [ahead, aside], (candidate) => candidate.id !== "ahead")).toBe("aside");
    expect(pickInteractionTarget(here, NORTH, [aside, ahead], (candidate) => candidate.id !== "ahead")).toBe("aside");
  });

  it("does not ask about candidates out of reach or out of view", () => {
    const asked: string[] = [];
    pickInteractionTarget(here, NORTH, [at("far", 0, -5), at("behind", 0, 1), at("near", 0, -1)], (candidate) => {
      asked.push(candidate.id);
      return true;
    });
    expect(asked).toEqual(["near"]);
  });
});

describe("createInteractionSystem", () => {
  const STANDING = CHARACTER_HEIGHT / 2;
  const setUp = () => {
    const world = createWorld();
    world.add({ transform: createTransform(0, 0, -1.5), interactable: { id: "crate", kind: "search" } });
    const player = world.add({
      transform: createTransform(0, STANDING, 0),
      view: createView(NORTH),
      interaction: { target: null as string | null },
      health: { current: 100, max: 100 },
    });
    return { world, player, step: createInteractionSystem(world) };
  };

  it("notes the target on each entity that can interact", () => {
    const { player, step } = setUp();
    step();
    expect(player.interaction.target).toBe("crate");
  });

  it("drops the target when the view turns away or the character walks off", () => {
    const { player, step } = setUp();
    player.view.yaw = SOUTH;
    step();
    expect(player.interaction.target).toBeNull();
    player.view.yaw = NORTH;
    player.transform.z = 3;
    step();
    expect(player.interaction.target).toBeNull();
  });

  it("gives every player their own target", () => {
    const { world, player, step } = setUp();
    const other = world.add({
      transform: createTransform(50, STANDING, 50),
      view: createView(NORTH),
      interaction: { target: null as string | null },
    });
    step();
    expect(player.interaction.target).toBe("crate");
    expect(other.interaction.target).toBeNull();
  });

  it("gives a collapsed character none", () => {
    const { player, step } = setUp();
    player.health.current = 0;
    step();
    expect(player.interaction.target).toBeNull();
  });

  it("leaves out a target behind something solid, but not one behind only itself", () => {
    const world = createWorld();
    world.add({ transform: createTransform(0, 0, -1.5), interactable: { id: "crate", kind: "search", solid: 7 } });
    const player = world.add({
      transform: createTransform(0, STANDING, 0),
      view: createView(NORTH),
      interaction: { target: null as string | null },
      body: { handle: 1 },
    });
    let inTheWay: number | undefined;
    const calls: Array<{ target: { x: number; y: number; z: number }; ignored: number | undefined }> = [];
    const step = createInteractionSystem(world, {
      firstBodyBetween: (_origin, target, ignored) => {
        calls.push({ target, ignored });
        return inTheWay;
      },
    });

    step();
    expect(player.interaction.target).toBe("crate");
    // The line runs to a little above the target's foot, and the looker is not in its own way.
    expect(calls[0]?.target).toEqual({ x: 0, y: TARGET_SIGHT_HEIGHT, z: -1.5 });
    expect(calls[0]?.ignored).toBe(1);

    // Its own box is met first: that is the target itself.
    inTheWay = 7;
    step();
    expect(player.interaction.target).toBe("crate");

    // A wall is met first.
    inTheWay = 3;
    step();
    expect(player.interaction.target).toBeNull();
  });

  it("forgets targets that have left the world", () => {
    const { world, player, step } = setUp();
    step();
    for (const entity of [...world.with("interactable")]) {
      world.remove(entity);
    }
    step();
    expect(player.interaction.target).toBeNull();
  });
});
