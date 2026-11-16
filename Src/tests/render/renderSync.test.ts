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

  it("draws between the captured and the current transform", () => {
    const world = createWorld();
    const renderSync = createRenderSync(world, new Scene());
    const object = new Object3D();
    const entity = world.add({ transform: createTransform(0, 0, 0, 0), renderable: { object } });

    renderSync.capture();
    Object.assign(entity.transform, { x: 10, y: 2, z: -4, rotationY: 1 });

    renderSync.sync(0);
    expect(object.position.toArray()).toEqual([0, 0, 0]);

    renderSync.sync(0.25);
    expect(object.position.x).toBeCloseTo(2.5);
    expect(object.position.y).toBeCloseTo(0.5);
    expect(object.position.z).toBeCloseTo(-1);
    expect(object.rotation.y).toBeCloseTo(0.25);

    renderSync.sync(1);
    expect(object.position.toArray()).toEqual([10, 2, -4]);
  });

  it("does not change the transform itself", () => {
    const world = createWorld();
    const renderSync = createRenderSync(world, new Scene());
    const entity = world.add({ transform: createTransform(0, 0, 0), renderable: { object: new Object3D() } });
    renderSync.capture();
    entity.transform.x = 10;
    renderSync.sync(0.5);
    expect(entity.transform.x).toBe(10);
  });

  it("blends from the latest capture when several steps run before a frame", () => {
    const world = createWorld();
    const renderSync = createRenderSync(world, new Scene());
    const object = new Object3D();
    const entity = world.add({ transform: createTransform(0, 0, 0), renderable: { object } });

    renderSync.capture();
    entity.transform.x = 1;
    renderSync.capture();
    entity.transform.x = 2;

    renderSync.sync(0.5);
    expect(object.position.x).toBeCloseTo(1.5);
  });

  it("draws an entity that has not been through a step where it is", () => {
    const world = createWorld();
    const renderSync = createRenderSync(world, new Scene());
    const object = new Object3D();
    world.add({ transform: createTransform(5, 0, 0), renderable: { object } });

    renderSync.sync(0.3);
    expect(object.position.x).toBe(5);
  });

  it("turns the shorter way round", () => {
    const world = createWorld();
    const renderSync = createRenderSync(world, new Scene());
    const object = new Object3D();
    const entity = world.add({ transform: createTransform(0, 0, 0, Math.PI - 0.1), renderable: { object } });

    renderSync.capture();
    entity.transform.rotationY = -Math.PI + 0.1;
    renderSync.sync(0.5);

    // Half way across the +-PI seam, not half way back through zero.
    expect(Math.abs(object.rotation.y)).toBeCloseTo(Math.PI);
  });

  it("does not slide an entity across a gap after snap", () => {
    const world = createWorld();
    const renderSync = createRenderSync(world, new Scene());
    const object = new Object3D();
    const entity = world.add({ transform: createTransform(0, 0, 0), renderable: { object } });

    renderSync.capture();
    entity.transform.x = 500;
    renderSync.snap(entity);
    renderSync.sync(0.5);
    expect(object.position.x).toBe(500);
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
