import type { InstancedMesh, Mesh, MeshStandardMaterial, Object3D } from "three";
import { type Container, createTransform, type Entity, type GameWorld } from "../core/ecs";
import type { PhysicsWorld } from "../physics/physicsWorld";
import { createBuildingBoxMesh } from "../render/buildingMesh";
import { createPropMesh, createRockMesh, ROCK_HEIGHT_RATIO, type RockInstance } from "../render/propMesh";
import type { SceneLike } from "../render/renderSync";
import { createTerrainMesh } from "../render/terrainMesh";
import { boundaryWalls } from "./boundary";
import { buildingBoxes, buildingShelterZone } from "./building";
import { OPENED_SHADE, placeContainer } from "./containers";
import { exitBox, interiorShell, interiorShelterZone } from "./interior";
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
  /** How many shelter zones the zone put into the ECS world. */
  readonly shelterZoneCount: number;
  /** How many containers the zone has. */
  readonly containerCount: number;
  /**
   * Draws every container as open or closed, as its state now says. Call when a state may
   * have changed; only those that did are touched.
   */
  showContainers(): void;
  /**
   * Takes everything the zone added out of the physics world and the scene again and frees
   * the GPU resources. Zone changes rely on this to not leak.
   */
  unload(): void;
}

export interface ZoneLoadOptions {
  /** The ECS world the zone's entities (shelter zones, containers) go into. Without it none are made. */
  world?: GameWorld;
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
  /**
   * Gives the state of a container (opened, what is left in it). The game keeps these, so
   * that they are still there when the zone is put up again. Without this every container is
   * closed and holds only what the zone fixes.
   */
  containerState?(id: string): Container | undefined;
}

/**
 * Builds a zone from its definition: terrain, buildings, props, containers, scattered rocks
 * and the invisible walls along its edges. Pictures and colliders are made from the same shapes.
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
  const entities: Entity[] = [];
  const propSet = options.propSet ?? DEFAULT_PROP_SET;
  let shelterZoneCount = 0;
  const propBodies = new Map<string, number>();
  /** How each container is drawn, with the state it follows and the state it was last drawn in. */
  const containerLooks: Array<{ state: Container; shown: boolean; apply(opened: boolean): void }> = [];
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
    const groundHeight = heightAt(terrain, east, south);
    for (const box of buildingBoxes(building, groundHeight)) {
      bodies.push(physics.addStaticBox(box.center, box.halfExtents, 0, box.yaw));
      show(createBuildingBoxMesh(box));
    }
    const shelter = buildingShelterZone(building, groundHeight);
    if (shelter && options.world) {
      entities.push(options.world.add(shelter));
      shelterZoneCount += 1;
    }
  }

  for (const prop of definition.props) {
    const box = propBox(prop, heightAt(terrain, prop.position[0], prop.position[1]), propSet);
    const body = physics.addStaticBox(box.center, box.halfExtents, 0, box.yaw);
    bodies.push(body);
    propBodies.set(prop.id, body);
    // The shelter's door can be looked at: it says how far its repair is.
    if (prop.kind === "shelter_door" && options.world) {
      const [east, south] = prop.position;
      entities.push(
        options.world.add({
          transform: createTransform(east, heightAt(terrain, east, south), south),
          interactable: { id: prop.id, kind: "repair", solid: body },
        }),
      );
    }
    const model = options.propModel?.(prop, box);
    if (model) {
      models.push(model);
      scene.add(model);
    } else {
      show(createPropMesh(box));
    }
  }

  // Containers: cabinets and crates are boxes of their own; a trunk is the back of its car.
  // Each is an entity, so that players can find it (gameplay/interaction.ts).
  for (const container of definition.containers) {
    const placed = placeContainer(container, definition, (east, south) => heightAt(terrain, east, south), propSet);
    const state: Container = options.containerState?.(container.id) ?? {
      kind: container.kind,
      opened: false,
      items: (container.contents ?? []).map((stack) => ({ ...stack })),
    };
    // The solid thing a container is: its own box, or for a trunk its car.
    let solid = container.kind === "trunk" ? propBodies.get(container.prop) : undefined;
    if (placed.box) {
      solid = physics.addStaticBox(placed.box.center, placed.box.halfExtents, 0, placed.box.yaw);
      bodies.push(solid);
      const mesh = createPropMesh(placed.box);
      show(mesh);
      // Opened, a cabinet or crate is drawn darker.
      const material = mesh.material as MeshStandardMaterial;
      const closedColor = material.color.getHex();
      containerLooks.push({
        state,
        shown: false,
        apply: (opened) => {
          material.color.setHex(closedColor);
          if (opened) {
            material.color.multiplyScalar(OPENED_SHADE);
          }
        },
      });
    } else if (placed.lid) {
      // Opened, a trunk has its lid up.
      const lid = createPropMesh(placed.lid);
      lid.visible = false;
      show(lid);
      containerLooks.push({
        state,
        shown: false,
        apply: (opened) => {
          lid.visible = opened;
        },
      });
    }
    if (options.world) {
      entities.push(
        options.world.add({
          transform: createTransform(placed.point.x, placed.point.y, placed.point.z),
          interactable: { id: placed.id, kind: "search", ...(solid === undefined ? {} : { solid }) },
          container: state,
        }),
      );
    }
  }

  // Ways out that can be used: each is an entity to interact with, drawn as a placeholder
  // that is not in the way.
  for (const exit of definition.exits) {
    if (exit.blocked || !exit.to || !exit.entry) {
      continue;
    }
    const [east, south] = exit.position;
    const groundHeight = heightAt(terrain, east, south);
    show(createPropMesh(exitBox(exit, groundHeight)));
    if (options.world) {
      entities.push(
        options.world.add({
          transform: createTransform(east, groundHeight, south),
          interactable: { id: exit.id, kind: "travel" },
          exit: { to: exit.to, entry: exit.entry },
        }),
      );
    }
  }

  // A zone that is a room: walls where its edges are, a ceiling, and shelter everywhere.
  if (definition.interior) {
    const floor = heightAt(terrain, definition.size / 2, definition.size / 2);
    const shell = interiorShell(definition.size, definition.interior.height, floor);
    for (const wall of shell.walls) {
      show(createPropMesh(wall));
    }
    bodies.push(physics.addStaticBox(shell.ceiling.center, shell.ceiling.halfExtents));
    show(createPropMesh(shell.ceiling));
    const shelter = interiorShelterZone(definition, floor);
    if (shelter && options.world) {
      entities.push(options.world.add(shelter));
      shelterZoneCount += 1;
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

  const showContainers = (): void => {
    for (const look of containerLooks) {
      if (look.state.opened !== look.shown) {
        look.shown = look.state.opened;
        look.apply(look.shown);
      }
    }
  };
  showContainers();

  for (const wall of boundaryWalls(definition.size)) {
    bodies.push(physics.addStaticBox(wall.center, wall.halfExtents));
  }

  return {
    definition,
    terrain,
    rockCount: rocks.length,
    propModelCount: models.length,
    rocksModelled: rockMeshes.length > 0,
    shelterZoneCount,
    containerCount: definition.containers.length,
    showContainers,
    unload(): void {
      for (const entity of entities) {
        options.world?.remove(entity);
      }
      entities.length = 0;
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
