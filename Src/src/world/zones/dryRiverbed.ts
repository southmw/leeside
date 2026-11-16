import { parseZoneDefinition, type ZoneDefinition } from "../zoneDefinition";
import { DRY_RIVERBED_SAMPLES, DRY_RIVERBED_SIZE, generateDryRiverbedHeights } from "./dryRiverbedTerrain";

/**
 * The dry riverbed, the prototype's one outdoor zone (prototype design 5). It has terrain,
 * a starting point and the three ruined houses; cars, the camp, exits and scattered rocks
 * arrive in plan step 1.10.
 *
 * Positions are [east, south] from the north-west corner, as in the design document.
 * House sizes, door sides and rotations are placeholders.
 */
const buildings = [
  // House A, west of the river. Its door faces the river, where the player comes from.
  { id: "house_a", position: [150, 150], rotation: 0, size: [10, 8, 3], door: { side: "east", width: 1.6 }, shelter: true },
  // House B, on the mound in the east.
  { id: "house_b", position: [300, 110], rotation: 340, size: [10, 8, 3], door: { side: "west", width: 1.6 }, shelter: true },
  // House C, further west.
  { id: "house_c", position: [70, 230], rotation: 15, size: [9, 7, 3], door: { side: "east", width: 1.6 }, shelter: true },
];

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
  // In the riverbed near the southern edge, facing north towards the cars and house A.
  spawn: { position: [192, 330], facing: 0 },
  buildings,
};

/** Validates and returns the zone. Throws with every problem listed if the definition is wrong. */
export function loadDryRiverbed(): ZoneDefinition {
  const result = parseZoneDefinition(definition);
  if (!result.ok) {
    throw new Error(`Zone "dry_riverbed" is invalid:\n${result.errors.join("\n")}`);
  }
  return result.zone;
}
