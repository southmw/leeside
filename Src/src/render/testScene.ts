import {
  AmbientLight,
  CapsuleGeometry,
  Color,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  Scene,
} from "three";

/** Placeholder sky colour and lights, until the sky and weather exist (M2). */
export function createTestScene(): Scene {
  const scene = new Scene();
  scene.background = new Color(0x8f9aa3);

  scene.add(new AmbientLight(0xffffff, 0.7));

  const sun = new DirectionalLight(0xfff2d6, 2.2);
  sun.position.set(6, 10, 4);
  scene.add(sun);

  return scene;
}

/** Placeholder character: a capsule the size of the player's collider. */
export function createCharacterMesh(height: number, radius: number): Mesh {
  return new Mesh(
    new CapsuleGeometry(radius, height - 2 * radius, 4, 12),
    new MeshStandardMaterial({ color: 0x4f7a8c, roughness: 0.7 }),
  );
}
