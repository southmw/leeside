import { beforeAll, describe, expect, it } from "vitest";
import { createCharacter, createTransform, createWorld, type Entity } from "../../src/core/ecs";
import { TICK_RATE, TICK_SECONDS } from "../../src/core/fixedTimestep";
import { CHARACTER_HEIGHT, CHARACTER_RADIUS, JUMP_HEIGHT, MOVE_SPEED } from "../../src/data/tuning";
import { createMovementSystem, desiredMovement, facingOf } from "../../src/gameplay/movementSystem";
import { settleVertical, stepVertical } from "../../src/gameplay/verticalMotion";
import { createEmptyActions } from "../../src/input/actions";
import { createPhysicsSystem } from "../../src/physics/physicsSystem";
import { CHARACTER_SKIN, initPhysics, PhysicsWorld } from "../../src/physics/physicsWorld";

beforeAll(async () => {
  await initPhysics();
});

describe("desiredMovement", () => {
  it("moves forward along -Z and right along +X", () => {
    const forward = desiredMovement({ moveX: 0, moveY: 1 }, 1, 0, 2);
    expect(forward.x).toBeCloseTo(0);
    expect(forward.z).toBeCloseTo(-2);
    const right = desiredMovement({ moveX: 1, moveY: 0 }, 1, 0, 2);
    expect(right.x).toBeCloseTo(2);
    expect(right.z).toBeCloseTo(0);
  });

  it("follows the view: after a quarter turn to the left, forward is -X", () => {
    const forward = desiredMovement({ moveX: 0, moveY: 1 }, 1, Math.PI / 2, 2);
    expect(forward.x).toBeCloseTo(-2);
    expect(forward.z).toBeCloseTo(0);
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
    character: createCharacter(),
    body: { handle: physics.addCharacter(start) },
  }) as Required<Pick<Entity, "transform" | "input" | "character">>;

  const movement = createMovementSystem(world, physics);
  const physicsSystem = createPhysicsSystem(world, physics);
  const run = (ticks: number): void => {
    for (let tick = 0; tick < ticks; tick += 1) {
      movement(TICK_SECONDS);
      physicsSystem.update();
    }
  };
  // A few steps first, so the physics world knows about every collider and the character
  // has settled on the floor before anything moves.
  run(10);
  return { physics, player, run, groundY: player.transform.y };
}

describe("character movement", () => {
  it("covers speed times time on open ground", () => {
    const { physics, player, run } = setup();
    player.input.moveY = 1;
    run(2 * TICK_RATE);

    expect(-player.transform.z).toBeCloseTo(MOVE_SPEED * 2, 1);
    expect(player.transform.x).toBeCloseTo(0, 2);
    // The controller lets the height wander by a few millimetres while walking.
    expect(Math.abs(player.transform.y - (CHARACTER_HEIGHT / 2 + CHARACTER_SKIN))).toBeLessThan(0.02);
    physics.dispose();
  });

  it("walks at an overridden speed when one is given", () => {
    const world = createWorld();
    const physics = new PhysicsWorld();
    physics.addStaticBox({ x: 0, y: -0.5, z: 0 }, { x: 50, y: 0.5, z: 50 });
    const start = { x: 0, y: CHARACTER_HEIGHT / 2 + CHARACTER_SKIN, z: 0 };
    const player = world.add({
      transform: createTransform(start.x, start.y, start.z),
      input: createEmptyActions(),
      character: createCharacter(),
      body: { handle: physics.addCharacter(start) },
    });
    const movement = createMovementSystem(world, physics, 10);
    const physicsSystem = createPhysicsSystem(world, physics);
    physicsSystem.update();
    player.input.moveY = 1;
    for (let tick = 0; tick < TICK_RATE; tick += 1) {
      movement(TICK_SECONDS);
      physicsSystem.update();
    }
    expect(-player.transform.z).toBeCloseTo(10, 1);
    physics.dispose();
  });

  it("follows a speed that changes while the game runs", () => {
    const world = createWorld();
    const physics = new PhysicsWorld();
    physics.addStaticBox({ x: 0, y: -0.5, z: 0 }, { x: 50, y: 0.5, z: 50 });
    const start = { x: 0, y: CHARACTER_HEIGHT / 2 + CHARACTER_SKIN, z: 0 };
    const player = world.add({
      transform: createTransform(start.x, start.y, start.z),
      input: createEmptyActions(),
      character: createCharacter(),
      body: { handle: physics.addCharacter(start) },
    });
    let speed = 4;
    const movement = createMovementSystem(world, physics, () => speed);
    const physicsSystem = createPhysicsSystem(world, physics);
    physicsSystem.update();
    player.input.moveY = 1;
    const runSecond = (): void => {
      for (let tick = 0; tick < TICK_RATE; tick += 1) {
        movement(TICK_SECONDS);
        physicsSystem.update();
      }
    };
    runSecond();
    speed = 8;
    runSecond();
    expect(-player.transform.z).toBeCloseTo(12, 1);
    physics.dispose();
  });

  it("carries on from where a teleport puts the character", () => {
    const { physics, player, run, groundY } = setup();
    const handle = (player as unknown as { body: { handle: number } }).body.handle;
    physics.teleportCharacter(handle, { x: 20, y: groundY, z: -15 });
    run(2);
    expect(player.transform.x).toBeCloseTo(20, 2);
    expect(player.transform.z).toBeCloseTo(-15, 2);

    player.input.moveY = 1;
    run(TICK_RATE);
    expect(player.transform.x).toBeCloseTo(20, 1);
    expect(-player.transform.z).toBeGreaterThan(15 + MOVE_SPEED * 0.9);
    expect(player.character.grounded).toBe(true);
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
    expect(player.transform.x).toBeCloseTo(0, 4);
    expect(player.transform.z).toBeCloseTo(0, 4);
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
    // Long enough that two seconds of sliding do not reach its end.
    physics.addStaticBox({ x: 0, y: 1.5, z: -3.5 }, { x: 40, y: 1.5, z: 0.5 });
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

describe("facing", () => {
  it("points along the direction of movement", () => {
    expect(facingOf(0, -1)).toBeCloseTo(0);
    expect(facingOf(-1, 0)).toBeCloseTo(Math.PI / 2);
    expect(facingOf(1, 0)).toBeCloseTo(-Math.PI / 2);
    expect(Math.abs(facingOf(0, 1))).toBeCloseTo(Math.PI);
  });

  it("turns the character towards where it walks, and the transform follows", () => {
    const { physics, player, run } = setup();
    expect(player.character.facing).toBe(0);

    // Walk to the right (+X): the body should end up facing -PI / 2.
    player.input.moveX = 1;
    run(1);
    const afterOneStep = player.character.facing;
    expect(afterOneStep).toBeLessThan(0);
    expect(afterOneStep).toBeGreaterThan(-Math.PI / 2);

    run(30);
    expect(player.character.facing).toBeCloseTo(-Math.PI / 2);
    expect(player.transform.rotationY).toBeCloseTo(-Math.PI / 2);
    physics.dispose();
  });

  it("keeps its facing when it stops", () => {
    const { physics, player, run } = setup();
    player.input.moveX = 1;
    run(30);
    player.input.moveX = 0;
    run(30);
    expect(player.character.facing).toBeCloseTo(-Math.PI / 2);
    physics.dispose();
  });
});

describe("jumping", () => {
  /** Runs `ticks` steps and returns the greatest height above the ground reached. */
  function peakDuring(game: ReturnType<typeof setup>, ticks: number, eachTick?: (tick: number) => void): number {
    let peak = 0;
    for (let tick = 0; tick < ticks; tick += 1) {
      eachTick?.(tick);
      game.run(1);
      peak = Math.max(peak, game.player.transform.y - game.groundY);
    }
    return peak;
  }

  it("stands on the ground at rest", () => {
    const game = setup();
    game.run(TICK_RATE);
    expect(game.player.character.grounded).toBe(true);
    expect(game.player.transform.y).toBeCloseTo(game.groundY, 3);
    game.physics.dispose();
  });

  it("reaches the configured height and lands again", () => {
    const game = setup();
    game.player.input.jump = true;
    const peak = peakDuring(game, 2 * TICK_RATE, (tick) => {
      if (tick === 5) {
        game.player.input.jump = false;
      }
    });

    expect(peak).toBeGreaterThan(JUMP_HEIGHT - 0.05);
    expect(peak).toBeLessThan(JUMP_HEIGHT + 0.05);
    expect(game.player.transform.y).toBeCloseTo(game.groundY, 2);
    expect(game.player.character.grounded).toBe(true);
    game.physics.dispose();
  });

  it("is in the air right after take-off", () => {
    const game = setup();
    game.player.input.jump = true;
    game.run(3);
    expect(game.player.character.grounded).toBe(false);
    game.physics.dispose();
  });

  it("cannot jump again in the air", () => {
    const game = setup();
    const peak = peakDuring(game, 2 * TICK_RATE, (tick) => {
      // Press, release, then press again near the top of the jump.
      game.player.input.jump = tick < 3 || (tick >= 18 && tick < 22);
    });
    expect(peak).toBeLessThan(JUMP_HEIGHT + 0.05);
    game.physics.dispose();
  });

  it("jumps once per press, even if the button is held", () => {
    const game = setup();
    game.player.input.jump = true;
    peakDuring(game, 2 * TICK_RATE);
    // Landed long ago and the button is still down: no second jump.
    const secondPeak = peakDuring(game, TICK_RATE);
    expect(secondPeak).toBeLessThan(0.01);
    game.physics.dispose();
  });

  it("keeps its walking speed while jumping", () => {
    const game = setup();
    game.player.input.moveY = 1;
    game.player.input.jump = true;
    game.run(TICK_RATE);
    expect(-game.player.transform.z).toBeCloseTo(MOVE_SPEED, 1);
    game.physics.dispose();
  });

  it("falls off a ledge and lands on the ground below", () => {
    const game = setup();
    // A platform 1 m high directly ahead: jump onto it, walk across and off its far edge.
    game.physics.addStaticBox({ x: 0, y: 0.5, z: -3 }, { x: 2, y: 0.5, z: 1.5 });
    game.run(1);
    game.player.input.moveY = 1;
    game.run(8);
    game.player.input.jump = true;
    game.run(30);
    game.player.input.jump = false;
    expect(game.player.transform.y - game.groundY).toBeCloseTo(1, 1);
    expect(game.player.character.grounded).toBe(true);

    game.run(TICK_RATE);
    expect(game.player.transform.z).toBeLessThan(-4.5);
    expect(game.player.transform.y).toBeCloseTo(game.groundY, 2);
    expect(game.player.character.grounded).toBe(true);
  });
});

describe("ledges", () => {
  /** Walks at a platform of the given height, jumping at the right moment, and reports the result. */
  function jumpAt(platformHeight: number) {
    const game = setup();
    // Near face at z = -2; the jump starts about 0.6 m before it.
    game.physics.addStaticBox(
      { x: 0, y: platformHeight / 2, z: -12 },
      { x: 2, y: platformHeight / 2, z: 10 },
    );
    game.run(1);
    game.player.input.moveY = 1;
    game.run(10);
    game.player.input.jump = true;
    game.run(2);
    game.player.input.jump = false;
    game.run(TICK_RATE);
    const result = { height: game.player.transform.y - game.groundY, z: game.player.transform.z };
    game.physics.dispose();
    return result;
  }

  it("jumps onto a ledge lower than the jump height", () => {
    const { height, z } = jumpAt(1.0);
    expect(height).toBeCloseTo(1.0, 1);
    expect(z).toBeLessThan(-2.5);
  });

  // The capsule's round bottom can stand on an edge as long as the contact is no steeper than
  // a walkable slope, which is worth about 0.1 m: the reach is roughly 1.2 m, not 1.1 m.
  it.each([1.3, 1.4, 1.6])("cannot jump onto a %f m ledge", (platformHeight) => {
    const { height, z } = jumpAt(platformHeight);
    expect(height).toBeCloseTo(0, 1);
    expect(z).toBeGreaterThan(-2);
  });
});

describe("slopes", () => {
  /** A ramp across the path starting at z = -2 and rising towards -Z. */
  function addRamp(physics: PhysicsWorld, degrees: number): void {
    const angle = (degrees * Math.PI) / 180;
    const halfLength = 6;
    const halfThickness = 0.25;
    physics.addStaticBox(
      {
        x: 0,
        y: halfLength * Math.sin(angle) - halfThickness * Math.cos(angle),
        z: -2 - halfLength * Math.cos(angle),
      },
      { x: 5, y: halfThickness, z: halfLength },
      angle,
    );
  }

  function climb(degrees: number) {
    const game = setup();
    addRamp(game.physics, degrees);
    game.run(1);
    game.player.input.moveY = 1;
    game.run(Math.round(1.5 * TICK_RATE));
    const gained = game.player.transform.y - game.groundY;
    const z = game.player.transform.z;
    game.physics.dispose();
    return { gained, z };
  }

  it.each([20, 40])("walks up a %i degree slope", (degrees) => {
    const { gained } = climb(degrees);
    expect(gained).toBeGreaterThan(1.5);
  });

  it.each([50, 70])("cannot walk up a %i degree slope", (degrees) => {
    const { gained, z } = climb(degrees);
    expect(gained).toBeLessThan(0.3);
    expect(z).toBeGreaterThan(-2.6);
  });

  it("cannot get up a too-steep slope by jumping against it", () => {
    const game = setup();
    addRamp(game.physics, 55);
    game.run(1);
    game.player.input.moveY = 1;
    let peak = 0;
    for (let tick = 0; tick < 5 * TICK_RATE; tick += 1) {
      // Hammer the jump button: down for two steps out of every six.
      game.player.input.jump = tick % 6 < 2;
      game.run(1);
      peak = Math.max(peak, game.player.transform.y - game.groundY);
    }
    // No higher than one ordinary jump from the foot of the slope.
    expect(peak).toBeLessThan(JUMP_HEIGHT + 0.1);

    game.player.input.jump = false;
    game.player.input.moveY = 0;
    game.run(2 * TICK_RATE);
    expect(game.player.transform.y).toBeCloseTo(game.groundY, 1);
    expect(game.player.character.grounded).toBe(true);
    game.physics.dispose();
  });

  it("slides back down when dropped onto a too-steep slope", () => {
    const game = setup();
    addRamp(game.physics, 55);
    game.run(1);
    // Put a second character in the air above the middle of the ramp.
    const angle = (55 * Math.PI) / 180;
    const above = { x: 2, y: 3 * Math.sin(angle) + 3, z: -2 - 3 * Math.cos(angle) };
    const handle = game.physics.addCharacter(above);
    const state = createCharacter();
    const pose = { x: 0, y: 0, z: 0, rotationY: 0 };
    game.physics.step();
    for (let tick = 0; tick < 4 * TICK_RATE; tick += 1) {
      const wanted = stepVertical(state, false, TICK_SECONDS);
      const result = game.physics.moveCharacter(handle, { x: 0, y: wanted, z: 0 }, state.grounded);
      if (result) {
        settleVertical(state, wanted, result.y, result.grounded);
      }
      game.physics.step();
    }
    game.physics.readPose(handle, pose);
    expect(pose.y).toBeCloseTo(game.groundY, 1);
    expect(state.grounded).toBe(true);
    game.physics.dispose();
  });

  it("walks back down a slope without leaving the ground", () => {
    const game = setup();
    addRamp(game.physics, 30);
    game.run(1);
    game.player.input.moveY = 1;
    game.run(TICK_RATE);
    expect(game.player.transform.y - game.groundY).toBeGreaterThan(1);

    game.player.input.moveY = -1;
    let airborneTicks = 0;
    for (let tick = 0; tick < TICK_RATE; tick += 1) {
      game.run(1);
      if (!game.player.character.grounded) {
        airborneTicks += 1;
      }
    }
    expect(airborneTicks).toBeLessThanOrEqual(1);
    expect(game.player.transform.y).toBeCloseTo(game.groundY, 1);
    game.physics.dispose();
  });
});
