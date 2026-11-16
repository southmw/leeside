import RAPIER from "@dimforge/rapier3d-compat";
import { TICK_SECONDS } from "../core/fixedTimestep";
import { yawFromQuaternion } from "../core/math";
import { CHARACTER_HEIGHT, CHARACTER_RADIUS, GRAVITY, MAX_SLOPE_DEGREES } from "../data/tuning";

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

/**
 * A character walking down a slope or off a small ledge is pulled back to the ground if it
 * would end up less than this far above it, in metres. Without it, walking downhill becomes
 * a series of tiny falls.
 */
const GROUND_SNAP_DISTANCE = 0.2;

/** How far below a character the surface it rests on is looked for: past the skin and the snap distance. */
const GROUND_PROBE_DISTANCE = CHARACTER_SKIN + GROUND_SNAP_DISTANCE + 0.1;
/** Upward movement smaller than this is rounding, not the controller lifting the character. */
const LIFT_TOLERANCE = 1e-4;
/** Cosine of the steepest walkable slope: a surface is walkable if its normal's Y is at least this. */
const WALKABLE_NORMAL_Y = Math.cos((MAX_SLOPE_DEGREES * Math.PI) / 180);

/** What actually happened to a character's requested movement. */
export interface CharacterMove extends Vec3 {
  /** Whether the character is standing on walkable ground after the move. */
  grounded: boolean;
}

/** Loads the physics engine's WebAssembly. Must finish before a PhysicsWorld is created. */
export async function initPhysics(): Promise<void> {
  await RAPIER.init();
}

export class PhysicsWorld {
  private readonly world: RAPIER.World;
  /** One controller serves every character; it holds settings, not per-character state. */
  private readonly characterController: RAPIER.KinematicCharacterController;
  /**
   * True while bodies have been added or removed since the last step. Rapier refreshes what
   * its collision queries can see only during a step, so until then a character would walk
   * straight through anything new. Worse, once it overlaps a surface's skin the controller no
   * longer holds it reliably and it sinks in. Characters therefore wait for the next step.
   */
  private queriesStale = true;

  constructor(gravity: number = GRAVITY, tickSeconds: number = TICK_SECONDS) {
    this.world = new RAPIER.World({ x: 0, y: -gravity, z: 0 });
    this.world.timestep = tickSeconds;
    this.characterController = this.world.createCharacterController(CHARACTER_SKIN);
    const maxSlope = (MAX_SLOPE_DEGREES * Math.PI) / 180;
    this.characterController.setMaxSlopeClimbAngle(maxSlope);
    this.characterController.setMinSlopeSlideAngle(maxSlope);
    this.characterController.enableSnapToGround(GROUND_SNAP_DISTANCE);
  }

  /**
   * Adds an immovable box (ground, walls, ramps). Sizes are half extents, as Rapier takes
   * them. `pitch` tilts the box around the X axis, in radians, which turns it into a ramp
   * rising towards -Z for positive values.
   */
  addStaticBox(center: Vec3, halfExtents: Vec3, pitch = 0): number {
    const description = RAPIER.RigidBodyDesc.fixed().setRotation({
      x: Math.sin(pitch / 2),
      y: 0,
      z: 0,
      w: Math.cos(pitch / 2),
    });
    return this.addBox(description, center, halfExtents);
  }

  /** Adds a box that falls and collides. */
  addDynamicBox(center: Vec3, halfExtents: Vec3): number {
    return this.addBox(RAPIER.RigidBodyDesc.dynamic(), center, halfExtents);
  }

  /**
   * Adds immovable terrain from triangles: `positions` holds x, y, z per vertex and `indices`
   * three vertices per triangle. Contacts are corrected along the edges between triangles, so
   * a character crossing them is not tripped by the seams.
   */
  addStaticMesh(positions: Float32Array, indices: Uint32Array): number {
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    this.world.createCollider(
      RAPIER.ColliderDesc.trimesh(positions, indices, RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES),
      body,
    );
    this.queriesStale = true;
    return body.handle;
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
    this.queriesStale = true;
    return body.handle;
  }

