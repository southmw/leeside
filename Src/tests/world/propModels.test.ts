import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROP_SET,
  PROP_SET_IDS,
  PROP_SETS,
  propModelFor,
  propModelUrls,
  propSetId,
} from "../../src/world/propModels";
import { PROP_SHAPES, propSize } from "../../src/world/props";

describe("prop sets", () => {
  it("has the chosen pack and a set without models", () => {
    expect(PROP_SET_IDS).toEqual(["quaternius", "boxes"]);
  });

  it("resolves an id, falling back to the default", () => {
    expect(propSetId("boxes")).toBe("boxes");
    expect(propSetId("nothing")).toBe(DEFAULT_PROP_SET);
    expect(propSetId(null)).toBe(DEFAULT_PROP_SET);
  });

  it("gives every model a sensible size", () => {
    for (const id of PROP_SET_IDS) {
      for (const choices of Object.values(PROP_SETS[id].props)) {
        for (const model of choices) {
          expect(model.urls.length).toBeGreaterThan(0);
          for (const metres of model.size) {
            expect(metres).toBeGreaterThan(0.5);
            expect(metres).toBeLessThan(20);
          }
        }
      }
    }
  });

  it("keeps blocked-exit barriers too high to jump over in every set", () => {
    for (const id of PROP_SET_IDS) {
      expect(propSize({ id: "north_exit_rubble", kind: "barrier" }, id)[1]).toBeGreaterThan(1.5);
    }
  });
});

describe("propModelFor", () => {
  it("gives a car one of the set's car models", () => {
    expect(PROP_SETS.quaternius.props.car).toContain(propModelFor({ id: "car_line", kind: "car" }, "quaternius"));
  });

  it("gives the same prop the same model every time", () => {
    const first = propModelFor({ id: "abandoned_car", kind: "car" });
    expect(propModelFor({ id: "abandoned_car", kind: "car" })).toBe(first);
  });

  it("uses more than one model across differently named cars", () => {
    const ids = ["car_line", "car_line_second", "abandoned_car", "a", "b", "c", "d", "e"];
    const urls = new Set(ids.map((id) => propModelFor({ id, kind: "car" })?.urls[0]));
    expect(urls.size).toBeGreaterThan(1);
  });

  it("lays an overturned car on its roof", () => {
    expect(propModelFor({ id: "overturned_car", kind: "overturned_car" }, "quaternius")?.upsideDown).toBe(true);
  });

  it("has no model where a pack has nothing suitable", () => {
    expect(propModelFor({ id: "camp", kind: "tent" }, "quaternius")).toBeUndefined();
    expect(propModelFor({ id: "dry_well", kind: "well" }, "quaternius")).toBeUndefined();
  });

  it("has no models at all in the set of boxes", () => {
    expect(propModelFor({ id: "car_line", kind: "car" }, "boxes")).toBeUndefined();
    expect(propSize({ id: "car_line", kind: "car" }, "boxes")).toEqual(PROP_SHAPES.car.size);
  });
});

describe("propModelUrls", () => {
  it("lists each file once: the props' models and the set's rocks", () => {
    const urls = propModelUrls(
      [
        { id: "overturned_car", kind: "overturned_car" },
        { id: "another", kind: "overturned_car" },
        { id: "dry_well", kind: "well" },
      ],
      "quaternius",
    );
    expect(urls).toHaveLength(new Set(urls).size);
    expect(urls).toContain("props/quaternius/car_pickup.glb");
    expect(urls).toEqual(expect.arrayContaining([...PROP_SETS.quaternius.rocks]));
    expect(urls).toHaveLength(1 + PROP_SETS.quaternius.rocks.length);
  });

  it("lists nothing for the set of boxes", () => {
    expect(propModelUrls([{ id: "car_line", kind: "car" }], "boxes")).toEqual([]);
  });
});
