import { BufferAttribute, BufferGeometry, Color, Mesh, MeshStandardMaterial } from "three";
import type { TerrainGeometry } from "../world/terrain";

/** Placeholder ground colours: low ground (the riverbed) is paler than the plain. */
const LOW_COLOR = new Color(0xcdbb93);
const HIGH_COLOR = new Color(0x9f8a5c);

/** Builds the drawable terrain from the same triangles the collider uses. */
export function createTerrainMesh(terrain: TerrainGeometry): Mesh {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(terrain.positions, 3));
  geometry.setIndex(new BufferAttribute(terrain.indices, 1));
  geometry.computeVertexNormals();

  // Colour by height, so the shape of the land reads even under flat lighting.
  let lowest = Number.POSITIVE_INFINITY;
  let highest = Number.NEGATIVE_INFINITY;
  for (let i = 1; i < terrain.positions.length; i += 3) {
    const height = terrain.positions[i] ?? 0;
    lowest = Math.min(lowest, height);
    highest = Math.max(highest, height);
  }
  const range = Math.max(highest - lowest, 1e-6);
  const colors = new Float32Array(terrain.positions.length);
  const color = new Color();
  for (let i = 0; i < terrain.positions.length; i += 3) {
    const height = terrain.positions[i + 1] ?? 0;
    color.lerpColors(LOW_COLOR, HIGH_COLOR, Math.min((height - lowest) / range, 1));
    colors[i] = color.r;
    colors[i + 1] = color.g;
    colors[i + 2] = color.b;
  }
  geometry.setAttribute("color", new BufferAttribute(colors, 3));

  return new Mesh(geometry, new MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
}
