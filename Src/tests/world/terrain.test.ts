import { beforeAll, describe, expect, it } from "vitest";
import { CHARACTER_HEIGHT, MOVE_SPEED } from "../../src/data/tuning";
import { settleVertical, stepVertical } from "../../src/gameplay/verticalMotion";
import { CHARACTER_SKIN, initPhysics, PhysicsWorld } from "../../src/physics/physicsWorld";
import { buildTerrainGeometry, cellSize, createHeightfield, heightAt } from "../../src/world/terrain";
import { loadDryRiverbed } from "../../src/world/zones/dryRiverbed";
import { dryRiverbedHeight } from "../../src/world/zones/dryRiverbedTerrain";

// 3 x 3 samples over 20 m: cells are 10 m. Heights by row from the north.
const field = createHeightfield(3, 20, [
  0, 1, 2,
  3, 4, 8,
  6, 7, 5,
]);

describe("createHeightfield", () => {
  it("rejects a grid whose length does not match", () => {
    expect(() => createHeightfield(3, 20, [1, 2, 3])).toThrow(RangeError);
    expect(() => createHeightfield(1, 20, [1])).toThrow(RangeError);
  });

  it("knows its cell size", () => {
    expect(cellSize(field)).toBe(10);
  });
});

describe("heightAt", () => {
  it("returns the stored height at every sample point", () => {
    for (let row = 0; row < 3; row += 1) {
      for (let column = 0; column < 3; column += 1) {
        expect(heightAt(field, column * 10, row * 10)).toBe(field.heights[row * 3 + column]);
      }
    }
  });

  it("is linear along grid lines", () => {
    expect(heightAt(field, 5, 0)).toBeCloseTo(0.5);
    expect(heightAt(field, 0, 5)).toBeCloseTo(1.5);
    expect(heightAt(field, 20, 15)).toBeCloseTo(6.5);
  });

  it("is linear along the diagonal each cell is split by", () => {
    // North-west cell: the diagonal runs from its north-east corner (1) to its south-west (3).
    expect(heightAt(field, 5, 5)).toBeCloseTo(2);
  });

  it("follows the triangle the point is in, on either side of the diagonal", () => {
    // North-west cell, corners NW 0, NE 1, SW 3, SE 4.
    expect(heightAt(field, 2, 2)).toBeCloseTo(0 + 0.2 * 1 + 0.2 * 3);
    expect(heightAt(field, 8, 8)).toBeCloseTo(4 + 0.2 * (3 - 4) + 0.2 * (1 - 4));
  });

  it("is continuous across the diagonal and across cell borders", () => {
    const step = 1e-6;
    expect(heightAt(field, 5 - step, 5 - step)).toBeCloseTo(heightAt(field, 5 + step, 5 + step), 4);
    expect(heightAt(field, 10 - step, 3)).toBeCloseTo(heightAt(field, 10 + step, 3), 4);
    expect(heightAt(field, 7, 10 - step)).toBeCloseTo(heightAt(field, 7, 10 + step), 4);
  });

  it("uses the nearest edge outside the zone", () => {
    expect(heightAt(field, -50, 0)).toBe(0);
    expect(heightAt(field, 500, 500)).toBe(5);
    expect(heightAt(field, 10, -3)).toBe(1);
  });
});

describe("buildTerrainGeometry", () => {
  const { positions, indices } = buildTerrainGeometry(field);
  const vertex = (index: number) => ({
    x: positions[index * 3] ?? Number.NaN,
    y: positions[index * 3 + 1] ?? Number.NaN,
    z: positions[index * 3 + 2] ?? Number.NaN,
  });

  it("has one vertex per sample and two triangles per cell", () => {
    expect(positions.length).toBe(9 * 3);
    expect(indices.length).toBe(4 * 2 * 3);
  });

  it("puts each vertex at its sample's position and height", () => {
    expect(vertex(0)).toEqual({ x: 0, y: 0, z: 0 });
    expect(vertex(5)).toEqual({ x: 20, y: 8, z: 10 });
    expect(vertex(8)).toEqual({ x: 20, y: 5, z: 20 });
  });

  it("winds every triangle counter-clockwise seen from above, so it faces up", () => {
    for (let i = 0; i < indices.length; i += 3) {
      const a = vertex(indices[i] ?? 0);
      const b = vertex(indices[i + 1] ?? 0);
      const c = vertex(indices[i + 2] ?? 0);
      // Y component of (b - a) x (c - a).
      const normalY = (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z);
      expect(normalY).toBeGreaterThan(0);
    }
  });

  it("matches heightAt everywhere on its triangles", () => {
    for (let i = 0; i < indices.length; i += 3) {
      const a = vertex(indices[i] ?? 0);
      const b = vertex(indices[i + 1] ?? 0);
      const c = vertex(indices[i + 2] ?? 0);
      // A point inside the triangle, as a weighted mix of its corners.
      const x = 0.2 * a.x + 0.3 * b.x + 0.5 * c.x;
      const y = 0.2 * a.y + 0.3 * b.y + 0.5 * c.y;
      const z = 0.2 * a.z + 0.3 * b.z + 0.5 * c.z;
      expect(heightAt(field, x, z)).toBeCloseTo(y);
    }
  });
});

