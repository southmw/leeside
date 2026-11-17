import type { InstancedMesh, Mesh, Object3D } from "three";
import type { PhysicsWorld } from "../physics/physicsWorld";
import { createBuildingBoxMesh } from "../render/buildingMesh";
import { createPropMesh, createRockMesh, ROCK_HEIGHT_RATIO, type RockInstance } from "../render/propMesh";
import type { SceneLike } from "../render/renderSync";
import { createTerrainMesh } from "../render/terrainMesh";
import { boundaryWalls } from "./boundary";
import { buildingBoxes } from "./building";
import { DEFAULT_PROP_SET, type PropSetId } from "./propModels";
import { type PropBox, propBox } from "./props";
import { scatterItems } from "./scatter";
import { buildTerrainGeometry, createHeightfield, heightAt, type Heightfield } from "./terrain";
import type { ZoneDefinition, ZoneProp } from "./zoneDefinition";

/** Rocks at least this large (rough radius in metres) block movement; smaller ones do not. */
export const ROCK_COLLIDER_MIN_SIZE = 0.7;

/** A zone that has been put into the world. */
export interface LoadedZone {
  readonly definition: ZoneDefinition;
  /** Terrain heights, for placing things on the ground. */
  readonly terrain: Heightfield;
  /** How many rocks were scattered. */
  readonly rockCount: number;
  /** How many props are drawn with a model instead of their box. */
  readonly propModelCount: number;
  /** Whether the rocks are drawn with models. */
  readonly rocksModelled: boolean;
  /**
   * Takes everything the zone added out of the physics world and the scene again and frees
   * the GPU resources. Zone changes rely on this to not leak.
   */
  unload(): void;
}

export interface ZoneLoadOptions {
  /** The set of models the props' sizes are taken from (world/propModels.ts). */
  propSet?: PropSetId;
  /**
   * Gives the model a prop is drawn with, fitted to its box, or undefined to draw the box.
   * Without this every prop is a box.
   */
  propModel?(prop: ZoneProp, box: PropBox): Object3D | undefined;
  /**
   * Gives the rocks that are obstacles drawn with models, or undefined to draw them as plain
   * shapes like the small ones.
   */
  rockModels?(rocks: readonly RockInstance[]): InstancedMesh[] | undefined;
  /** Colour of the rocks drawn as plain shapes, to go with the rock models. */
  pebbleColor?: number;
}

/**
 * Builds a zone from its definition: terrain, buildings, props, scattered rocks and the
 * invisible walls along its edges. Pictures and colliders are made from the same shapes.
 */
export function loadZone(
  definition: ZoneDefinition,
  physics: PhysicsWorld,
  scene: SceneLike,
  options: ZoneLoadOptions = {},
): LoadedZone {
  const bodies: number[] = [];
  const meshes: Mesh[] = [];
  // Models are shared with other zones and stay loaded; they are only taken out of the scene.
  const models: Object3D[] = [];
  const rockMeshes: InstancedMesh[] = [];
  const propSet = options.propSet ?? DEFAULT_PROP_SET;
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
    const box = propBox(prop, heightAt(terrain, prop.position[0], prop.position[1]), propSet);
    bodies.push(physics.addStaticBox(box.center, box.halfExtents, 0, box.yaw));
    const model = options.propModel?.(prop, box);
    if (model) {
      models.push(model);
      scene.add(model);
    } else {
      show(createPropMesh(box));
    }
  }

  // Rocks: drawn as one instanced mesh. Only those big enough to be obstacles get a collider;
  // pebbles the character would trip over are just decoration.
  const rocks: RockInstance[] = [];
  for (const scatter of definition.scatter) {
    for (const item of scatterItems(definition, scatter, propSet)) {
      // Half buried, so rocks sit in the ground rather than on it.
      const groundY = heightAt(terrain, item.x, item.z);
      const y = groundY + item.size * ROCK_HEIGHT_RATIO * 0.3;
      rocks.push({ ...item, y, groundY });
      if (item.size >= ROCK_COLLIDER_MIN_SIZE) {
        // A box somewhat inside the rock's outline, so its corners do not stick out invisibly.
        const half = item.size * 0.75;
        bodies.push(
          physics.addStaticBox({ x: item.x, y, z: item.z }, { x: half, y: item.size * ROCK_HEIGHT_RATIO * 0.8, z: half }, 0, item.yaw),
        );
      }
    }
  }
  // Only the rocks that are obstacles get a model. A model has ten times the triangles of
  // the plain shape, and most of the thousand rocks are too small to tell the difference.
  const large = rocks.filter((rock) => rock.size >= ROCK_COLLIDER_MIN_SIZE);
  const modelled = large.length > 0 ? options.rockModels?.(large) : undefined;
  for (const mesh of modelled ?? []) {
    rockMeshes.push(mesh);
    scene.add(mesh);
  }
  const plain = modelled ? rocks.filter((rock) => rock.size < ROCK_COLLIDER_MIN_SIZE) : rocks;
  if (plain.length > 0) {
    show(createRockMesh(plain, modelled ? options.pebbleColor : undefined));
  }

  for (const wall of boundaryWalls(definition.size)) {
    bodies.push(physics.addStaticBox(wall.center, wall.halfExtents));
  }

  return {
    definition,
    terrain,
    rockCount: rocks.length,
    propModelCount: models.length,
    rocksModelled: rockMeshes.length > 0,
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
      for (const model of models) {
        scene.remove(model);
      }
      // Rock meshes share the models' geometry; only their own per-rock data is freed.
      for (const mesh of rockMeshes) {
        scene.remove(mesh);
        mesh.dispose();
      }
      rockMeshes.length = 0;
      bodies.length = 0;
      meshes.length = 0;
      models.length = 0;
    },
  };
}
