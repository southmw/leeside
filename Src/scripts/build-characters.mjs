// Builds the character model files in public/models from the original asset pack.
//
// The pack's character files (Quaternius, Zombie Apocalypse Kit, CC0) each carry ten weapons
// in the hand and twenty animations, as text with the data embedded. This keeps the character
// and the animations the game plays, and writes a compact binary file (.glb).
//
// The originals are not in the repository. Download the pack (see public/models/CREDITS.md),
// unpack it into assets-src/ and run:  node scripts/build-characters.mjs

import { existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { packGlb, readEmbeddedGltf } from "./lib/gltfPack.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(root, "assets-src", "Zombie Apocalypse Kit - March 2024", "Characters", "glTF");
const outDir = join(root, "public", "models");

const CHARACTERS = ["Matt", "Lis", "Sam", "Shaun"];
/** Objects in the files that are not part of the character. */
const WEAPONS = ["Axe", "Guitar", "Knife", "Pistol", "Rifle", "Shotgun", "SMG", "Spear", "WoodenBat_Barbed", "WoodenBat_Saw"];
/** Must match the clip names in src/render/characterCatalog.ts. */
const ANIMATIONS = ["Idle", "Run", "Jump_Idle", "Death"];

function build(name) {
  const { json, source } = readEmbeddedGltf(join(sourceDir, `Characters_${name}.gltf`));

  // Detach the weapons. Their nodes stay in the list so that no index shifts, but they are
  // no longer part of the scene and no longer hold a mesh.
  const weaponNodes = new Set(json.nodes.flatMap((node, index) => (WEAPONS.includes(node.name) ? [index] : [])));
  if (weaponNodes.size !== WEAPONS.length) {
    throw new Error(`${name}: found ${weaponNodes.size} of ${WEAPONS.length} weapons`);
  }
  for (const node of json.nodes) {
    if (node.children) {
      node.children = node.children.filter((child) => !weaponNodes.has(child));
    }
  }
  for (const index of weaponNodes) {
    delete json.nodes[index].mesh;
    delete json.nodes[index].children;
  }

  json.animations = ANIMATIONS.map((clip) => {
    const animation = json.animations.find((candidate) => candidate.name === clip);
    if (!animation) {
      throw new Error(`${name}: no "${clip}" animation`);
    }
    return animation;
  });

  const glb = packGlb(name, json, source);

  const file = join(outDir, `${name.toLowerCase()}.glb`);
  writeFileSync(file, glb);
  console.log(`${name.toLowerCase()}.glb  ${(glb.length / 1024).toFixed(0)} KB`);
}

if (!existsSync(sourceDir)) {
  console.error(`The original pack is not in ${sourceDir}. See public/models/CREDITS.md for where to get it.`);
  process.exit(1);
}
CHARACTERS.forEach(build);