describe("dry riverbed terrain", () => {
  const zone = loadDryRiverbed();
  const terrain = createHeightfield(zone.terrain.samples, zone.size, zone.terrain.heights);

  it("is a valid zone", () => {
    expect(zone.id).toBe("dry_riverbed");
    expect(zone.size).toBe(720);
  });

  it("has a riverbed 2 to 3 m lower than the land on either side", () => {
    for (const south of [113, 281, 491, 619]) {
      // The channel meanders, so find its lowest point on this line rather than assume x = 360.
      let bed = Number.POSITIVE_INFINITY;
      for (let x = 320; x <= 400; x += 2) {
        bed = Math.min(bed, heightAt(terrain, x, south));
      }
      const west = heightAt(terrain, 240, south);
      const east = heightAt(terrain, 480, south);
      expect(west - bed).toBeGreaterThan(1.8);
      expect(west - bed).toBeLessThan(3.2);
      expect(east - bed).toBeGreaterThan(1.8);
    }
  });

  it("puts the start and the line of cars in the riverbed, and house A on the plain", () => {
    expect(heightAt(terrain, 360, 619)).toBeLessThan(0.6);
    expect(heightAt(terrain, 375, 491)).toBeLessThan(0.6);
    expect(heightAt(terrain, 281, 281)).toBeGreaterThan(1.8);
  });

  it("raises a mound in the east for house B", () => {
    expect(heightAt(terrain, 563, 206)).toBeGreaterThan(heightAt(terrain, 563, 560) + 2);
  });

  it("has no slope too steep to walk", () => {
    const cell = cellSize(terrain);
    let steepest = 0;
    for (let row = 0; row < terrain.samples; row += 1) {
      for (let column = 0; column < terrain.samples - 1; column += 1) {
        const here = terrain.heights[row * terrain.samples + column] ?? 0;
        const east = terrain.heights[row * terrain.samples + column + 1] ?? 0;
        const south = terrain.heights[Math.min(row + 1, terrain.samples - 1) * terrain.samples + column] ?? 0;
        steepest = Math.max(steepest, Math.abs(east - here) / cell, Math.abs(south - here) / cell);
      }
    }
    // Well under the 45 degree limit (a slope of 1): the land is meant to be easy to cross.
    expect(steepest).toBeLessThan(0.5);
  });

  it("is the same every time", () => {
    expect(loadDryRiverbed().terrain.heights).toEqual(zone.terrain.heights);
    expect(dryRiverbedHeight(123.4, 56.7)).toBe(dryRiverbedHeight(123.4, 56.7));
  });
});

describe("character on terrain", () => {
  beforeAll(async () => {
    await initPhysics();
  });

  const zone = loadDryRiverbed();
  const terrain = createHeightfield(zone.terrain.samples, zone.size, zone.terrain.heights);
  const standingHeight = CHARACTER_HEIGHT / 2 + CHARACTER_SKIN;

  function setup() {
    const physics = new PhysicsWorld();
    const { positions, indices } = buildTerrainGeometry(terrain);
    physics.addStaticMesh(positions, indices);
    return physics;
  }

  /** Moves a character with gravity for `ticks` steps, walking by `stepX`, `stepZ` each step. */
  function simulate(physics: PhysicsWorld, handle: number, ticks: number, stepX = 0, stepZ = 0) {
    const state = { velocityY: 0, grounded: false, jumpHeld: false };
    const pose = { x: 0, y: 0, z: 0, rotationY: 0 };
    let worstGap = 0;
    let airborne = 0;
    for (let tick = 0; tick < ticks; tick += 1) {
      const wasGrounded = state.grounded;
      const wanted = stepVertical(state, false, 1 / 60);
      const result = physics.moveCharacter(handle, { x: stepX, y: wanted, z: stepZ }, wasGrounded);
      if (result) {
        settleVertical(state, wanted, result.y, result.grounded);
      }
      physics.step();
      physics.readPose(handle, pose);
      if (wasGrounded) {
        worstGap = Math.max(worstGap, Math.abs(pose.y - heightAt(terrain, pose.x, pose.z) - standingHeight));
        airborne += state.grounded ? 0 : 1;
      }
    }
    return { pose, state, worstGap, airborne };
  }

  it.each([
    ["in the riverbed", 360, 619],
    ["on the plain", 190, 380],
    ["on a bank", 313, 380],
    ["on the mound", 540, 230],
  ])("comes to rest at ground height when dropped %s", (_where, x, z) => {
    const physics = setup();
    const ground = heightAt(terrain, x, z);
    const handle = physics.addCharacter({ x, y: ground + 5, z });
    physics.step();

    const { pose, state } = simulate(physics, handle, 120);
    expect(state.grounded).toBe(true);
    expect(pose.y - ground).toBeCloseTo(standingHeight, 1);
    physics.dispose();
  });

  it("stays on the surface while walking across the riverbed from one plain to the other", () => {
    const physics = setup();
    const handle = physics.addCharacter({ x: 270, y: heightAt(terrain, 270, 380) + standingHeight, z: 380 });
    physics.step();

    // At walking speed eastwards for 15 seconds: down one bank, across the floor, up the other.
    const { pose, worstGap, airborne } = simulate(physics, handle, 15 * 60, MOVE_SPEED / 60, 0);
    expect(pose.x).toBeGreaterThan(440);
    expect(worstGap).toBeLessThan(0.1);
    expect(airborne).toBeLessThan(12);
    physics.dispose();
  });
});
