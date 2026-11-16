import { z } from "zod";

/**
 * The format of a zone definition and its validator.
 *
 * A zone is described by data: terrain, where the player starts, buildings, props, exits and
 * scattered clutter. Terrain and buildings are fixed; what the zone contains (containers and
 * so on) is added to this format by the steps that introduce it.
 *
 * Positions are `[east, south]` in metres from the zone's north-west corner, the way the
 * design documents write them. In the world that is `[x, z]`: east is +X and north is -Z.
 * Heights are not part of a position; things stand on the terrain.
 */

/** Largest zone side in metres. Zones are meant to fit on screen at once (300 to 400 m). */
export const MAX_ZONE_SIZE = 1024;
/** Terrain heights must stay within this range, in metres. */
export const MIN_TERRAIN_HEIGHT = -50;
export const MAX_TERRAIN_HEIGHT = 100;

/** Lower-case words joined by underscores, such as `dry_riverbed` or `house_a`. */
const idSchema = z.string().regex(/^[a-z][a-z0-9_]*$/, "must be lower-case letters, digits and underscores, starting with a letter");

const positionSchema = z.tuple([z.number(), z.number()]);
/** Clockwise from north, in degrees. */
const rotationSchema = z.number().min(0).max(360);

const terrainSchema = z
  .object({
    /** Height samples per side. The grid covers the whole zone, corner to corner. */
    samples: z.number().int().min(2).max(513),
    /** Heights in metres, row by row from the north-west corner, each row running west to east. */
    heights: z.array(z.number().min(MIN_TERRAIN_HEIGHT).max(MAX_TERRAIN_HEIGHT)),
  })
  .strict();

const spawnSchema = z
  .object({
    position: positionSchema,
    /** Direction the player faces at the start. */
    facing: rotationSchema,
  })
  .strict();

export const DOOR_SIDES = ["north", "east", "south", "west"] as const;

const buildingSchema = z
  .object({
    id: idSchema,
    /** Centre of the footprint. */
    position: positionSchema,
    rotation: rotationSchema.default(0),
    /** Outer size in metres: width (east-west before rotation), depth, and wall height. */
    size: z.tuple([z.number().min(2).max(60), z.number().min(2).max(60), z.number().min(2).max(20)]),
    /** Which wall has the doorway, before rotation, and how wide the opening is. */
    door: z.object({ side: z.enum(DOOR_SIDES), width: z.number().min(0.8).max(6) }).strict(),
    /** Whether being inside counts as shelter from the weather. */
    shelter: z.boolean(),
  })
  .strict();

export const PROP_KINDS = ["car", "overturned_car", "tent", "well", "barrier"] as const;

const propSchema = z
  .object({
    id: idSchema,
    kind: z.enum(PROP_KINDS),
    position: positionSchema,
    rotation: rotationSchema.default(0),
  })
  .strict();

const exitSchema = z
  .object({
    id: idSchema,
    position: positionSchema,
    /** A blocked exit is visible but cannot be used (the prototype's north and east exits). */
    blocked: z.boolean().default(false),
    /** Zone this exit leads to, and the entry point there. Required unless the exit is blocked. */
    to: idSchema.optional(),
    entry: idSchema.optional(),
  })
  .strict();

export const SCATTER_KINDS = ["rock"] as const;

const scatterSchema = z
  .object({
    id: idSchema,
    kind: z.enum(SCATTER_KINDS),
    count: z.number().int().min(1).max(5000),
    /** Fixed seed, so the clutter lies in the same places for everyone. */
    seed: z.number().int().min(0),
  })
  .strict();

export const zoneDefinitionSchema = z
  .object({
    id: idSchema,
    /** Text key of the zone's name, looked up in the locale files. */
    nameKey: z.string().min(1),
    /** Length of one side in metres. Zones are square. */
    size: z.number().min(16).max(MAX_ZONE_SIZE),
    terrain: terrainSchema,
    spawn: spawnSchema,
    buildings: z.array(buildingSchema).default([]),
    props: z.array(propSchema).default([]),
    exits: z.array(exitSchema).default([]),
    scatter: z.array(scatterSchema).default([]),
  })
  .strict()
  .superRefine((zone, context) => {
    const issue = (path: Array<string | number>, message: string): void => {
      context.addIssue({ code: "custom", path, message });
    };

    const expected = zone.terrain.samples * zone.terrain.samples;
    if (zone.terrain.heights.length !== expected) {
      issue(["terrain", "heights"], `expected ${expected} heights (samples squared), got ${zone.terrain.heights.length}`);
    }

    const inside = ([east, south]: readonly [number, number]): boolean =>
      east >= 0 && east <= zone.size && south >= 0 && south <= zone.size;
    if (!inside(zone.spawn.position)) {
      issue(["spawn", "position"], `is outside the zone (0 to ${zone.size})`);
    }

    // Ids must be unique across the whole zone, so anything in it can be named by id alone.
    const seen = new Map<string, string>();
    for (const list of ["buildings", "props", "exits", "scatter"] as const) {
      zone[list].forEach((item, index) => {
        const firstUse = seen.get(item.id);
        if (firstUse) {
          issue([list, index, "id"], `duplicate id "${item.id}" (already used in ${firstUse})`);
        } else {
          seen.set(item.id, `${list}[${index}]`);
        }
        if ("position" in item && !inside(item.position)) {
          issue([list, index, "position"], `is outside the zone (0 to ${zone.size})`);
        }
      });
    }

    zone.buildings.forEach((building, index) => {
      const [width, depth] = building.size;
      const wallLength = building.door.side === "north" || building.door.side === "south" ? width : depth;
      if (building.door.width > wallLength - 1) {
        issue(["buildings", index, "door", "width"], `is too wide for a wall ${wallLength} m long (leave at least 1 m of wall)`);
      }
    });

    zone.exits.forEach((exit, index) => {
      if (!exit.blocked && (!exit.to || !exit.entry)) {
        issue(["exits", index], `an exit that is not blocked needs both "to" and "entry"`);
      }
    });
  });

export type ZoneDefinition = z.infer<typeof zoneDefinitionSchema>;
export type ZoneBuilding = ZoneDefinition["buildings"][number];
export type ZoneProp = ZoneDefinition["props"][number];
export type ZoneExit = ZoneDefinition["exits"][number];

export type ZoneParseResult =
  | { ok: true; zone: ZoneDefinition }
  /** Each error names where the problem is and what it is, for example `buildings.2.id: duplicate id "house_a"`. */
  | { ok: false; errors: string[] };

/** Checks data against the zone format. Never throws; problems come back as readable messages. */
export function parseZoneDefinition(data: unknown): ZoneParseResult {
  const result = zoneDefinitionSchema.safeParse(data);
  if (result.success) {
    return { ok: true, zone: result.data };
  }
  return {
    ok: false,
    errors: result.error.issues.map((issue) => `${issue.path.join(".") || "(zone)"}: ${issue.message}`),
  };
}
