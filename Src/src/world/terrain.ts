/**
 * Terrain as a square grid of heights. Pure arithmetic: looking a height up, and turning the
 * grid into triangles. The drawn mesh and the collider are both built from those same
 * triangles, and `heightAt` follows them too, so all three agree exactly.
 *
 * The grid covers the zone from its north-west corner (x = 0, z = 0) to its south-east
 * corner (x = size, z = size). Heights are stored row by row from the north, each row running
 * west to east.
 */

export interface Heightfield {
  /** Height samples per side. */
  readonly samples: number;
  /** Length of one side in metres. */
  readonly size: number;
  /** `samples * samples` heights in metres. */
  readonly heights: readonly number[];
}

export interface TerrainGeometry {
  /** x, y, z per vertex. */
  positions: Float32Array;
  /** Three vertex indices per triangle, counter-clockwise seen from above. */
  indices: Uint32Array;
}

export function createHeightfield(samples: number, size: number, heights: readonly number[]): Heightfield {
  if (!Number.isInteger(samples) || samples < 2) {
    throw new RangeError(`A heightfield needs at least 2 samples per side, got ${samples}`);
  }
  if (heights.length !== samples * samples) {
    throw new RangeError(`Expected ${samples * samples} heights, got ${heights.length}`);
  }
  return { samples, size, heights };
}

/** Distance between neighbouring samples in metres. */
export function cellSize(field: Heightfield): number {
  return field.size / (field.samples - 1);
}

const sampleAt = (field: Heightfield, column: number, row: number): number =>
  field.heights[row * field.samples + column] ?? 0;

/**
 * Height of the terrain surface at a point. Points outside the zone get the height of the
 * nearest edge.
 *
 * Each grid cell is two triangles split along the diagonal from its north-east to its
 * south-west corner, and the height is read off the triangle the point is in.
 */
export function heightAt(field: Heightfield, x: number, z: number): number {
  const cell = cellSize(field);
  const last = field.samples - 1;
  const gridX = Math.min(Math.max(x / cell, 0), last);
  const gridZ = Math.min(Math.max(z / cell, 0), last);
  const column = Math.min(Math.floor(gridX), last - 1);
  const row = Math.min(Math.floor(gridZ), last - 1);
  const u = gridX - column;
  const v = gridZ - row;

  const northWest = sampleAt(field, column, row);
  const northEast = sampleAt(field, column + 1, row);
  const southWest = sampleAt(field, column, row + 1);
  const southEast = sampleAt(field, column + 1, row + 1);

  if (u + v <= 1) {
    return northWest + u * (northEast - northWest) + v * (southWest - northWest);
  }
  return southEast + (1 - u) * (southWest - southEast) + (1 - v) * (northEast - southEast);
}

/** Vertices and triangles of the terrain surface, in world coordinates. */
export function buildTerrainGeometry(field: Heightfield): TerrainGeometry {
  const { samples } = field;
  const cell = cellSize(field);
  const positions = new Float32Array(samples * samples * 3);
  for (let row = 0; row < samples; row += 1) {
    for (let column = 0; column < samples; column += 1) {
      const offset = (row * samples + column) * 3;
      positions[offset] = column * cell;
      positions[offset + 1] = sampleAt(field, column, row);
      positions[offset + 2] = row * cell;
    }
  }

  const cells = samples - 1;
  const indices = new Uint32Array(cells * cells * 6);
  let next = 0;
  for (let row = 0; row < cells; row += 1) {
    for (let column = 0; column < cells; column += 1) {
      const northWest = row * samples + column;
      const northEast = northWest + 1;
      const southWest = northWest + samples;
      const southEast = southWest + 1;
      indices[next++] = northWest;
      indices[next++] = southWest;
      indices[next++] = northEast;
      indices[next++] = northEast;
      indices[next++] = southWest;
      indices[next++] = southEast;
    }
  }
  return { positions, indices };
}
