/**
 * The characters a player can choose from, as plain data: which file a character is in and
 * which of its animation clips the game plays. Loading and mixing live in characterModel.ts.
 *
 * The files are built from the original pack by scripts/build-characters.mjs, which keeps
 * only the clips named here.
 */

export interface CharacterDefinition {
  id: string;
  /** Text key of the character's name. */
  nameKey: string;
  /** The model file with its animations, relative to the `models/` folder. */
  url: string;
  /** Names of the clips for each animation the game uses. `jump` loops while in the air. */
  clips: { idle: string; run: string; jump: string };
  /**
   * Speed in m/s at which the run clip's feet match the ground when played at normal rate,
   * for a model scaled to the character's height. Found by eye; adjust if the feet slide.
   */
  runClipSpeed: number;
}

function survivor(id: string): CharacterDefinition {
  return {
    id,
    nameKey: `character.${id}`,
    url: `${id}.glb`,
    clips: { idle: "Idle", run: "Run", jump: "Jump_Idle" },
    runClipSpeed: 7,
  };
}

export const CHARACTERS: readonly CharacterDefinition[] = [
  survivor("matt"),
  survivor("lis"),
  survivor("sam"),
  survivor("shaun"),
];

export const DEFAULT_CHARACTER = "matt";

/** The character with this id, or the default one for an unknown or missing id. */
export function characterById(id: string | null | undefined): CharacterDefinition {
  const found = CHARACTERS.find((character) => character.id === id);
  if (found) {
    return found;
  }
  const fallback = CHARACTERS.find((character) => character.id === DEFAULT_CHARACTER);
  if (!fallback) {
    throw new Error(`Default character "${DEFAULT_CHARACTER}" is not in the catalog`);
  }
  return fallback;
}

/**
 * Which character to start with: the first of `wishes` that names a character, or the
 * default. Wishes come from the address (`?character=lis`) and from the last choice kept in
 * the browser, either of which may be missing or out of date.
 */
export function chooseCharacter(...wishes: Array<string | null | undefined>): string {
  const known = wishes.find((wish) => CHARACTERS.some((character) => character.id === wish));
  return known ?? DEFAULT_CHARACTER;
}

/** The character `step` places after `id` in the list (before it for -1), wrapping round. */
export function neighbourCharacter(id: string, step: 1 | -1): string {
  const index = CHARACTERS.findIndex((character) => character.id === id);
  const next = CHARACTERS[(Math.max(index, 0) + step + CHARACTERS.length) % CHARACTERS.length];
  return next ? next.id : DEFAULT_CHARACTER;
}
