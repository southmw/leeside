import {
  AmbientLight,
  BoxGeometry,
  CapsuleGeometry,
  Color,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Scene,
} from "three";

/** Placeholder scene used until zones exist (step 1.9): a floor and two lights. */
export function createTestScene(): Scene {
  const scene = new Scene();
  scene.background = new Color(0x8f9aa3);

  const floor = new Mesh(
    new PlaneGeometry(60, 60),
    new MeshStandardMaterial({ color: 0xb9a57c, roughness: 1 }),
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  scene.add(new AmbientLight(0xffffff, 0.7));

  const sun = new DirectionalLight(0xfff2d6, 2.2);
  sun.position.set(6, 10, 4);
  scene.add(sun);

  return scene;
}

/** Placeholder box mesh. It enters the scene through an entity, not directly. */
export function createBoxMesh(): Mesh {
  return new Mesh(
    new BoxGeometry(1.5, 1.5, 1.5),
    new MeshStandardMaterial({ color: 0xc2643b, roughness: 0.8 }),
  );
}

/** Placeholder character: a capsule the size of the player's collider. */
export function createCharacterMesh(height: number, radius: number): Mesh {
  return new Mesh(
    new CapsuleGeometry(radius, height - 2 * radius, 4, 12),
    new MeshStandardMaterial({ color: 0x4f7a8c, roughness: 0.7 }),
  );
}
