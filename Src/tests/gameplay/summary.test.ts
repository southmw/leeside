import { describe, expect, it } from "vitest";
import { playSummary } from "../../src/gameplay/summary";

describe("playSummary", () => {
  it("gives the time played as minutes and two-digit seconds", () => {
    expect(playSummary(760, 4, 1)).toEqual({ minutes: "12", seconds: "40", days: 4, deaths: 1 });
    expect(playSummary(65.9, 1, 0)).toMatchObject({ minutes: "1", seconds: "05" });
    expect(playSummary(0, 1, 0)).toMatchObject({ minutes: "0", seconds: "00" });
    expect(playSummary(3725, 9, 3)).toMatchObject({ minutes: "62", seconds: "05" });
  });

  it("makes sense of numbers that do not: no negative time, at least day 1, no negative deaths", () => {
    expect(playSummary(-5, 0, -2)).toEqual({ minutes: "0", seconds: "00", days: 1, deaths: 0 });
    expect(playSummary(Number.NaN, 2.7, 1.9)).toEqual({ minutes: "0", seconds: "00", days: 2, deaths: 1 });
  });
});
