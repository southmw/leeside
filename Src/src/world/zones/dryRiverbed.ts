import { parseZoneDefinition, type ZoneDefinition } from "../zoneDefinition";
import { DRY_RIVERBED_SAMPLES, DRY_RIVERBED_SIZE, generateDryRiverbedHeights } from "./dryRiverbedTerrain";

/**
 * The dry riverbed, the prototype's one outdoor zone, laid out as in prototype design 5.2.
 * The zone is 720 m across; at 12 m/s that is one minute from edge to edge.
 *
 * Positions are [east, south] from the north-west corner, exactly as in the design document.
 * Sizes, door sides and rotations are placeholders. The spots where the storm uncovers things
 * are added by the plan step that introduces them.
 */
const buildings = [
  // House A, west of the river. Its door faces the river, where the player comes from.
  { id: "house_a", position: [281, 281], rotation: 0, size: [10, 8, 3], door: { side: "east", width: 1.6 }, shelter: true },
  // House B, on the mound in the east.
  { id: "house_b", position: [563, 206], rotation: 340, size: [10, 8, 3], door: { side: "west", width: 1.6 }, shelter: true },
  // House C, further west.
  { id: "house_c", position: [131, 431], rotation: 15, size: [9, 7, 3], door: { side: "east", width: 1.6 }, shelter: true },
];

const props = [
  // 1: a line of cars in the riverbed, the first place the player searches.
  { id: "car_line", kind: "car", position: [375, 491], rotation: 8 },
  { id: "car_line_second", kind: "car", position: [374, 500], rotation: 352 },
  // 2: an abandoned car east of the river.
  { id: "abandoned_car", kind: "car", position: [469, 356], rotation: 70 },
  // 3: an overturned car in the south-west, the place furthest from any shelter.
  { id: "overturned_car", kind: "overturned_car", position: [244, 563], rotation: 40 },
  // K: what is left of a camp.
  { id: "camp", kind: "tent", position: [206, 150], rotation: 30 },
  { id: "camp_second_tent", kind: "tent", position: [212, 154], rotation: 300 },
  // W: a dry well.
  { id: "dry_well", kind: "well", position: [403, 113], rotation: 0 },
  // Rubble across the two exits that the prototype keeps closed.
  { id: "north_exit_rubble", kind: "barrier", position: [356, 10], rotation: 0 },
  { id: "east_exit_rubble", kind: "barrier", position: [711, 188], rotation: 90 },
];

/**
 * The fourteen containers (prototype design 5.2): four trunks, two cabinets in each house,
 * four crates out of doors. What is in them is decided when a game starts (step 2.14).
 */
const containers = [
  { id: "car_line_trunk", kind: "trunk", prop: "car_line" },
  // The first container the player comes to from the start, and the one the introduction
  // leads to: what is in it is always the same (prototype design 4.2).
  {
    id: "car_line_second_trunk",
    kind: "trunk",
    prop: "car_line_second",
    contents: [
      { item: "water_bottle", count: 1 },
      { item: "cloth", count: 2 },
    ],
  },
  { id: "abandoned_car_trunk", kind: "trunk", prop: "abandoned_car" },
  { id: "overturned_car_trunk", kind: "trunk", prop: "overturned_car" },
  // In each house: one on the wall facing the door, 2 m north of its middle, and one on the
  // south wall, 2 m from its middle away from the door. Far enough apart to be told apart.
  { id: "house_a_cabinet_back", kind: "cabinet", building: "house_a", wall: "west", offset: -2 },
  { id: "house_a_cabinet_side", kind: "cabinet", building: "house_a", wall: "south", offset: -2 },
  { id: "house_b_cabinet_back", kind: "cabinet", building: "house_b", wall: "east", offset: -2 },
  { id: "house_b_cabinet_side", kind: "cabinet", building: "house_b", wall: "south", offset: 2 },
  { id: "house_c_cabinet_back", kind: "cabinet", building: "house_c", wall: "west", offset: -2 },
  { id: "house_c_cabinet_side", kind: "cabinet", building: "house_c", wall: "south", offset: -2 },
  // Beside the overturned car, clear of both its ends.
  { id: "overturned_car_crate", kind: "crate", position: [247, 566], rotation: 40 },
  { id: "camp_crate_north", kind: "crate", position: [209, 147], rotation: 20 },
  { id: "camp_crate_south", kind: "crate", position: [203, 155], rotation: 110 },
  { id: "well_crate", kind: "crate", position: [406, 114], rotation: 350 },
];

const exits = [
  // The shelter's entrance is in house A's basement.
  // A hatch in the middle of the floor (prototype design 5.5).
  { id: "to_shelter", position: [281, 281], shape: "hatch", to: "shelter", entry: "from_riverbed" },
  // N and E lead to zones the prototype does not have.
  { id: "north_exit", position: [356, 8], blocked: true },
  { id: "east_exit", position: [713, 188], blocked: true },
];

// Coming up out of the shelter: beside the hatch, facing house A's door, the hatch behind.
const entries = [{ id: "from_shelter", position: [282.5, 281], facing: 90 }];

/** The ground is levelled under each building, a little beyond its corners. */
const pads = buildings.map(({ position, size }) => ({
  x: position[0] ?? 0,
  z: position[1] ?? 0,
  radius: Math.hypot(size[0] ?? 0, size[1] ?? 0) / 2 + 4,
}));

const definition = {
  id: "dry_riverbed",
  nameKey: "zone.dry_riverbed.name",
  size: DRY_RIVERBED_SIZE,
  terrain: { samples: DRY_RIVERBED_SAMPLES, heights: generateDryRiverbedHeights(pads) },
  // S: in the riverbed near the southern edge, facing north towards the cars and house A.
  spawn: { position: [360, 619], facing: 0 },
  buildings,
  props,
  exits,
  entries,
  scatter: [{ id: "rocks", kind: "rock", count: 1100, seed: 20261116 }],
  containers,
};

/** Validates and returns the zone. Throws with every problem listed if the definition is wrong. */
export function loadDryRiverbed(): ZoneDefinition {
  const result = parseZoneDefinition(definition);
  if (!result.ok) {
    throw new Error(`Zone "dry_riverbed" is invalid:\n${result.errors.join("\n")}`);
  }
  return result.zone;
}
