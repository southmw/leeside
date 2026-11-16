import type { Mesh } from "three";
import type { PhysicsWorld } from "../physics/physicsWorld";
import { createBuildingBoxMesh } from "../render/buildingMesh";
import type { SceneLike } from "../render/renderSync";
import { createTerrainMesh } from "../render/terrainMesh";
import { buildingBoxes } from "./building";
import { buildTerrainGeometry, createHeightfield, heightAt, type Heightfield } from "./terrain";
import type { ZoneDefinition } from "./zoneDefinition";

/** A zone that has been put into the world. */
export interface LoadedZone {
  readonly definition: ZoneDefinition;
  /** Terrain heights, for placing things on the ground. */
  readonly terrain: Heightfield;
  /**
   * Takes everything the zone added out of the physics world and the scene again and frees
   * the GPU resources. Zone changes rely on this to not leak.
   */
  unload(): void;
}

/**
 * Builds a zone from its definition: terrain and buildings, each as a picture and a collider
 * made from the same shapes.
 */
export function loadZone(definition: ZoneDefinition, physics: PhysicsWorld, scene: SceneLike): LoadedZone {
  const bodies: number[] = [];
  const meshes: Mesh[] = [];
  const show = (mesh: Mesh): void => {
    meshes.push(mesh);
    scene.add(mesh);
  };

  const terrain = createHeightfield(definition.terrain.samples, definition.size, definition.terrain.heights);
  const geometry = buildTerrainGeometry(terrain);
  bodies.push(physics.addStaticMesh(geometry.positions, geometry.indices));
  show(createTerrainMesh(geometry));

  for (const building of definition.buildings) {
    const [east, south] = building.position;
    // A building stands at the height of the ground under its centre; the terrain is levelled there.
    for (const box of buildingBoxes(building, heightAt(terrain, east, south))) {
      bodies.push(physics.addStaticBox(box.center, box.halfExtents, 0, box.yaw));
      show(createBuildingBoxMesh(box));
    }
  }

  return {
    definition,
    terrain,
    unload(): void {
      for (const handle of bodies) {
        physics.removeBody(handle);
      }
      for (const mesh of meshes) {
        scene.remove(mesh);
        mesh.geometry.dispose();
        for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          material.dispose();
        }
      }
      bodies.length = 0;
      meshes.length = 0;
    },
  };
}
