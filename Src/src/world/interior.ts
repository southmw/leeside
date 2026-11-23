import type { ShelterZone, Transform } from "../core/ecs";
import type { PropBox } from "./props";
import type { ZoneDefinition, ZoneExit } from "./zoneDefinition";

/**
 * A zone that is a room (prototype design 5.5): the walls along its edges, the ceiling, and
 * the shelter the whole of it gives. And what a way out of a zone looks like. All boxes,
 * placeholders until there are models.
 */

/** How thick the walls and the ceiling are drawn, in metres. They lie outside the room. */
const SHELL_THICKNESS = 0.5;
const WALL_COLOR = 0x74777a;
const CEILING_COLOR = 0x505357;

export interface InteriorShell {
  /** Drawn only: the zone's boundary walls are what stops movement. */
  walls: PropBox[];
  /** Drawn and solid, so the camera stays under it. */
  ceiling: PropBox;
}

/** The walls and ceiling of a room `size` metres square and `height` high, on a floor at `floorY`. */
export function interiorShell(size: number, height: number, floorY: number): InteriorShell {
  const half = size / 2;
  const t = SHELL_THICKNESS / 2;
  const wall = (x: number, z: number, halfX: number, halfZ: number): PropBox => ({
    center: { x, y: floorY + height / 2, z },
    halfExtents: { x: halfX, y: height / 2, z: halfZ },
    yaw: 0,
    color: WALL_COLOR,
  });
  return {
    walls: [
      wall(half, -t, half + 2 * t, t), // north
      wall(half, size + t, half + 2 * t, t), // south
      wall(-t, half, t, half), // west
      wall(size + t, half, t, half), // east
    ],
    ceiling: {
      center: { x: half, y: floorY + height + t, z: half },
      halfExtents: { x: half + 2 * t, y: t, z: half + 2 * t },
      yaw: 0,
      color: CEILING_COLOR,
    },
  };
}

/** The shelter a room gives: all of it. Undefined for a zone under the open sky. */
export function interiorShelterZone(zone: ZoneDefinition, floorY: number): { shelterZone: ShelterZone; transform: Transform } | undefined {
  if (!zone.interior) {
    return undefined;
  }
  const half = zone.size / 2;
  return {
    shelterZone: { id: zone.id, halfWidth: half, halfDepth: half, height: zone.interior.height },
    transform: { x: half, y: floorY, z: half, rotationY: 0 },
  };
}

/** Width, height and depth of an exit's placeholder, in metres, and its colour. */
export const EXIT_LOOKS: Readonly<Record<ZoneExit["shape"], { size: readonly [number, number, number]; color: number }>> = {
  // Flat enough to walk over: it has no collider.
  hatch: { size: [1.4, 0.12, 1.4], color: 0x3a3f45 },
  ladder: { size: [0.9, 2.8, 0.3], color: 0x3a3f45 },
};

/** The box an exit is drawn as, standing on ground of height `groundHeight`. */
export function exitBox(exit: ZoneExit, groundHeight: number): PropBox {
  const { size, color } = EXIT_LOOKS[exit.shape];
  return {
    center: { x: exit.position[0], y: groundHeight + size[1] / 2, z: exit.position[1] },
    halfExtents: { x: size[0] / 2, y: size[1] / 2, z: size[2] / 2 },
    yaw: 0,
    color,
  };
}
