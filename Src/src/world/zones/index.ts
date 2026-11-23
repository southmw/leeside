import type { ZoneDefinition } from "../zoneDefinition";
import { loadDryRiverbed } from "./dryRiverbed";
import { loadShelter } from "./shelter";

/** The game's zones. One is in the world at a time (technical design 9). */
export const ZONE_IDS = ["dry_riverbed", "shelter"] as const;
export type ZoneId = (typeof ZONE_IDS)[number];

export function isZoneId(value: unknown): value is ZoneId {
  return typeof value === "string" && (ZONE_IDS as readonly string[]).includes(value);
}

/**
 * What is wrong with the ways between zones: an exit that leads to a zone that does not
 * exist, or to an entry point its zone does not have. One zone alone cannot tell.
 */
export function checkZoneLinks(zones: Readonly<Record<string, ZoneDefinition>>): string[] {
  const errors: string[] = [];
  for (const zone of Object.values(zones)) {
    for (const exit of zone.exits) {
      if (exit.blocked || !exit.to) {
        continue;
      }
      const target = zones[exit.to];
      if (!target) {
        errors.push(`${zone.id}.${exit.id}: leads to "${exit.to}", which is no zone`);
      } else if (!target.entries.some((entry) => entry.id === exit.entry)) {
        errors.push(`${zone.id}.${exit.id}: zone "${exit.to}" has no entry "${exit.entry ?? ""}"`);
      }
    }
  }
  return errors;
}

/** Validates and returns every zone. Throws if a zone, or a way between two, is wrong. */
export function loadZones(): Record<ZoneId, ZoneDefinition> {
  const zones = { dry_riverbed: loadDryRiverbed(), shelter: loadShelter() };
  const errors = checkZoneLinks(zones);
  if (errors.length > 0) {
    throw new Error(`The zones do not fit together:\n${errors.join("\n")}`);
  }
  return zones;
}
