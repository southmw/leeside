/**
 * Invisible walls along the four edges of a zone, so nobody walks off the terrain.
 * Their inner faces lie exactly on the edges.
 */

export interface BoundaryWall {
  center: { x: number; y: number; z: number };
  halfExtents: { x: number; y: number; z: number };
}

/** Tall enough that nothing gets over, thick enough that nothing tunnels through. */
const WALL_HALF_HEIGHT = 60;
const WALL_HALF_THICKNESS = 2;

export function boundaryWalls(zoneSize: number): BoundaryWall[] {
  const half = zoneSize / 2;
  const t = WALL_HALF_THICKNESS;
  // Long enough to close the corners.
  const along = half + 2 * t;
  const wall = (x: number, z: number, halfX: number, halfZ: number): BoundaryWall => ({
    center: { x, y: 0, z },
    halfExtents: { x: halfX, y: WALL_HALF_HEIGHT, z: halfZ },
  });
  return [
    wall(half, -t, along, t), // north
    wall(half, zoneSize + t, along, t), // south
    wall(-t, half, t, along), // west
    wall(zoneSize + t, half, t, along), // east
  ];
}
