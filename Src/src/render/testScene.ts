import {
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Scene,
} from "three";

export interface TestScene {
  scene: Scene;
  box: Mesh;
}

/** Placeholder scene used until zones exist (step 1.9): a floor, a box and two lights. */
export function createTestScene(): TestScene {
  const scene = new Scene();
  scene.background = new Color(0x8f9aa3);

  const floor = new Mesh(
    new PlaneGeometry(60, 60),
    new MeshStandardMaterial({ color: 0xb9a57c, roughness: 1 }),
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  const box = new Mesh(
    new BoxGeometry(1.5, 1.5, 1.5),
    new MeshStandardMaterial({ color: 0xc2643b, roughness: 0.8 }),
  );
  box.position.set(0, 0.75, 0);
  scene.add(box);

  scene.add(new AmbientLight(0xffffff, 0.7));

  const sun = new DirectionalLight(0xfff2d6, 2.2);
  sun.position.set(6, 10, 4);
  scene.add(sun);

  return { scene, box };
}
