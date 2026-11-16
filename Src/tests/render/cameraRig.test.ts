import { describe, expect, it } from "vitest";
import { computeCameraPose } from "../../src/render/cameraRig";

const character = { x: 10, y: 1, z: -5 };
const rig = { distance: 4.5, shoulderOffset: 0.5, pivotHeight: 0.6 };

describe("computeCameraPose", () => {
  it("sits behind and to the right of the character when level", () => {
    const { position, target } = computeCameraPose(character, 0, 0, rig);
    expect(position.x).toBeCloseTo(10.5);
    expect(position.y).toBeCloseTo(1.6);
    expect(position.z).toBeCloseTo(-0.5);
    // Looks straight along -Z.
    expect(target.x - position.x).toBeCloseTo(0);
    expect(target.y - position.y).toBeCloseTo(0);
    expect(target.z - position.z).toBeCloseTo(-1);
  });

  it("orbits with yaw: after a quarter turn left it is on the +X side, looking along -X", () => {
    const { position, target } = computeCameraPose(character, Math.PI / 2, 0, rig);
    expect(position.x).toBeCloseTo(14.5);
    expect(position.z).toBeCloseTo(-5.5);
    expect(target.x - position.x).toBeCloseTo(-1);
    expect(target.z - position.z).toBeCloseTo(0);
  });

  it("rises when the view looks down and drops when it looks up", () => {
    const down = computeCameraPose(character, 0, -Math.PI / 6, rig);
    expect(down.position.y).toBeCloseTo(1.6 + 4.5 * 0.5);
    expect(down.target.y).toBeLessThan(down.position.y);

    const up = computeCameraPose(character, 0, Math.PI / 6, rig);
    expect(up.position.y).toBeCloseTo(1.6 - 4.5 * 0.5);
    expect(up.target.y).toBeGreaterThan(up.position.y);
  });

  it("stays the configured distance from the shoulder point at any angle", () => {
    for (const [yaw, pitch] of [[0, 0], [1, 0.5], [-2, -1], [3, 1.2]] as const) {
      const { position } = computeCameraPose(character, yaw, pitch, rig);
      const shoulder = {
        x: character.x + Math.cos(yaw) * 0.5,
        y: character.y + 0.6,
        z: character.z - Math.sin(yaw) * 0.5,
      };
      const distance = Math.hypot(position.x - shoulder.x, position.y - shoulder.y, position.z - shoulder.z);
      expect(distance).toBeCloseTo(4.5);
    }
  });

  it("follows the character", () => {
    const a = computeCameraPose({ x: 0, y: 0, z: 0 }, 0.3, 0.2, rig);
    const b = computeCameraPose({ x: 5, y: 2, z: -7 }, 0.3, 0.2, rig);
    expect(b.position.x - a.position.x).toBeCloseTo(5);
    expect(b.position.y - a.position.y).toBeCloseTo(2);
    expect(b.position.z - a.position.z).toBeCloseTo(-7);
  });
});
