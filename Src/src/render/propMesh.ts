import { BoxGeometry, DodecahedronGeometry, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Quaternion, Vector3 } from "three";
import type { PropBox } from "../world/props";

/** The drawable version of a prop's box. */
export function createPropMesh(box: PropBox): Mesh {
  const mesh = new Mesh(
    new BoxGeometry(box.halfExtents.x * 2, box.halfExtents.y * 2, box.halfExtents.z * 2),
    new MeshStandardMaterial({ color: box.color, roughness: 0.9 }),
  );
  mesh.position.set(box.center.x, box.center.y, box.center.z);
  mesh.rotation.y = box.yaw;
  return mesh;
}

export interface RockInstance {
  x: number;
  y: number;
  z: number;
  /** Rough radius in metres. */
  size: number;
  yaw: number;
}

/** Rocks are flatter than they are wide. */
export const ROCK_HEIGHT_RATIO = 0.7;

/** All rocks of a zone as one instanced mesh: one draw call however many there are. */
export function createRockMesh(rocks: readonly RockInstance[]): InstancedMesh {
  const mesh = new InstancedMesh(
    new DodecahedronGeometry(1, 0),
    new MeshStandardMaterial({ color: 0x8a7f6d, roughness: 1, flatShading: true }),
    rocks.length,
  );
  const matrix = new Matrix4();
  const rotation = new Quaternion();
  const up = new Vector3(0, 1, 0);
  rocks.forEach((rock, index) => {
    rotation.setFromAxisAngle(up, rock.yaw);
    matrix.compose(
      new Vector3(rock.x, rock.y, rock.z),
      rotation,
      new Vector3(rock.size, rock.size * ROCK_HEIGHT_RATIO, rock.size),
    );
    mesh.setMatrixAt(index, matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  // Instances are spread over the whole zone; the default bounds would cull them wrongly.
  mesh.computeBoundingSphere();
  return mesh;
}
