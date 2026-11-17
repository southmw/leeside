import { describe, expect, it } from "vitest";
import {
  characterById,
  CHARACTERS,
  chooseCharacter,
  DEFAULT_CHARACTER,
  neighbourCharacter,
} from "../../src/render/characterCatalog";

describe("character catalog", () => {
  it("has four characters with ids and files of their own", () => {
    expect(CHARACTERS).toHaveLength(4);
    expect(new Set(CHARACTERS.map((character) => character.id)).size).toBe(4);
    expect(new Set(CHARACTERS.map((character) => character.url)).size).toBe(4);
  });

  it("finds a character by id and falls back to the default", () => {
    expect(characterById("lis").id).toBe("lis");
    expect(characterById("nobody").id).toBe(DEFAULT_CHARACTER);
    expect(characterById(null).id).toBe(DEFAULT_CHARACTER);
  });
});

describe("chooseCharacter", () => {
  it("takes the first wish that names a character", () => {
    expect(chooseCharacter("sam", "lis")).toBe("sam");
    expect(chooseCharacter(null, "lis")).toBe("lis");
  });

  it("skips wishes that name no character", () => {
    expect(chooseCharacter("robot", "shaun")).toBe("shaun");
    expect(chooseCharacter("", undefined)).toBe(DEFAULT_CHARACTER);
    expect(chooseCharacter()).toBe(DEFAULT_CHARACTER);
  });
});

describe("neighbourCharacter", () => {
  it("steps through the list in both directions", () => {
    expect(neighbourCharacter("matt", 1)).toBe("lis");
    expect(neighbourCharacter("lis", -1)).toBe("matt");
  });

  it("wraps round at the ends", () => {
    expect(neighbourCharacter("shaun", 1)).toBe("matt");
    expect(neighbourCharacter("matt", -1)).toBe("shaun");
  });

  it("starts from the first character for an unknown id", () => {
    expect(neighbourCharacter("nobody", 1)).toBe("lis");
  });
});
