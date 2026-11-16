import type { Object3D } from "three";
import type { Entity, GameWorld, Transform } from "../core/ecs";
import { lerp, lerpAngle } from "../core/math";

/** Minimal scene interface, so the sync can be tested without a renderer. */
export interface SceneLike {
  add(object: Object3D): unknown;
  remove(object: Object3D): unknown;
}

export interface RenderSync {
  /**
   * Remembers where every entity is now. Call at the start of each simulation step, before
   * anything moves, so that `sync` can blend from here to where the step ends.
   */
  capture(): void;
  /**
   * Places each entity's Three.js object between its captured and its current transform.
   * `alpha` runs from 0 (the captured state) to 1 (the current state); the game loop passes
   * how far the display is between the last two simulation steps. Call once per rendered frame.
   */
  sync(alpha?: number): void;
  /**
   * Forgets the captured state of one entity, or of all. Use after moving something a long
   * way in one go (a teleport, a zone change), so it is not drawn sliding across the gap.
   */
  snap(entity?: Entity): void;
  dispose(): void;
}

/**
 * Keeps the Three.js scene in step with the ECS world: entities with `transform` and
 * `renderable` get their object added to the scene, and removed again when they leave.
 *
 * The simulation advances in fixed steps while the display draws at its own rate, so drawing
 * the latest state as it is makes movement judder. Objects are therefore drawn between the
 * previous and the current step. The previous state is kept here rather than in a component:
 * it only matters for drawing and must not be saved or sent over the network.
 */
export function createRenderSync(world: GameWorld, scene: SceneLike): RenderSync {
  const drawable = world.with("transform", "renderable");
  const captured = new Map<Entity, Transform>();

  for (const entity of drawable) {
    scene.add(entity.renderable.object);
  }
  const unsubscribeAdded = drawable.onEntityAdded.subscribe((entity) => {
    scene.add(entity.renderable.object);
  });
  const unsubscribeRemoved = drawable.onEntityRemoved.subscribe((entity) => {
    scene.remove(entity.renderable.object);
    captured.delete(entity);
  });

  return {
    capture(): void {
      for (const entity of drawable) {
        const previous = captured.get(entity);
        if (previous) {
          Object.assign(previous, entity.transform);
        } else {
          captured.set(entity, { ...entity.transform });
        }
      }
    },
    sync(alpha = 1): void {
      for (const entity of drawable) {
        const { transform, renderable } = entity;
        // An entity that has not been through a step yet has nothing to blend from.
        const previous = captured.get(entity) ?? transform;
        renderable.object.position.set(
          lerp(previous.x, transform.x, alpha),
          lerp(previous.y, transform.y, alpha),
          lerp(previous.z, transform.z, alpha),
        );
        renderable.object.rotation.y = lerpAngle(previous.rotationY, transform.rotationY, alpha);
      }
    },
    snap(entity?: Entity): void {
      if (entity) {
        captured.delete(entity);
      } else {
        captured.clear();
      }
    },
    dispose(): void {
      unsubscribeAdded();
      unsubscribeRemoved();
      captured.clear();
    },
  };
}
