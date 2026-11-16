import { beforeAll, describe, expect, it } from "vitest";
import {
  CAMERA_COLLISION_RADIUS,
  CAMERA_DISTANCE,
  CAMERA_MIN_DISTANCE,
  CAMERA_PIVOT_HEIGHT,
  CAMERA_SHOULDER_OFFSET,
} from "../../src/data/tuning";
import { initPhysics, PhysicsWorld } from "../../src/physics/physicsWorld";
import {
  easeCameraLength,
  fitCamera,
  limitDistance,
  type Sweep,
  updateCameraDistance,
} from "../../src/render/cameraCollision";
import { computeCameraPose } from "../../src/render/cameraRig";

describe("limitDistance", () => {
  it("keeps the desired distance when nothing is hit", () => {
    expect(limitDistance(4.5, undefined)).toBe(4.5);
  });

  it("keeps the desired distance when the obstacle is further away", () => {
    expect(limitDistance(4.5, 6)).toBe(4.5);
  });

  it("stops at the obstacle when it is nearer", () => {
    expect(limitDistance(4.5, 2)).toBe(2);
  });

  it("does not go below the minimum", () => {
    expect(limitDistance(4.5, 0.05, 0.3)).toBe(0.3);
    expect(limitDistance(4.5, 0, 0.3)).toBe(0.3);
  });
});

describe("easeCameraLength", () => {
  it("shortens immediately", () => {
    expect(easeCameraLength(4.5, 1.2, 1 / 60)).toBe(1.2);
  });

  it("lengthens gradually, at the given speed", () => {
    expect(easeCameraLength(1, 4.5, 0.1, 6)).toBeCloseTo(1.6);
  });

  it("does not overshoot the target", () => {
    expect(easeCameraLength(4.4, 4.5, 1, 6)).toBe(4.5);
  });

  it("stays put when already there", () => {
    expect(easeCameraLength(4.5, 4.5, 1 / 60)).toBe(4.5);
  });
});

describe("updateCameraDistance", () => {
  const dt = 1 / 60;

  it("moves in at once when the camera's own spot is inside something", () => {
    expect(updateCameraDistance(4.5, 1.2, true, dt, 10, 6, 0)).toBe(1.2);
  });

  it("glides in when only the view is blocked", () => {
    expect(updateCameraDistance(4.5, 1.2, false, 0.1, 10, 6, 0)).toBeCloseTo(3.5);
  });

  it("does not glide past the obstacle", () => {
    expect(updateCameraDistance(1.3, 1.2, false, 0.1, 10, 6, 0)).toBe(1.2);
  });

  it("barely moves for an object that crosses the view for a few frames", () => {
    let distance = 4.5;
    for (let frame = 0; frame < 3; frame += 1) {
      distance = updateCameraDistance(distance, 1, false, dt, 10, 6, 0);
    }
    expect(distance).toBeGreaterThan(3.9);
    // Gone again: back out to the full distance within a moment.
    for (let frame = 0; frame < 10; frame += 1) {
      distance = updateCameraDistance(distance, 4.5, false, dt, 10, 6, 0);
    }
    expect(distance).toBe(4.5);
  });

  it("moves back out gradually and does not overshoot", () => {
    expect(updateCameraDistance(1, 4.5, false, 0.1, 10, 6, 0)).toBeCloseTo(1.6);
    expect(updateCameraDistance(4.4, 4.5, false, 1, 10, 6, 0)).toBe(4.5);
  });

  it("closes a large gap faster, in proportion to its size", () => {
    // 15.5 m to go at a rate of 6 per second: 93 m/s, so 9.3 m in a tenth of a second.
    expect(updateCameraDistance(4.5, 20, false, 0.1, 10, 6, 6)).toBeCloseTo(13.8);
    expect(updateCameraDistance(20, 1, false, 0.1, 10, 6, 6)).toBeCloseTo(8.6);
  });

  it("gets from one end of the zoom range to the other within about a second", () => {
    let distance = 1;
    for (let frame = 0; frame < 75; frame += 1) {
      distance = updateCameraDistance(distance, 20, false, dt);
    }
    expect(distance).toBe(20);
  });

  it("ignores a blocked spot when the target is further out", () => {
    // Cannot happen with a correct sweep, but must not pull the camera in.
    expect(updateCameraDistance(2, 4.5, true, 0.1, 10, 6, 0)).toBeCloseTo(2.6);
  });
});