  /**
   * Moves a character by `desired`, shortened and bent along surfaces where something is in
   * the way, and reports the movement that fitted. The new position takes effect on the next
   * `step`. Returns undefined, without moving, if the character does not exist or if bodies
   * were added or removed since the last step (see `queriesStale`); the caller simply tries
   * again on the next step.
   *
   * Two rules are added to what Rapier's controller does by itself:
   * - Standing on a slope steeper than the limit does not count as grounded, so the character
   *   keeps falling, slides off, and cannot jump from there.
   * - A character in the air is never lifted by what it bumps into. The capsule's round
   *   bottom would otherwise ride up over a ledge's edge or up a steep slope, adding up to its
   *   radius to the jump height. Such a bump stops the sideways movement instead.
   *
   * `wasGrounded` is whether the character stood on the ground before this move.
   */
  moveCharacter(handle: number, desired: Vec3, wasGrounded: boolean): CharacterMove | undefined {
    const body = this.world.getRigidBody(handle);
    const collider = body?.collider(0);
    if (!body || !collider || this.queriesStale) {
      return undefined;
    }
    const controller = this.characterController;
    const position = body.translation();
    const groundedAfter = (movement: Vec3): boolean =>
      controller.computedGrounded() && this.isWalkableBelow(collider, body, position, movement);

    controller.computeColliderMovement(collider, desired);
    let movement = controller.computedMovement();
    let grounded = groundedAfter(movement);

    const lifted = movement.y > Math.max(desired.y, 0) + LIFT_TOLERANCE;
    if (!wasGrounded && lifted) {
      controller.computeColliderMovement(collider, { x: 0, y: desired.y, z: 0 });
      movement = controller.computedMovement();
      grounded = groundedAfter(movement);
    }

    body.setNextKinematicTranslation({
      x: position.x + movement.x,
      y: position.y + movement.y,
      z: position.z + movement.z,
    });
    return { x: movement.x, y: movement.y, z: movement.z, grounded };
  }

  /**
   * Whether what a character rests on, once it has moved by `movement`, is flat enough to
   * stand on. The capsule itself is swept down a short way and the slope is read where it
   * touches, so a capsule leaning on a steep slope or hanging on a ledge's corner by its
   * round bottom is not standing, whatever lies under its centre. Finding nothing means not
   * standing either: Rapier's controller also reports ground for a character that is in the
   * air but pressed against a wall, which would let it hang there.
   */
  private isWalkableBelow(collider: RAPIER.Collider, body: RAPIER.RigidBody, position: Vec3, movement: Vec3): boolean {
    const hit = this.world.castShape(
      { x: position.x + movement.x, y: position.y + movement.y, z: position.z + movement.z },
      collider.rotation(),
      { x: 0, y: -1, z: 0 },
      collider.shape,
      0,
      GROUND_PROBE_DISTANCE,
      false,
      undefined,
      undefined,
      collider,
      body,
    );
    // The two normals of a hit are opposite, so the magnitude is the same whichever is read.
    return hit !== null && Math.abs(hit.normal1.y) >= WALKABLE_NORMAL_Y;
  }

  /** Removes a body and its colliders. Unknown handles are ignored. */
  removeBody(handle: number): void {
    const body = this.world.getRigidBody(handle);
    if (body) {
      this.world.removeRigidBody(body);
      this.queriesStale = true;
    }
  }

  /** Advances the simulation by one fixed step. */
  step(): void {
    this.world.step();
    this.queriesStale = false;
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

  /**
   * Sweeps a sphere from `origin` along the unit vector `direction` and returns how far its
   * centre travels before the sphere touches something, or undefined if it travels
   * `maxDistance` freely. `ignoreBody` is left out of the test (the character the camera
   * belongs to, for example). Sees the world as of the last step.
   */
  sweepSphere(origin: Vec3, direction: Vec3, maxDistance: number, radius: number, ignoreBody?: number): number | undefined {
    const ignored = ignoreBody === undefined ? undefined : (this.world.getRigidBody(ignoreBody) ?? undefined);
    const hit = this.world.castShape(
      origin,
      { x: 0, y: 0, z: 0, w: 1 },
      direction,
      new RAPIER.Ball(radius),
      0,
      maxDistance,
      true,
      undefined,
      undefined,
      undefined,
      ignored,
    );
    return hit ? hit.time_of_impact : undefined;
  }

  /** Whether a sphere at `center` touches anything, leaving out `ignoreBody`. Sees the world as of the last step. */
  overlapsSphere(center: Vec3, radius: number, ignoreBody?: number): boolean {
    const ignored = ignoreBody === undefined ? undefined : (this.world.getRigidBody(ignoreBody) ?? undefined);
    const hit = this.world.intersectionWithShape(
      center,
      { x: 0, y: 0, z: 0, w: 1 },
      new RAPIER.Ball(radius),
      undefined,
      undefined,
      undefined,
      ignored,
    );
    return hit !== null;
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
    this.queriesStale = true;
    return body.handle;
  }
}
