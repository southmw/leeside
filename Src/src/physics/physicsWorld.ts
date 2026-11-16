import RAPIER from "@dimforge/rapier3d-compat";
import { TICK_SECONDS } from "../core/fixedTimestep";
import { yawFromQuaternion } from "../core/math";
import { CHARACTER_HEIGHT, CHARACTER_RADIUS, GRAVITY } from "../data/tuning";

/**
 * Thin wrapper around Rapier. The rest of the game talks to this class and to body handles
 * (plain numbers), never to Rapier objects, so components stay plain data.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Where a body is. Matches the fields of the `transform` component. */
export interface BodyPose extends Vec3 {
  rotationY: number;
}

/**
 * Gap the character controller keeps between a character and whatever it touches, in metres.
 * Without it the capsule would rest exactly on surfaces and catch on them through rounding.
 */
export const CHARACTER_SKIN = 0.02;

/** Loads the physics engine's WebAssembly. Must finish before a PhysicsWorld is created. */
export async function initPhysics(): Promise<void> {
  await RAPIER.init();
}

export class PhysicsWorld {
  private readonly world: RAPIER.World;
  /** One controller serves every character; it holds settings, not per-character state. */
  private readonly characterController: RAPIER.KinematicCharacterController;

  constructor(gravity: number = GRAVITY, tickSeconds: number = TICK_SECONDS) {
    this.world = new RAPIER.World({ x: 0, y: -gravity, z: 0 });
    this.world.timestep = tickSeconds;
    this.characterController = this.world.createCharacterController(CHARACTER_SKIN);
  }

  /** Adds an immovable box (ground, walls). Sizes are half extents, as Rapier takes them. */
  addStaticBox(center: Vec3, halfExtents: Vec3): number {
    return this.addBox(RAPIER.RigidBodyDesc.fixed(), center, halfExtents);
  }

  /** Adds a box that falls and collides. */
  addDynamicBox(center: Vec3, halfExtents: Vec3): number {
    return this.addBox(RAPIER.RigidBodyDesc.dynamic(), center, halfExtents);
  }

  /**
   * Adds an upright capsule that is moved with `moveCharacter` instead of by forces.
   * `center` is the middle of the capsule, so standing on ground at height h means
   * h + height / 2 + CHARACTER_SKIN.
   */
  addCharacter(center: Vec3, height: number = CHARACTER_HEIGHT, radius: number = CHARACTER_RADIUS): number {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(center.x, center.y, center.z),
    );
    this.world.createCollider(RAPIER.ColliderDesc.capsule(height / 2 - radius, radius), body);
    return body.handle;
  }

  /**
   * Moves a character by `desired`, shortened and bent along surfaces where something is in
   * the way. The new position takes effect on the next `step`. Obstacles are known to the
   * physics world from the step after they were added.
   */
  moveCharacter(handle: number, desired: Vec3): void {
    const body = this.world.getRigidBody(handle);
    const collider = body?.collider(0);
    if (!body || !collider) {
      return;
    }
    this.characterController.computeColliderMovement(collider, desired);
    const movement = this.characterController.computedMovement();
    const position = body.translation();
    body.setNextKinematicTranslation({
      x: position.x + movement.x,
      y: position.y + movement.y,
      z: position.z + movement.z,
    });
  }

  /** Removes a body and its colliders. Unknown handles are ignored. */
  removeBody(handle: number): void {
    const body = this.world.getRigidBody(handle);
    if (body) {
      this.world.removeRigidBody(body);
    }
  }

  /** Advances the simulation by one fixed step. */
  step(): void {
    this.world.step();
  }

  /** Copies a body's pose into `out`. Returns false if the body does not exist. */
  readPose(handle: number, out: BodyPose): boolean {
    const body = this.world.getRigidBody(handle);
    if (!body) {
      return false;
    }
    const position = body.translation();
    out.x = position.x;
    out.y = position.y;
    out.z = position.z;
    out.rotationY = yawFromQuaternion(body.rotation());
    return true;
  }

  /** Speed of a body in m/s, or 0 if it does not exist. */
  speedOf(handle: number): number {
    const velocity = this.world.getRigidBody(handle)?.linvel();
    return velocity ? Math.hypot(velocity.x, velocity.y, velocity.z) : 0;
  }

  get bodyCount(): number {
    return this.world.bodies.len();
  }

  /** Frees the WebAssembly memory. The world must not be used afterwards. */
  dispose(): void {
    this.world.removeCharacterController(this.characterController);
    this.world.free();
  }

  private addBox(description: RAPIER.RigidBodyDesc, center: Vec3, halfExtents: Vec3): number {
    const body = this.world.createRigidBody(description.setTranslation(center.x, center.y, center.z));
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z), body);
    return body.handle;
  }
}
