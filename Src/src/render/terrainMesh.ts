import { BufferAttribute, BufferGeometry, Color, Mesh, MeshStandardMaterial } from "three";
import type { TerrainGeometry } from "../world/terrain";

/**
 * Placeholder ground colours. Three things are told apart so the shape of the land reads at
 * a glance: low ground (the riverbed's floor) is pale, high ground is a warmer tan, and
 * slopes (the river's banks) are dark, whatever their height.
 */
const LOW_COLOR = new Color(0xd9ccab);
const HIGH_COLOR = new Color(0xa38a55);
const SLOPE_COLOR = new Color(0x5f4b33);
/** A slope this steep (rise over run) gets the full slope colour. About 14 degrees. */
const FULL_SLOPE = 0.25;
/** Heights are compared within this many metres above the lowest point; higher is all "high". */
const HEIGHT_RANGE = 3;

/** Builds the drawable terrain from the same triangles the collider uses. */
export function createTerrainMesh(terrain: TerrainGeometry): Mesh {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(terrain.positions, 3));
  geometry.setIndex(new BufferAttribute(terrain.indices, 1));
  geometry.computeVertexNormals();
  const normals = geometry.getAttribute("normal");

  let lowest = Number.POSITIVE_INFINITY;
  for (let i = 1; i < terrain.positions.length; i += 3) {
    lowest = Math.min(lowest, terrain.positions[i] ?? 0);
  }

  const colors = new Float32Array(terrain.positions.length);
  const color = new Color();
  for (let vertex = 0; vertex < terrain.positions.length / 3; vertex += 1) {
    const height = terrain.positions[vertex * 3 + 1] ?? 0;
    color.lerpColors(LOW_COLOR, HIGH_COLOR, Math.min(Math.max((height - lowest) / HEIGHT_RANGE, 0), 1));

    // Steepness from the surface normal: rise over run is the normal's horizontal part over its vertical part.
    const up = Math.max(normals.getY(vertex), 1e-6);
    const steepness = Math.hypot(normals.getX(vertex), normals.getZ(vertex)) / up;
    color.lerp(SLOPE_COLOR, Math.min(steepness / FULL_SLOPE, 1));

    colors[vertex * 3] = color.r;
    colors[vertex * 3 + 1] = color.g;
    colors[vertex * 3 + 2] = color.b;
  }
  geometry.setAttribute("color", new BufferAttribute(colors, 3));

  return new Mesh(geometry, new MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
}
