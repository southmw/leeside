import { BoxGeometry, Mesh, MeshStandardMaterial } from "three";
import type { BuildingBox } from "../world/building";

/** Placeholder colours until buildings get models. */
const COLORS: Readonly<Record<BuildingBox["kind"], number>> = { wall: 0x8c8474, roof: 0x5e4a3c };

/** The drawable version of one box of a building. */
export function createBuildingBoxMesh(box: BuildingBox): Mesh {
  const mesh = new Mesh(
    new BoxGeometry(box.halfExtents.x * 2, box.halfExtents.y * 2, box.halfExtents.z * 2),
    new MeshStandardMaterial({ color: COLORS[box.kind], roughness: 0.95 }),
  );
  mesh.position.set(box.center.x, box.center.y, box.center.z);
  mesh.rotation.y = box.yaw;
  return mesh;
}
