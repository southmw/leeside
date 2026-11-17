// Builds the character model files in public/models from the original asset pack.
//
// The pack's character files (Quaternius, Zombie Apocalypse Kit, CC0) each carry ten weapons
// in the hand and twenty animations, as text with the data embedded. This keeps the character
// and the animations the game plays, and writes a compact binary file (.glb).
//
// The originals are not in the repository. Download the pack (see public/models/CREDITS.md),
// unpack it into assets-src/ and run:  node scripts/build-characters.mjs

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(root, "assets-src", "Zombie Apocalypse Kit - March 2024", "Characters", "glTF");
const outDir = join(root, "public", "models");

const CHARACTERS = ["Matt", "Lis", "Sam", "Shaun"];
/** Objects in the files that are not part of the character. */
const WEAPONS = ["Axe", "Guitar", "Knife", "Pistol", "Rifle", "Shotgun", "SMG", "Spear", "WoodenBat_Barbed", "WoodenBat_Saw"];
/** Must match the clip names in src/render/characterCatalog.ts. */
const ANIMATIONS = ["Idle", "Run", "Jump_Idle"];

/** Renumbers the entries of `list` that `used` names, and returns the old-to-new index map. */
function compact(list, used) {
  const map = new Map();
  const kept = [];
  list.forEach((item, index) => {
    if (used.has(index)) {
      map.set(index, kept.length);
      kept.push(item);
    }
  });
  return { kept, map };
}

function build(name) {
  const json = JSON.parse(readFileSync(join(sourceDir, `Characters_${name}.gltf`), "utf8"));
  if (json.buffers.length !== 1 || !json.buffers[0].uri?.startsWith("data:")) {
    throw new Error(`${name}: expected one embedded buffer`);
  }
  const source = Buffer.from(json.buffers[0].uri.slice(json.buffers[0].uri.indexOf(",") + 1), "base64");

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

  // Keep only the meshes still in use, then the data they, the skeleton and the animations use.
  const meshes = compact(json.meshes, new Set(json.nodes.flatMap((node) => (node.mesh === undefined ? [] : [node.mesh]))));
  json.meshes = meshes.kept;
  for (const node of json.nodes) {
    if (node.mesh !== undefined) {
      node.mesh = meshes.map.get(node.mesh);
    }
  }

  const usedAccessors = new Set();
  for (const mesh of json.meshes) {
    for (const primitive of mesh.primitives) {
      Object.values(primitive.attributes).forEach((index) => usedAccessors.add(index));
      if (primitive.indices !== undefined) {
        usedAccessors.add(primitive.indices);
      }
      if (primitive.targets) {
        throw new Error(`${name}: morph targets are not handled`);
      }
    }
  }
  for (const skin of json.skins ?? []) {
    if (skin.inverseBindMatrices !== undefined) {
      usedAccessors.add(skin.inverseBindMatrices);
    }
  }
  for (const animation of json.animations) {
    for (const sampler of animation.samplers) {
      usedAccessors.add(sampler.input);
      usedAccessors.add(sampler.output);
    }
  }
  const accessors = compact(json.accessors, usedAccessors);
  json.accessors = accessors.kept;
  const accessor = (index) => accessors.map.get(index);
  for (const mesh of json.meshes) {
    for (const primitive of mesh.primitives) {
      for (const key of Object.keys(primitive.attributes)) {
        primitive.attributes[key] = accessor(primitive.attributes[key]);
      }
      if (primitive.indices !== undefined) {
        primitive.indices = accessor(primitive.indices);
      }
    }
  }
  for (const skin of json.skins ?? []) {
    if (skin.inverseBindMatrices !== undefined) {
      skin.inverseBindMatrices = accessor(skin.inverseBindMatrices);
    }
  }
  for (const animation of json.animations) {
    for (const sampler of animation.samplers) {
      sampler.input = accessor(sampler.input);
      sampler.output = accessor(sampler.output);
    }
  }

  const usedViews = new Set();
  for (const item of [...json.accessors, ...(json.images ?? [])]) {
    if (item.bufferView !== undefined) {
      usedViews.add(item.bufferView);
    }
  }
  const views = compact(json.bufferViews, usedViews);
  for (const item of [...json.accessors, ...(json.images ?? [])]) {
    if (item.bufferView !== undefined) {
      item.bufferView = views.map.get(item.bufferView);
    }
  }

  // Pack the data that is left into one buffer, each piece starting on a 4-byte boundary.
  const pieces = [];
  let length = 0;
  for (const view of views.kept) {
    const bytes = source.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
    view.buffer = 0;
    view.byteOffset = length;
    const padding = (4 - (bytes.length % 4)) % 4;
    pieces.push(bytes, Buffer.alloc(padding));
    length += bytes.length + padding;
  }
  json.bufferViews = views.kept;
  json.buffers = [{ byteLength: length }];
  const binary = Buffer.concat(pieces, length);

  // The binary container: a 12-byte header, then the JSON and the data, each padded to 4 bytes.
  let text = Buffer.from(JSON.stringify(json), "utf8");
  text = Buffer.concat([text, Buffer.alloc((4 - (text.length % 4)) % 4, " ")]);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); // "glTF"
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + text.length + 8 + binary.length, 8);
  const chunk = (type, data) => {
    const head = Buffer.alloc(8);
    head.writeUInt32LE(data.length, 0);
    head.writeUInt32LE(type, 4);
    return Buffer.concat([head, data]);
  };
  const glb = Buffer.concat([header, chunk(0x4e4f534a, text), chunk(0x004e4942, binary)]);

  const file = join(outDir, `${name.toLowerCase()}.glb`);
  writeFileSync(file, glb);
  console.log(`${name.toLowerCase()}.glb  ${(glb.length / 1024).toFixed(0)} KB`);
}

if (!existsSync(sourceDir)) {
  console.error(`The original pack is not in ${sourceDir}. See public/models/CREDITS.md for where to get it.`);
  process.exit(1);
}
CHARACTERS.forEach(build);
