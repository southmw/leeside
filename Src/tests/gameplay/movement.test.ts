import { beforeAll, describe, expect, it } from "vitest";
import { createTransform, createWorld, type Entity } from "../../src/core/ecs";
import { TICK_RATE, TICK_SECONDS } from "../../src/core/fixedTimestep";
import { CHARACTER_HEIGHT, CHARACTER_RADIUS, MOVE_SPEED } from "../../src/data/tuning";
import { createMovementSystem, desiredMovement } from "../../src/gameplay/movementSystem";
import { createEmptyActions } from "../../src/input/actions";
import { createPhysicsSystem } from "../../src/physics/physicsSystem";
import { CHARACTER_SKIN, initPhysics, PhysicsWorld } from "../../src/physics/physicsWorld";

beforeAll(async () => {
  await initPhysics();
});

describe("desiredMovement", () => {
  it("moves forward along -Z and right along +X", () => {
    expect(desiredMovement({ moveX: 0, moveY: 1 }, 1, 2)).toEqual({ x: 0, y: 0, z: -2 });
    expect(desiredMovement({ moveX: 1, moveY: 0 }, 1, 2)).toEqual({ x: 2, y: 0, z: -0 });
  });

  it("scales with the step length and the speed", () => {
    const step = desiredMovement({ moveX: 0, moveY: -1 }, TICK_SECONDS);
    expect(step.z).toBeCloseTo(MOVE_SPEED / TICK_RATE);
  });

  it("is zero without input", () => {
    const step = desiredMovement({ moveX: 0, moveY: 0 }, TICK_SECONDS);
    expect(Math.hypot(step.x, step.z)).toBe(0);
  });
});

/** A floor, a character standing on it at the origin, and the systems in game order. */
function setup() {
  const world = createWorld();
  const physics = new PhysicsWorld();
  physics.addStaticBox({ x: 0, y: -0.5, z: 0 }, { x: 50, y: 0.5, z: 50 });

  const start = { x: 0, y: CHARACTER_HEIGHT / 2 + CHARACTER_SKIN, z: 0 };
  const player = world.add({
    transform: createTransform(start.x, start.y, start.z),
    input: createEmptyActions(),
    character: true,
    body: { handle: physics.addCharacter(start) },
  }) as Required<Pick<Entity, "transform" | "input">>;

  const movement = createMovementSystem(world, physics);
  const physicsSystem = createPhysicsSystem(world, physics);
  const run = (ticks: number): void => {
    for (let tick = 0; tick < ticks; tick += 1) {
      movement(TICK_SECONDS);
      physicsSystem.update();
    }
  };
  // One step first, so the physics world knows about every collider before anything moves.
  run(1);
  return { physics, player, run };
}

describe("character movement", () => {
  it("covers speed times time on open ground", () => {
    const { physics, player, run } = setup();
    player.input.moveY = 1;
    run(2 * TICK_RATE);

    expect(-player.transform.z).toBeCloseTo(MOVE_SPEED * 2, 1);
    expect(player.transform.x).toBeCloseTo(0, 3);
    expect(player.transform.y).toBeCloseTo(CHARACTER_HEIGHT / 2 + CHARACTER_SKIN, 2);
    physics.dispose();
  });

  it("is not faster diagonally", () => {
    const { physics, player, run } = setup();
    player.input.moveX = Math.SQRT1_2;
    player.input.moveY = Math.SQRT1_2;
    run(TICK_RATE);

    expect(Math.hypot(player.transform.x, player.transform.z)).toBeCloseTo(MOVE_SPEED, 1);
    physics.dispose();
  });

  it("stays put without input", () => {
    const { physics, player, run } = setup();
    run(TICK_RATE);
    expect(player.transform.x).toBe(0);
    expect(player.transform.z).toBe(0);
    physics.dispose();
  });

  it("stops at a wall instead of passing through", () => {
    const { physics, player, run } = setup();
    // A wall across the path whose near face is at z = -3.
    physics.addStaticBox({ x: 0, y: 1.5, z: -3.5 }, { x: 10, y: 1.5, z: 0.5 });
    run(1);

    player.input.moveY = 1;
    run(3 * TICK_RATE);

    // The capsule's surface rests against the wall: its centre is one radius short of it.
    expect(player.transform.z).toBeGreaterThan(-3 + CHARACTER_RADIUS - 0.001);
    expect(player.transform.z).toBeLessThan(-3 + CHARACTER_RADIUS + 0.1);
    physics.dispose();
  });

  it("slides along a wall when pushed into it at an angle", () => {
    const { physics, player, run } = setup();
    physics.addStaticBox({ x: 0, y: 1.5, z: -3.5 }, { x: 10, y: 1.5, z: 0.5 });
    run(1);

    player.input.moveX = Math.SQRT1_2;
    player.input.moveY = Math.SQRT1_2;
    run(2 * TICK_RATE);

    expect(player.transform.z).toBeGreaterThan(-3 + CHARACTER_RADIUS - 0.001);
    expect(player.transform.x).toBeGreaterThan(4);
    physics.dispose();
  });

  it("is blocked by a box that physics moves, too", () => {
    const { physics, player, run } = setup();
    physics.addDynamicBox({ x: 0, y: 0.75, z: -3.75 }, { x: 0.75, y: 0.75, z: 0.75 });
    run(1);

    player.input.moveY = 1;
    run(2 * TICK_RATE);

    expect(player.transform.z).toBeGreaterThan(-3 + CHARACTER_RADIUS - 0.05);
    physics.dispose();
  });
});
