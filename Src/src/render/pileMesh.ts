import { AdditiveBlending, BoxGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, type Object3D } from "three";

/**
 * How a pile of things on the ground is drawn (prototype design 4.7): a small sack, a
 * placeholder like the cabinets and crates. Every pile looks the same whatever lies on it,
 * so all of them share one shape and one material, which are never disposed of. The bag a
 * death left behind has a shape and a material of its own.
 */

/** Width, height and depth in metres. */
export const PILE_SIZE = [0.4, 0.2, 0.3] as const;
/** A faded blue: against the sand a sack the colour of sacking could not be found again. */
const PILE_COLOR = 0x5f8494;

/** The bag a death left behind: bigger, and a colour that is seen from afar. */
export const DROPPED_BAG_SIZE = [0.55, 0.4, 0.45] as const;
const DROPPED_BAG_COLOR = 0xd9772b;

/**
 * A column of light standing on the dropped bag, so that it is found from afar, over rocks
 * and banks and through the dust of a storm (the haze does not hide it). Metres.
 */
export const BEACON_HEIGHT = 45;
const BEACON_RADIUS = 0.3;
let beacon: { geometry: CylinderGeometry; material: MeshBasicMaterial } | undefined;

const shapes = new Map<boolean, { geometry: BoxGeometry; material: MeshStandardMaterial }>();

/**
 * A pile's picture, or (`dropped`) that of the bag a death left behind. Its origin is on the
 * ground, like the pile's own position.
 */
export function createPileMesh(dropped = false): Object3D {
  let shape = shapes.get(dropped);
  if (!shape) {
    const size = dropped ? DROPPED_BAG_SIZE : PILE_SIZE;
    const geometry = new BoxGeometry(...size);
    geometry.translate(0, size[1] / 2, 0);
    shape = { geometry, material: new MeshStandardMaterial({ color: dropped ? DROPPED_BAG_COLOR : PILE_COLOR, roughness: 0.9 }) };
    shapes.set(dropped, shape);
  }
  const mesh = new Mesh(shape.geometry, shape.material);
  if (!dropped) {
    return mesh;
  }
  if (!beacon) {
    const geometry = new CylinderGeometry(BEACON_RADIUS, BEACON_RADIUS, BEACON_HEIGHT, 8, 1, true);
    geometry.translate(0, BEACON_HEIGHT / 2, 0);
    beacon = {
      geometry,
      material: new MeshBasicMaterial({ color: DROPPED_BAG_COLOR, transparent: true, opacity: 0.55, blending: AdditiveBlending, depthWrite: false, fog: false }),
    };
  }
  const group = new Group();
  group.add(mesh, new Mesh(beacon.geometry, beacon.material));
  return group;
}
