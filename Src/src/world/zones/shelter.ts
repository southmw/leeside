import { parseZoneDefinition, type ZoneDefinition } from "../zoneDefinition";

/**
 * The shelter (prototype design 5.5): one room under house A, 16 m square, with the door
 * whose repair is the prototype's goal and the ladder out.
 */

export const SHELTER_SIZE = 16;

const definition = {
  id: "shelter",
  nameKey: "zone.shelter.name",
  size: SHELTER_SIZE,
  // A level floor.
  terrain: { samples: 2, heights: [0, 0, 0, 0] },
  interior: { height: 3.5 },
  // Where one comes in, and where a game that starts here (`?zone=shelter`) starts: with the
  // ladder behind, looking north into the room. Well clear of the south wall: nearer to it
  // the camera, which stands behind the character, was pushed up against the ladder and saw
  // nothing else.
  spawn: { position: [8, 10], facing: 0 },
  entries: [{ id: "from_riverbed", position: [8, 10], facing: 0 }],
  // On the south wall.
  // The door to repair, in the middle of the north wall: what one sees on coming in.
  props: [{ id: "shelter_door", kind: "shelter_door", position: [8, 0.2] }],
  exits: [{ id: "to_riverbed", position: [8, 15.8], shape: "ladder", to: "dry_riverbed", entry: "from_shelter" }],
};

/** Validates and returns the zone. Throws with every problem listed if the definition is wrong. */
export function loadShelter(): ZoneDefinition {
  const result = parseZoneDefinition(definition);
  if (!result.ok) {
    throw new Error(`Zone "shelter" is invalid:\n${result.errors.join("\n")}`);
  }
  return result.zone;
}
