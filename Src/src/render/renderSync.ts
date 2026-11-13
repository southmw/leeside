import type { Object3D } from "three";
import type { GameWorld } from "../core/ecs";

/** Minimal scene interface, so the sync can be tested without a renderer. */
export interface SceneLike {
  add(object: Object3D): unknown;
  remove(object: Object3D): unknown;
}

export interface RenderSync {
  /** Copies each entity's transform onto its Three.js object. Call once per rendered frame. */
  sync(): void;
  dispose(): void;
}

/**
 * Keeps the Three.js scene in step with the ECS world: entities with `transform` and
 * `renderable` get their object added to the scene, and removed again when they leave.
 */
export function createRenderSync(world: GameWorld, scene: SceneLike): RenderSync {
  const drawable = world.with("transform", "renderable");

  for (const entity of drawable) {
    scene.add(entity.renderable.object);
  }
  const unsubscribeAdded = drawable.onEntityAdded.subscribe((entity) => {
    scene.add(entity.renderable.object);
  });
  const unsubscribeRemoved = drawable.onEntityRemoved.subscribe((entity) => {
    scene.remove(entity.renderable.object);
  });

  return {
    sync(): void {
      for (const { transform, renderable } of drawable) {
        renderable.object.position.set(transform.x, transform.y, transform.z);
        renderable.object.rotation.y = transform.rotationY;
      }
    },
    dispose(): void {
      unsubscribeAdded();
      unsubscribeRemoved();
    },
  };
}
