import { parseZoneDefinition, type ZoneDefinition } from "../zoneDefinition";
import { DRY_RIVERBED_SAMPLES, DRY_RIVERBED_SIZE, generateDryRiverbedHeights } from "./dryRiverbedTerrain";

/**
 * The dry riverbed, the prototype's one outdoor zone (prototype design 5). For now it has
 * terrain and a starting point; buildings and the rest arrive in plan steps 1.9 and 1.10.
 */
const definition = {
  id: "dry_riverbed",
  nameKey: "zone.dry_riverbed.name",
  size: DRY_RIVERBED_SIZE,
  terrain: { samples: DRY_RIVERBED_SAMPLES, heights: generateDryRiverbedHeights() },
  // In the riverbed near the southern edge, facing north towards the cars and house A.
  spawn: { position: [192, 330], facing: 0 },
};

/** Validates and returns the zone. Throws with every problem listed if the definition is wrong. */
export function loadDryRiverbed(): ZoneDefinition {
  const result = parseZoneDefinition(definition);
  if (!result.ok) {
    throw new Error(`Zone "dry_riverbed" is invalid:\n${result.errors.join("\n")}`);
  }
  return result.zone;
}
