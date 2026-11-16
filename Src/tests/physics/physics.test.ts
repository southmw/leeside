import { beforeAll, describe, expect, it } from "vitest";
import { createTransform, createWorld } from "../../src/core/ecs";
import { TICK_RATE } from "../../src/core/fixedTimestep";
import { GRAVITY } from "../../src/data/tuning";
import { createPhysicsSystem } from "../../src/physics/physicsSystem";
import { initPhysics, PhysicsWorld } from "../../src/physics/physicsWorld";

const HALF = 0.75;
const boxSize = { x: HALF, y: HALF, z: HALF };

/** A floor whose top surface is at y = 0. */
function createFloor(physics: PhysicsWorld): number {
  return physics.addStaticBox({ x: 0, y: -0.5, z: 0 }, { x: 30, y: 0.5, z: 30 });
}

function heightOf(physics: PhysicsWorld, handle: number): number {
  const pose = { x: 0, y: 0, z: 0, rotationY: 0 };
  physics.readPose(handle, pose);
  return pose.y;
}

beforeAll(async () => {
  await initPhysics();
});

describe("PhysicsWorld", () => {
  it("drops a box onto the floor, where it comes to rest", () => {
    const physics = new PhysicsWorld();
    createFloor(physics);
    const box = physics.addDynamicBox({ x: 0, y: 8, z: 0 }, boxSize);

    for (let tick = 0; tick < 3 * TICK_RATE; tick += 1) {
      physics.step();
    }

    expect(heightOf(physics, box)).toBeCloseTo(HALF, 1);
    expect(physics.speedOf(box)).toBeLessThan(0.01);

    // Still there a second later: it rests, it does not sink or bounce away.
    for (let tick = 0; tick < TICK_RATE; tick += 1) {
      physics.step();
    }
    expect(heightOf(physics, box)).toBeCloseTo(HALF, 1);
    physics.dispose();
  });

  it("falls at the configured gravity", () => {
    const physics = new PhysicsWorld();
    const box = physics.addDynamicBox({ x: 0, y: 100, z: 0 }, boxSize);

    for (let tick = 0; tick < TICK_RATE; tick += 1) {
      physics.step();
    }

    // After one second of free fall: v = g * t, and about g / 2 metres fallen.
    expect(physics.speedOf(box)).toBeCloseTo(GRAVITY, 1);
    expect(100 - heightOf(physics, box)).toBeGreaterThan(GRAVITY / 2 - 0.5);
    expect(100 - heightOf(physics, box)).toBeLessThan(GRAVITY / 2 + 0.5);
    physics.dispose();
  });

  it("does not move a static box", () => {
    const physics = new PhysicsWorld();
    const floor = createFloor(physics);
    for (let tick = 0; tick < TICK_RATE; tick += 1) {
      physics.step();
    }
    expect(heightOf(physics, floor)).toBe(-0.5);
    physics.dispose();
  });

  it("gives the same result for the same start", () => {
    const run = (): number => {
      const physics = new PhysicsWorld();
      createFloor(physics);
      const box = physics.addDynamicBox({ x: 0, y: 8, z: 0 }, boxSize);
      for (let tick = 0; tick < 90; tick += 1) {
        physics.step();
      }
      const height = heightOf(physics, box);
      physics.dispose();
      return height;
    };
    expect(run()).toBe(run());
  });

  it("counts and removes bodies", () => {
    const physics = new PhysicsWorld();
    createFloor(physics);
    const box = physics.addDynamicBox({ x: 0, y: 8, z: 0 }, boxSize);
    expect(physics.bodyCount).toBe(2);

    physics.removeBody(box);
    physics.removeBody(box); // A second removal is harmless.
    expect(physics.bodyCount).toBe(1);
    expect(physics.readPose(box, { x: 0, y: 0, z: 0, rotationY: 0 })).toBe(false);
    physics.dispose();
  });
});

describe("createPhysicsSystem", () => {
  it("writes body poses to entity transforms", () => {
    const world = createWorld();
    const physics = new PhysicsWorld();
    createFloor(physics);
    const system = createPhysicsSystem(world, physics);
    const entity = world.add({
      transform: createTransform(0, 8, 0),
      body: { handle: physics.addDynamicBox({ x: 0, y: 8, z: 0 }, boxSize) },
    });

    system.update();
    expect(entity.transform.y).toBeLessThan(8);

    for (let tick = 0; tick < 3 * TICK_RATE; tick += 1) {
      system.update();
    }
    expect(entity.transform.y).toBeCloseTo(HALF, 1);
    // A hard landing nudges the box sideways by a centimetre or so; it must not wander further.
    expect(entity.transform.x).toBeCloseTo(0, 1);
    physics.dispose();
  });

  it("removes the body when its entity is removed", () => {
    const world = createWorld();
    const physics = new PhysicsWorld();
    createPhysicsSystem(world, physics);
    const entity = world.add({
      transform: createTransform(),
      body: { handle: physics.addDynamicBox({ x: 0, y: 8, z: 0 }, boxSize) },
    });
    expect(physics.bodyCount).toBe(1);

    world.remove(entity);
    expect(physics.bodyCount).toBe(0);
    physics.dispose();
  });
});
