import type { ZoneDefinition } from "./zoneDefinition";

export interface StartPoint {
  east: number;
  south: number;
  /** Degrees clockwise from north. */
  facing: number;
}

/**
 * Where the player starts in a zone. Normally the zone's own start point; `at` ("east,south")
 * and `face` (degrees clockwise from north) override it, which the `?at` and `?face` start
 * conditions use to check a place without walking there. Values that do not parse, or that
 * lie outside the zone, are ignored.
 */
export function resolveStart(zone: ZoneDefinition, at?: string | null, face?: string | null): StartPoint {
  const start: StartPoint = {
    east: zone.spawn.position[0],
    south: zone.spawn.position[1],
    facing: zone.spawn.facing,
  };

  const parts = at?.split(",").map((part) => Number(part.trim())) ?? [];
  const [east, south] = parts;
  const inside = (value: number | undefined): value is number =>
    value !== undefined && Number.isFinite(value) && value >= 0 && value <= zone.size;
  if (parts.length === 2 && inside(east) && inside(south)) {
    start.east = east;
    start.south = south;
  }

  const facing = face === null || face === undefined || face.trim() === "" ? Number.NaN : Number(face);
  if (Number.isFinite(facing)) {
    start.facing = ((facing % 360) + 360) % 360;
  }
  return start;
}
