import { describe, expect, it } from "vitest";
import { createWeather, readWeather, stormOfDay } from "../../src/gameplay/weather";
import { stormWallAt, WALL_ARRIVAL_DISTANCE, WALL_HEIGHT, WALL_START_DISTANCE } from "../../src/render/stormWall";

const SEED = 7;
const weather = createWeather(SEED);
const storm = stormOfDay(SEED, 1);
const arrives = storm.start + storm.warningSeconds;
const wallAt = (time: number) => stormWallAt(readWeather(weather, time));

describe("stormWallAt", () => {
  it("is not there in clear weather", () => {
    expect(wallAt(storm.start - 5).opacity).toBe(0);
    expect(wallAt(arrives + storm.stormSeconds + storm.fadeSeconds + 5).opacity).toBe(0);
  });

  it("takes shape on the horizon when the warning begins", () => {
    expect(wallAt(storm.start)).toEqual({ distance: WALL_START_DISTANCE, opacity: 0 });
    expect(wallAt(storm.start + 1).opacity).toBeGreaterThan(0.2);
    expect(wallAt(storm.start + 4).opacity).toBe(1);
  });

  it("comes nearer every second and is at the player's side as the warning ends", () => {
    let previous = wallAt(storm.start).distance;
    for (let second = 1; second < storm.warningSeconds; second += 1) {
      const now = wallAt(storm.start + second).distance;
      expect(now).toBeLessThan(previous);
      previous = now;
    }
    expect(wallAt(arrives - 0.01).distance).toBeCloseTo(WALL_ARRIVAL_DISTANCE, 0);
  });

  it("grows on screen all through the warning, not only in its last seconds", () => {
    // How high the wall's top stands above the horizon, in degrees.
    const heightOnScreen = (time: number): number => (Math.atan2(WALL_HEIGHT, wallAt(time).distance) * 180) / Math.PI;
    expect(heightOnScreen(storm.start)).toBeLessThan(6);
    const quarter = storm.warningSeconds / 4;
    const gains = [1, 2, 3, 4].map((step) => heightOnScreen(storm.start + step * quarter - 0.01) - heightOnScreen(storm.start + (step - 1) * quarter));
    // Each quarter of the warning adds a visible amount, and none adds most of it.
    for (const gain of gains) {
      expect(gain).toBeGreaterThan(3);
      expect(gain).toBeLessThan(40);
    }
    // Half way through it is a few hundred metres off: plainly coming, not yet overhead.
    const halfWay = wallAt(storm.start + storm.warningSeconds / 2).distance;
    expect(halfWay).toBeGreaterThan(350);
    expect(halfWay).toBeLessThan(700);
    expect(heightOnScreen(arrives - 0.01)).toBeGreaterThan(75);
  });

  it("passes on north and thins out as the storm reaches full strength", () => {
    expect(wallAt(arrives).distance).toBeCloseTo(WALL_ARRIVAL_DISTANCE);
    expect(wallAt(arrives).opacity).toBe(1);
    const passing = wallAt(arrives + 2);
    expect(passing.distance).toBeLessThan(-60);
    expect(wallAt(arrives + 1).distance).toBeLessThan(0);
    expect(passing.opacity).toBeGreaterThan(0);
    expect(passing.opacity).toBeLessThan(1);
    expect(wallAt(arrives + 4).opacity).toBe(0);
  });

  it("does not come back while the storm dies down", () => {
    expect(wallAt(arrives + storm.stormSeconds + 5).opacity).toBe(0);
  });

  it("never jumps from one tick to the next", () => {
    let previous = wallAt(storm.start - 1);
    for (let time = storm.start - 1; time < arrives + 10; time += 1 / 60) {
      const now = wallAt(time);
      expect(Math.abs(now.opacity - previous.opacity)).toBeLessThan(0.06);
      // Only compared while the wall can be seen; unseen, it waits back on the horizon.
      if (now.opacity > 0 && previous.opacity > 0) {
        expect(Math.abs(now.distance - previous.distance)).toBeLessThan(8);
      }
      previous = now;
    }
  });
});
