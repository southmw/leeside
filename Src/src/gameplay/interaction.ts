import type { GameWorld } from "../core/ecs";
import type { PhysicsWorld } from "../physics/physicsWorld";
import {
  CHARACTER_HEIGHT,
  INTERACT_ANGLE_DEGREES,
  INTERACT_DISTANCE,
  INTERACT_HEIGHT,
  INTERACT_NEAR_DISTANCE,
} from "../data/tuning";

/**
 * Interaction targets (prototype design 3.5): of the things near a character, the one it can
 * use right now. Near means within reach of the character; "looked at" goes by where the view
 * points, level, not by the character's body (which turns with movement) and not by the
 * camera's position, so the same target is picked however far back or high up the camera is.
 * Nothing solid may stand between the two: a cabinet is not reached through the wall behind it.
 */

/** How far above the ground a target stands on the line to it is aimed, in metres: into its box rather than at its foot. */
export const TARGET_SIGHT_HEIGHT = 0.5;

/** Something that can be used, and the spot to be near: `y` is the height of the ground or floor it stands on. */
export interface InteractionCandidate {
  id: string;
  x: number;
  y: number;
  z: number;
  /** Handle of the body that is the thing itself, if it has one. */
  solid?: number;
}

const MAX_ANGLE = (INTERACT_ANGLE_DEGREES * Math.PI) / 180;

/**
 * The id of the candidate a character can use, or null. `x` and `z` are the character's
 * centre, `feetY` the height of its feet, `viewYaw` its view (radians counter-clockwise seen
 * from above, 0 facing -Z). Of several, the one the view points at most directly wins, and of
 * equally direct ones the nearer. `inSight`, if given, says whether the way to a candidate is
 * free; one it turns down is left out.
 */
export function pickInteractionTarget(
  from: { x: number; feetY: number; z: number },
  viewYaw: number,
  candidates: Iterable<InteractionCandidate>,
  inSight?: (candidate: InteractionCandidate) => boolean,
): string | null {
  const forwardX = -Math.sin(viewYaw);
  const forwardZ = -Math.cos(viewYaw);
  let best: { id: string; angle: number; distance: number } | undefined;

  for (const candidate of candidates) {
    if (Math.abs(candidate.y - from.feetY) > INTERACT_HEIGHT) {
      continue;
    }
    const dx = candidate.x - from.x;
    const dz = candidate.z - from.z;
    const distance = Math.hypot(dx, dz);
    if (distance > INTERACT_DISTANCE) {
      continue;
    }
    // On top of the target there is no direction to it, so it counts as straight ahead.
    const angle =
      distance <= INTERACT_NEAR_DISTANCE
        ? 0
        : Math.acos(Math.min(Math.max((dx * forwardX + dz * forwardZ) / distance, -1), 1));
    if (angle > MAX_ANGLE) {
      continue;
    }
    const better = !best || angle < best.angle || (angle === best.angle && distance < best.distance);
    // Asked last and only of a candidate that would win: it is the costly test.
    if (better && (!inSight || inSight(candidate))) {
      best = { id: candidate.id, angle, distance };
    }
  }
  return best?.id ?? null;
}

/**
 * Notes on every entity that can interact which target it has, each step. A character that
 * has collapsed has none. Runs after the physics step, so it goes by where characters now are.
 * With `physics`, a target with a wall, a rock or anything else solid in the way is left out.
 */
export function createInteractionSystem(world: GameWorld, physics?: Pick<PhysicsWorld, "firstBodyBetween">): () => void {
  const targets = world.with("interactable", "transform");
  const seekers = world.with("interaction", "transform", "view");
  const candidates: InteractionCandidate[] = [];
  return () => {
    candidates.length = 0;
    for (const { interactable, transform } of targets) {
      candidates.push({ id: interactable.id, x: transform.x, y: transform.y, z: transform.z, solid: interactable.solid });
    }
    for (const seeker of seekers) {
      if (seeker.health && seeker.health.current <= 0) {
        seeker.interaction.target = null;
        continue;
      }
      // A character's position is its capsule's centre.
      const feetY = seeker.transform.y - CHARACTER_HEIGHT / 2;
      const eye = seeker.transform;
      const self = seeker.body?.handle;
      seeker.interaction.target = pickInteractionTarget(
        { x: eye.x, feetY, z: eye.z },
        seeker.view.yaw,
        candidates,
        physics &&
          ((candidate) => {
            const inTheWay = physics.firstBodyBetween(eye, { x: candidate.x, y: candidate.y + TARGET_SIGHT_HEIGHT, z: candidate.z }, self);
            return inTheWay === undefined || inTheWay === candidate.solid;
          }),
      );
    }
  };
}