describe("fitCamera", () => {
  const character = { x: 0, y: 0.92, z: 0 };

  it("uses the full distance and offset in the open", () => {
    const nothing: Sweep = () => undefined;
    expect(fitCamera(character, 0, 0, nothing)).toEqual({
      distance: CAMERA_DISTANCE,
      shoulderOffset: CAMERA_SHOULDER_OFFSET,
    });
  });

  it("sweeps sideways from above the character, then backwards from the shoulder", () => {
    const calls: Array<{ origin: { x: number; y: number; z: number }; direction: { x: number; y: number; z: number }; max: number }> = [];
    const record: Sweep = (origin, direction, max) => {
      calls.push({ origin: { ...origin }, direction: { ...direction }, max });
      return undefined;
    };
    fitCamera(character, 0, 0, record);

    expect(calls).toHaveLength(2);
    const [sideways, backwards] = calls;
    expect(sideways?.origin).toEqual({ x: 0, y: 0.92 + CAMERA_PIVOT_HEIGHT, z: 0 });
    expect(sideways?.direction.x).toBeCloseTo(1);
    expect(sideways?.max).toBe(CAMERA_SHOULDER_OFFSET);
    expect(backwards?.origin.x).toBeCloseTo(CAMERA_SHOULDER_OFFSET);
    // At yaw 0 the view faces -Z, so the camera lies towards +Z.
    expect(backwards?.direction.z).toBeCloseTo(1);
    expect(backwards?.max).toBe(CAMERA_DISTANCE);
  });

  it("uses the distance chosen with the wheel, and sweeps that far", () => {
    let sweptFor = 0;
    const record: Sweep = (_origin, direction, max) => {
      if (direction.z > 0.5) {
        sweptFor = max;
      }
      return undefined;
    };
    expect(fitCamera(character, 0, 0, record, 7).distance).toBe(7);
    expect(sweptFor).toBe(7);
  });

  it("still stops at an obstacle nearer than the chosen distance", () => {
    const wallBehind: Sweep = (_origin, direction) => (direction.z > 0.5 ? 3 : undefined);
    expect(fitCamera(character, 0, 0, wallBehind, 7).distance).toBe(3);
    expect(fitCamera(character, 0, 0, wallBehind, 2).distance).toBe(2);
  });

  it("shortens the distance to where the backwards sweep stopped", () => {
    const wallBehind: Sweep = (_origin, direction) => (direction.z > 0.5 ? 1.5 : undefined);
    expect(fitCamera(character, 0, 0, wallBehind).distance).toBe(1.5);
  });

  it("pulls the shoulder in next to a wall and sweeps back from the pulled-in point", () => {
    let backOriginX = Number.NaN;
    const wallOnTheRight: Sweep = (origin, direction) => {
      if (direction.x > 0.5) {
        return 0.1;
      }
      backOriginX = origin.x;
      return undefined;
    };
    const fit = fitCamera(character, 0, 0, wallOnTheRight);
    expect(fit.shoulderOffset).toBe(0.1);
    expect(backOriginX).toBeCloseTo(0.1);
  });

  it("never comes closer than the minimum distance", () => {
    const touching: Sweep = () => 0;
    expect(fitCamera(character, 0, 0, touching).distance).toBe(CAMERA_MIN_DISTANCE);
  });
});

describe("camera against real colliders", () => {
  beforeAll(async () => {
    await initPhysics();
  });

  function setup() {
    const physics = new PhysicsWorld();
    physics.addStaticBox({ x: 0, y: -0.5, z: 0 }, { x: 50, y: 0.5, z: 50 });
    const player = physics.addCharacter({ x: 0, y: 0.92, z: 0 });
    const sweep: Sweep = (origin, direction, max) =>
      physics.sweepSphere(origin, direction, max, CAMERA_COLLISION_RADIUS, player);
    return { physics, sweep, character: { x: 0, y: 0.92, z: 0 } };
  }

  it("is not blocked by the character itself", () => {
    const { physics, sweep, character } = setup();
    physics.step();
    expect(fitCamera(character, 0, 0, sweep).distance).toBe(CAMERA_DISTANCE);
    physics.dispose();
  });

  it("stays in front of a wall behind the character", () => {
    const { physics, sweep, character } = setup();
    // Wall whose near face is 2 m behind the character (the camera side is +Z).
    physics.addStaticBox({ x: 0, y: 2, z: 2.5 }, { x: 10, y: 2, z: 0.5 });
    physics.step();

    const fit = fitCamera(character, 0, 0, sweep);
    expect(fit.distance).toBeCloseTo(2 - CAMERA_COLLISION_RADIUS, 2);
    const { position } = computeCameraPose(character, 0, 0, fit);
    expect(position.z).toBeLessThan(2);
    physics.dispose();
  });

  it("stays above the ground when the view looks up", () => {
    const { physics, sweep, character } = setup();
    physics.step();
    const pitch = (60 * Math.PI) / 180;

    const fit = fitCamera(character, 0, pitch, sweep);
    expect(fit.distance).toBeLessThan(CAMERA_DISTANCE);
    const { position } = computeCameraPose(character, 0, pitch, fit);
    expect(position.y).toBeGreaterThan(CAMERA_COLLISION_RADIUS - 0.01);
    physics.dispose();
  });

  it("tells a camera inside a wall from one that only has its view blocked", () => {
    const { physics, character } = setup();
    // A thin wall between the character and the camera, 2 m behind the character.
    physics.addStaticBox({ x: 0, y: 2, z: 2.1 }, { x: 10, y: 2, z: 0.1 });
    physics.step();
    const player = undefined;

    const { position: behindWall } = computeCameraPose(character, 0, 0);
    expect(physics.overlapsSphere(behindWall, CAMERA_COLLISION_RADIUS, player)).toBe(false);

    const insideWall = { x: behindWall.x, y: behindWall.y, z: 2.1 };
    expect(physics.overlapsSphere(insideWall, CAMERA_COLLISION_RADIUS, player)).toBe(true);
    physics.dispose();
  });

  it("keeps the shoulder point out of a wall on the right", () => {
    const { physics, sweep, character } = setup();
    // Wall whose near face is 0.4 m to the right of the character's centre.
    physics.addStaticBox({ x: 0.9, y: 2, z: 0 }, { x: 0.5, y: 2, z: 10 });
    physics.step();

    const fit = fitCamera(character, 0, 0, sweep);
    expect(fit.shoulderOffset).toBeCloseTo(0.4 - CAMERA_COLLISION_RADIUS, 2);
    const { position } = computeCameraPose(character, 0, 0, fit);
    expect(position.x).toBeLessThan(0.4);
    physics.dispose();
  });
});
