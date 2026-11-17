import type { ZoneProp } from "./zoneDefinition";

/**
 * Which model a prop is drawn with, as plain data. A prop with a model takes its size from
 * the model, so that what blocks the player matches what is seen. Props without an entry
 * here, and props whose model could not be fetched, are drawn as their box (world/props.ts).
 *
 * Paths are relative to the `models/` folder; the files are built by scripts/build-props.mjs.
 */

export interface PropModelDefinition {
  url: string;
  /**
   * Size of the prop when drawn with this model, in metres: width, height, length. It is the
   * prop's collider, and the model is drawn as long as it. The sizes keep the proportions the
   * pack itself has between its cars and its people (a person there is 1.52 units tall, here
   * 1.8 m), with the width a little inside the mirrors and wheel arches.
   */
  size: readonly [number, number, number];
  /** Lying on its roof. */
  upsideDown?: boolean;
}

/** The models to choose from for each kind of prop. */
export const PROP_MODELS: Readonly<Partial<Record<ZoneProp["kind"], readonly PropModelDefinition[]>>> = {
  car: [
    { url: "props/car_sports.glb", size: [2.9, 1.9, 6.7] },
    { url: "props/car_pickup.glb", size: [2.5, 2.1, 6.1] },
  ],
  overturned_car: [{ url: "props/car_pickup.glb", size: [2.5, 2.1, 6.1], upsideDown: true }],
};

/** A small stable number from a text, so the same prop always gets the same model. */
function hash(text: string): number {
  let value = 0;
  for (let index = 0; index < text.length; index += 1) {
    value = (value * 31 + text.charCodeAt(index)) >>> 0;
  }
  return value;
}

/** The model for this prop, or undefined if its kind is drawn as a box. */
export function propModelFor(prop: Pick<ZoneProp, "id" | "kind">): PropModelDefinition | undefined {
  const choices = PROP_MODELS[prop.kind];
  if (!choices || choices.length === 0) {
    return undefined;
  }
  return choices[hash(prop.id) % choices.length];
}

/** Every model file the props of a zone need, each listed once. */
export function propModelUrls(props: ReadonlyArray<Pick<ZoneProp, "id" | "kind">>): string[] {
  const urls = new Set<string>();
  for (const prop of props) {
    const model = propModelFor(prop);
    if (model) {
      urls.add(model.url);
    }
  }
  return [...urls];
}
