// Puts the prop model files into public/models/props from the original asset packs (all CC0).
//   quaternius/  Zombie Apocalypse Kit (cars, containers) and Stylized Nature MegaKit (rocks)
// The file names must match src/world/propModels.ts.
//
// The originals are not in the repository. Download the packs (see public/models/CREDITS.md),
// unpack them into assets-src/ and run:  node scripts/build-props.mjs

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { packGlb, readEmbeddedGltf } from "./lib/gltfPack.mjs";
import { resizePng } from "./lib/resizeImage.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sources = join(root, "assets-src");
const outDir = join(root, "public", "models", "props");

const report = (file) => console.log(`${file}  ${(readFileSync(join(outDir, file)).length / 1024).toFixed(0)} KB`);
const need = (dir) => {
  if (!existsSync(dir)) {
    console.error(`An original pack is not in ${dir}. See public/models/CREDITS.md for where to get it.`);
    process.exit(1);
  }
  return dir;
};

// Zombie Apocalypse Kit: text files with the data embedded, rewritten as compact binary files.
const zombieKit = need(join(sources, "Zombie Apocalypse Kit - March 2024"));
const ZOMBIE_KIT = {
  "Vehicles/glTF/Vehicle_Sports.gltf": "car_sports.glb",
  "Vehicles/glTF/Vehicle_Pickup.gltf": "car_pickup.glb",
  "Environment/glTF/Container_Red.gltf": "container_red.glb",
  "Environment/glTF/Container_Green.gltf": "container_green.glb",
};
mkdirSync(join(outDir, "quaternius"), { recursive: true });
for (const [from, to] of Object.entries(ZOMBIE_KIT)) {
  const { json, source } = readEmbeddedGltf(join(zombieKit, from));
  writeFileSync(join(outDir, "quaternius", to), packGlb(to, json, source));
  report(`quaternius/${to}`);
}

// Stylized Nature MegaKit: each rock is a .gltf with its data and texture in separate files.
// The pack has a desert version of the rock texture, which suits the dry riverbed; the files
// name the grey one, so the name is swapped. The texture is 2048 pixels wide (2 MB), far more
// than rocks seen from a few metres need, so it is made smaller.
const natureKit = need(join(sources, "nature", "glTF"));
const ROCK_TEXTURE = "Rocks_Desert_Diffuse.png";
const ROCK_TEXTURE_SIZE = 512;
for (const name of ["Rock_Medium_1", "Rock_Medium_2", "Rock_Medium_3"]) {
  const json = JSON.parse(readFileSync(join(natureKit, `${name}.gltf`), "utf8"));
  for (const image of json.images ?? []) {
    image.uri = ROCK_TEXTURE;
  }
  const to = `${name.toLowerCase()}.gltf`;
  writeFileSync(join(outDir, "quaternius", to), JSON.stringify(json));
  for (const buffer of json.buffers) {
    copyFileSync(join(natureKit, buffer.uri), join(outDir, "quaternius", buffer.uri));
  }
  report(`quaternius/${to}`);
}
writeFileSync(join(outDir, "quaternius", ROCK_TEXTURE), await resizePng(join(natureKit, ROCK_TEXTURE), ROCK_TEXTURE_SIZE));
report(`quaternius/${ROCK_TEXTURE}`);
