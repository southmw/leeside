import type { ZoneDefinition } from "../world/zoneDefinition";
import type { PathPoint } from "./benchPath";

/**
 * The measurement route for a zone: from the start point through the named places (buildings
 * or props, by id) and back. Places the zone does not have are skipped, so a changed zone
 * still gives a route.
 */
export function benchRoute(zone: ZoneDefinition, stops: readonly string[]): PathPoint[] {
  const places = new Map<string, readonly [number, number]>();
  for (const item of [...zone.buildings, ...zone.props]) {
    places.set(item.id, item.position);
  }
  const route: PathPoint[] = [{ x: zone.spawn.position[0], z: zone.spawn.position[1] }];
  for (const stop of stops) {
    const position = places.get(stop);
    if (position) {
      route.push({ x: position[0], z: position[1] });
    }
  }
  return route;
}

/** The dry riverbed's route: once round every place of the zone. */
export const DRY_RIVERBED_STOPS = [
  "car_line",
  "abandoned_car",
  "house_b",
  "dry_well",
  "camp",
  "house_a",
  "house_c",
  "overturned_car",
] as const;
