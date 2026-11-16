/**
 * The route the camera flies during a performance measurement, as plain geometry.
 * Points are [x, z] in the world (east, south); heights are added by the caller.
 */

export interface PathPoint {
  x: number;
  z: number;
}

/** Total length of a closed route: from the first point through all others and back to the first. */
export function pathLength(points: readonly PathPoint[]): number {
  let length = 0;
  for (let index = 0; index < points.length; index += 1) {
    const from = points[index] as PathPoint;
    const to = points[(index + 1) % points.length] as PathPoint;
    length += Math.hypot(to.x - from.x, to.z - from.z);
  }
  return length;
}

/**
 * The point `distance` metres along a closed route. Distances beyond the end wrap round to
 * the start, and negative ones count backwards.
 */
export function pointOnPath(points: readonly PathPoint[], distance: number): PathPoint {
  const first = points[0];
  if (!first) {
    return { x: 0, z: 0 };
  }
  const total = pathLength(points);
  if (!(total > 0)) {
    return { ...first };
  }
  let remaining = ((distance % total) + total) % total;
  for (let index = 0; index < points.length; index += 1) {
    const from = points[index] as PathPoint;
    const to = points[(index + 1) % points.length] as PathPoint;
    const segment = Math.hypot(to.x - from.x, to.z - from.z);
    if (remaining <= segment && segment > 0) {
      const t = remaining / segment;
      return { x: from.x + (to.x - from.x) * t, z: from.z + (to.z - from.z) * t };
    }
    remaining -= segment;
  }
  return { ...first };
}

export interface BenchCamera {
  position: PathPoint;
  /** A point further along the route for the camera to look at, so turns are gradual. */
  target: PathPoint;
}

/**
 * Where the camera is, and where it looks, once `fraction` (0 to 1) of the measurement has
 * passed. The camera goes round the route exactly once at constant speed.
 */
export function benchCameraAt(points: readonly PathPoint[], fraction: number, lookAhead: number): BenchCamera {
  const travelled = pathLength(points) * Math.min(Math.max(fraction, 0), 1);
  return {
    position: pointOnPath(points, travelled),
    target: pointOnPath(points, travelled + lookAhead),
  };
}
