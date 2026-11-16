import { Object3D, Scene } from "three";
import { describe, expect, it } from "vitest";
import { createTransform, createWorld } from "../../src/core/ecs";
import { createRenderSync } from "../../src/render/renderSync";

describe("createRenderSync", () => {
  it("adds an object to the scene when its entity is added", () => {
    const world = createWorld();
    const scene = new Scene();
    createRenderSync(world, scene);

    const object = new Object3D();
    world.add({ transform: createTransform(), renderable: { object } });

    expect(scene.children).toContain(object);
  });

  it("picks up entities that existed before the sync was created", () => {
    const world = createWorld();
    const scene = new Scene();
    const object = new Object3D();
    world.add({ transform: createTransform(), renderable: { object } });

    createRenderSync(world, scene);

    expect(scene.children).toContain(object);
  });

  it("removes the object when its entity is removed", () => {
    const world = createWorld();
    const scene = new Scene();
    createRenderSync(world, scene);

    const object = new Object3D();
    const entity = world.add({ transform: createTransform(), renderable: { object } });
    world.remove(entity);

    expect(scene.children).not.toContain(object);
    expect(scene.children).toHaveLength(0);
  });

  it("ignores entities without a renderable", () => {
    const world = createWorld();
    const scene = new Scene();
    createRenderSync(world, scene);

    world.add({ transform: createTransform() });

    expect(scene.children).toHaveLength(0);
  });

  it("copies the transform onto the object", () => {
    const world = createWorld();
    const scene = new Scene();
    const renderSync = createRenderSync(world, scene);

    const object = new Object3D();
    world.add({ transform: createTransform(1, 2, 3, 0.5), renderable: { object } });
    renderSync.sync();

    expect(object.position.toArray()).toEqual([1, 2, 3]);
    expect(object.rotation.y).toBeCloseTo(0.5);
  });

  it("stops tracking after dispose", () => {
    const world = createWorld();
    const scene = new Scene();
    const renderSync = createRenderSync(world, scene);
    renderSync.dispose();

    world.add({ transform: createTransform(), renderable: { object: new Object3D() } });

    expect(scene.children).toHaveLength(0);
  });
});
