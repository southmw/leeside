import type { ZoneProp } from "./zoneDefinition";

/**
 * Which models props and rocks are drawn with, as plain data. A prop with a model takes its
 * size from the model, so that what blocks the player matches what is seen. Props without an
 * entry, and props whose model could not be fetched, are drawn as their box (world/props.ts).
 *
 * The models come from Quaternius' packs, chosen over Kenney's after trying both (development
 * plan step 2.31). The set "boxes" has no models, for comparing looks and performance.
 *
 * Paths are relative to the `models/` folder; the files are put there by scripts/build-props.mjs.
 */

export interface PropModelDefinition {
  /**
   * The model files. One file is the usual case. Several are laid side by side across the
   * prop's width ("row", e.g. containers blocking an exit) or put in the same place
   * ("stack", e.g. a tent's frame and its canvas).
   */
  urls: readonly string[];
  arrange?: "row" | "stack";
  /**
   * Size of the prop when drawn with this model, in metres: width, height, length. It is the
   * prop's collider. The model is scaled, keeping its proportions, to be as long as this (in
   * a row: so that each part is as wide as its share of the width).
   */
  size: readonly [number, number, number];
  /** Lying on its roof. */
  upsideDown?: boolean;
}

export interface PropSet {
  props: Readonly<Partial<Record<ZoneProp["kind"], readonly PropModelDefinition[]>>>;
  /**
   * Models for the scattered rocks large enough to be obstacles; each uses one of them.
   * Empty: all rocks are plain shapes.
   */
  rocks: readonly string[];
  /**
   * Colour of the small rocks, which stay plain shapes so that a thousand of them cost
   * little to draw. Chosen to go with the rock models. Leave out for the usual colour.
   */
  pebbleColor?: number;
}

/** Size of the cars of the Quaternius kit, at the scale its people have next to them (1.52 units -> 1.8 m). */
const SPORTS_CAR = [2.9, 1.9, 6.7] as const;
const PICKUP = [2.5, 2.1, 6.1] as const;
export const PROP_SETS = {
  quaternius: {
    props: {
      car: [
        { urls: ["props/quaternius/car_sports.glb"], size: SPORTS_CAR },
        { urls: ["props/quaternius/car_pickup.glb"], size: PICKUP },
      ],
      overturned_car: [{ urls: ["props/quaternius/car_pickup.glb"], size: PICKUP, upsideDown: true }],
      // Two shipping containers end to end across a blocked exit.
      barrier: [
        {
          urls: ["props/quaternius/container_red.glb", "props/quaternius/container_green.glb"],
          arrange: "row",
          size: [13.4, 3.0, 3.0],
        },
      ],
    },
    rocks: [
      "props/quaternius/rock_medium_1.gltf",
      "props/quaternius/rock_medium_2.gltf",
      "props/quaternius/rock_medium_3.gltf",
    ],
    pebbleColor: 0xb0703a,
  },
  /** Nothing has a model: every prop is its box and rocks are plain shapes. */
  boxes: { props: {}, rocks: [] },
} as const satisfies Record<string, PropSet>;

export type PropSetId = keyof typeof PROP_SETS;
export const PROP_SET_IDS = Object.keys(PROP_SETS) as PropSetId[];
export const DEFAULT_PROP_SET: PropSetId = "quaternius";

/** The set with this id, or the default one for an unknown or missing id. */
export function propSetId(id: string | null | undefined): PropSetId {
  return PROP_SET_IDS.find((candidate) => candidate === id) ?? DEFAULT_PROP_SET;
}

/** A small stable number from a text, so the same prop always gets the same model. */
function hash(text: string): number {
  let value = 0;
  for (let index = 0; index < text.length; index += 1) {
    value = (value * 31 + text.charCodeAt(index)) >>> 0;
  }
  return value;
}

/** The model for this prop in a set, or undefined if it is drawn as a box there. */
export function propModelFor(
  prop: Pick<ZoneProp, "id" | "kind">,
  set: PropSetId = DEFAULT_PROP_SET,
): PropModelDefinition | undefined {
  const choices: PropSet["props"][ZoneProp["kind"]] = (PROP_SETS[set] as PropSet).props[prop.kind];
  if (!choices || choices.length === 0) {
    return undefined;
  }
  return choices[hash(prop.id) % choices.length];
}

/** Every model file a set needs for these props and for rocks, each listed once. */
export function propModelUrls(
  props: ReadonlyArray<Pick<ZoneProp, "id" | "kind">>,
  set: PropSetId = DEFAULT_PROP_SET,
): string[] {
  const urls = new Set<string>((PROP_SETS[set] as PropSet).rocks);
  for (const prop of props) {
    for (const url of propModelFor(prop, set)?.urls ?? []) {
      urls.add(url);
    }
  }
  return [...urls];
}
