import type { Mesh } from "three";
import type { PhysicsWorld } from "../physics/physicsWorld";
import { createBuildingBoxMesh } from "../render/buildingMesh";
import { createPropMesh, createRockMesh, ROCK_HEIGHT_RATIO, type RockInstance } from "../render/propMesh";
import type { SceneLike } from "../render/renderSync";
import { createTerrainMesh } from "../render/terrainMesh";
import { boundaryWalls } from "./boundary";
import { buildingBoxes } from "./building";
import { propBox } from "./props";
import { scatterItems } from "./scatter";
import { buildTerrainGeometry, createHeightfield, heightAt, type Heightfield } from "./terrain";
import type { ZoneDefinition } from "./zoneDefinition";

/** Rocks at least this large (rough radius in metres) block movement; smaller ones do not. */
export const ROCK_COLLIDER_MIN_SIZE = 0.7;

/** A zone that has been put into the world. */
export interface LoadedZone {
  readonly definition: ZoneDefinition;
  /** Terrain heights, for placing things on the ground. */
  readonly terrain: Heightfield;
  /** How many rocks were scattered. */
  readonly rockCount: number;
  /**
   * Takes everything the zone added out of the physics world and the scene again and frees
   * the GPU resources. Zone changes rely on this to not leak.
   */
  unload(): void;
}

/**
 * Builds a zone from its definition: terrain, buildings, props, scattered rocks and the
 * invisible walls along its edges. Pictures and colliders are made from the same shapes.
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

  for (const prop of definition.props) {
    const box = propBox(prop, heightAt(terrain, prop.position[0], prop.position[1]));
    bodies.push(physics.addStaticBox(box.center, box.halfExtents, 0, box.yaw));
    show(createPropMesh(box));
  }

  // Rocks: drawn as one instanced mesh. Only those big enough to be obstacles get a collider;
  // pebbles the character would trip over are just decoration.
  const rocks: RockInstance[] = [];
  for (const scatter of definition.scatter) {
    for (const item of scatterItems(definition, scatter)) {
      // Half buried, so rocks sit in the ground rather than on it.
      const y = heightAt(terrain, item.x, item.z) + item.size * ROCK_HEIGHT_RATIO * 0.3;
      rocks.push({ ...item, y });
      if (item.size >= ROCK_COLLIDER_MIN_SIZE) {
        // A box somewhat inside the rock's outline, so its corners do not stick out invisibly.
        const half = item.size * 0.75;
        bodies.push(
          physics.addStaticBox({ x: item.x, y, z: item.z }, { x: half, y: item.size * ROCK_HEIGHT_RATIO * 0.8, z: half }, 0, item.yaw),
        );
      }
    }
  }
  if (rocks.length > 0) {
    show(createRockMesh(rocks));
  }

  for (const wall of boundaryWalls(definition.size)) {
    bodies.push(physics.addStaticBox(wall.center, wall.halfExtents));
  }

  return {
    definition,
    terrain,
    rockCount: rocks.length,
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
