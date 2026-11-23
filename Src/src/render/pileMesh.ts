import { BoxGeometry, Mesh, MeshStandardMaterial } from "three";

/**
 * How a pile of things on the ground is drawn (prototype design 4.7): a small sack, a
 * placeholder like the cabinets and crates. Every pile looks the same whatever lies on it,
 * so all of them share one shape and one material, which are never disposed of.
 */

/** Width, height and depth in metres. */
export const PILE_SIZE = [0.4, 0.2, 0.3] as const;
/** A faded blue: against the sand a sack the colour of sacking could not be found again. */
const PILE_COLOR = 0x5f8494;

let geometry: BoxGeometry | undefined;
let material: MeshStandardMaterial | undefined;

/** A pile's picture. Its origin is on the ground, like the pile's own position. */
export function createPileMesh(): Mesh {
  if (!geometry) {
    geometry = new BoxGeometry(...PILE_SIZE);
    geometry.translate(0, PILE_SIZE[1] / 2, 0);
  }
  material ??= new MeshStandardMaterial({ color: PILE_COLOR, roughness: 0.9 });
  return new Mesh(geometry, material);
}
