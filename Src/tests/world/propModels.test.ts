import { describe, expect, it } from "vitest";
import { PROP_MODELS, propModelFor, propModelUrls } from "../../src/world/propModels";

describe("propModelFor", () => {
  it("gives a car one of the car models", () => {
    const model = propModelFor({ id: "car_line", kind: "car" });
    expect(PROP_MODELS.car).toContain(model);
  });

  it("gives the same prop the same model every time", () => {
    const first = propModelFor({ id: "abandoned_car", kind: "car" });
    expect(propModelFor({ id: "abandoned_car", kind: "car" })).toBe(first);
  });

  it("uses more than one model across differently named cars", () => {
    const ids = ["car_line", "car_line_second", "abandoned_car", "a", "b", "c", "d", "e"];
    const urls = new Set(ids.map((id) => propModelFor({ id, kind: "car" })?.url));
    expect(urls.size).toBeGreaterThan(1);
  });

  it("lays an overturned car on its roof", () => {
    expect(propModelFor({ id: "overturned_car", kind: "overturned_car" })?.upsideDown).toBe(true);
  });

  it("has no model for kinds that are still drawn as boxes", () => {
    expect(propModelFor({ id: "camp", kind: "tent" })).toBeUndefined();
    expect(propModelFor({ id: "dry_well", kind: "well" })).toBeUndefined();
  });
});

describe("propModelUrls", () => {
  it("lists each file once and nothing for boxes", () => {
    const urls = propModelUrls([
      { id: "overturned_car", kind: "overturned_car" },
      { id: "another", kind: "overturned_car" },
      { id: "camp", kind: "tent" },
    ]);
    expect(urls).toEqual(["props/car_pickup.glb"]);
    expect(propModelUrls([{ id: "camp", kind: "tent" }])).toEqual([]);
  });
});
