import { CapsuleGeometry, Mesh, MeshStandardMaterial, Scene } from "three";

/** An empty scene. Its sky and lights are added by render/sky.ts. */
export function createTestScene(): Scene {
  return new Scene();
}

/** Placeholder character: a capsule the size of the player's collider. */
export function createCharacterMesh(height: number, radius: number): Mesh {
  return new Mesh(
    new CapsuleGeometry(radius, height - 2 * radius, 4, 12),
    new MeshStandardMaterial({ color: 0x4f7a8c, roughness: 0.7 }),
  );
}
