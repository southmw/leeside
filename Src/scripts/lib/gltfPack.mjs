// Shared by the model build scripts: reads a glTF file with embedded data and writes what is
// still in use as a compact binary file (.glb).

import { readFileSync } from "node:fs";

/** Reads a .gltf whose single buffer is embedded as a data URI. */
export function readEmbeddedGltf(file) {
  const json = JSON.parse(readFileSync(file, "utf8"));
  if (json.buffers.length !== 1 || !json.buffers[0].uri?.startsWith("data:")) {
    throw new Error(`${file}: expected one embedded buffer`);
  }
  const source = Buffer.from(json.buffers[0].uri.slice(json.buffers[0].uri.indexOf(",") + 1), "base64");
  return { json, source };
}

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

/**
 * Drops the meshes no node uses and the data nothing uses any more, and returns the rest as
 * the bytes of a .glb file. `json` is changed in place; `name` is only for error messages.
 */
export function packGlb(name, json, source) {
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
  for (const animation of json.animations ?? []) {
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
  for (const animation of json.animations ?? []) {
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

  return glb;
}
