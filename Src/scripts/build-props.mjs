// Builds the prop model files in public/models/props from the original asset pack
// (Quaternius, Zombie Apocalypse Kit, CC0): the same models, as compact binary files (.glb).
//
// The originals are not in the repository. Download the pack (see public/models/CREDITS.md),
// unpack it into assets-src/ and run:  node scripts/build-props.mjs

import { existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { packGlb, readEmbeddedGltf } from "./lib/gltfPack.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(root, "assets-src", "Zombie Apocalypse Kit - March 2024");
const outDir = join(root, "public", "models", "props");

/** Source file in the pack -> file name in the game. Must match src/world/propModels.ts. */
const PROPS = {
  "Vehicles/glTF/Vehicle_Sports.gltf": "car_sports.glb",
  "Vehicles/glTF/Vehicle_Pickup.gltf": "car_pickup.glb",
};

if (!existsSync(sourceDir)) {
  console.error(`The original pack is not in ${sourceDir}. See public/models/CREDITS.md for where to get it.`);
  process.exit(1);
}
for (const [from, to] of Object.entries(PROPS)) {
  const { json, source } = readEmbeddedGltf(join(sourceDir, from));
  const glb = packGlb(to, json, source);
  writeFileSync(join(outDir, to), glb);
  console.log(`${to}  ${(glb.length / 1024).toFixed(0)} KB`);
}
