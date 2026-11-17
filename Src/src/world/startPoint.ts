import type { ZoneDefinition } from "./zoneDefinition";

/**
 * A number from a start condition such as `?speed=8`, or `fallback` if it is missing, not a
 * number, or outside `min` to `max`.
 */
export function numberParam(value: string | null | undefined, min: number, max: number, fallback: number): number {
  if (value === null || value === undefined || value.trim() === "") {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

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

/** A place worth jumping to while developing: where to stand and which way to look. */
export interface ZonePlace extends StartPoint {
  /** The id of the building or prop the place looks at, or "start". */
  id: string;
}

/** How far south of a prop or a building's centre the player is put, in metres. */
const PROP_VIEW_DISTANCE = 10;
const BUILDING_VIEW_DISTANCE = 16;

/**
 * The zone's start point and a spot a little south of every building and prop, looking north
 * at it. Spots are kept inside the zone.
 */
export function zonePlaces(zone: ZoneDefinition): ZonePlace[] {
  const south = (value: number): number => Math.min(value, zone.size - 1);
  return [
    { id: "start", east: zone.spawn.position[0], south: zone.spawn.position[1], facing: zone.spawn.facing },
    ...zone.buildings.map((building) => ({
      id: building.id,
      east: building.position[0],
      south: south(building.position[1] + BUILDING_VIEW_DISTANCE),
      facing: 0,
    })),
    ...zone.props.map((prop) => ({
      id: prop.id,
      east: prop.position[0],
      south: south(prop.position[1] + PROP_VIEW_DISTANCE),
      facing: 0,
    })),
  ];
}
