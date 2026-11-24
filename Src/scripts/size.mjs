// Reports how much a visitor downloads (plan step 2.26) and fails if the part needed before
// play is over budget. Run after a build: `npm run build && npm run size` (`npm run check`
// does both).
//
// The "start bundle" is everything the game fetches on a visit: the page, the code, the
// sounds, the props of the zones and one character model. The other characters are fetched
// only when chosen, so the biggest one stands for whichever the visitor picks.
//
// Sizes are those of the files as they are. A host that compresses text (most do) sends the
// code in about a third of that; the figure in brackets is the size after gzip. The budget is
// judged on the uncompressed size, which is the worst case.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

/** The most the start bundle may weigh (technical design 15). */
const START_BUDGET_BYTES = 10 * 1024 * 1024;
/** From this share of the budget on the report says how little room is left. */
const WARN_SHARE = 0.9;
/** Kinds of file a host compresses on the way; the rest (models, sounds, pictures) go as they are. */
const COMPRESSIBLE = new Set([".js", ".css", ".html", ".svg", ".json", ".gltf", ".md", ".txt"]);
/** Files nobody downloads by playing: they are there to be read. */
const NOT_FETCHED = new Set(["CREDITS.md"]);

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");

function listFiles(folder) {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

let files;
try {
  files = listFiles(dist);
} catch {
  console.error("No build found in dist/. Run `npm run build` first.");
  process.exit(1);
}

const entries = files
  .filter((path) => !NOT_FETCHED.has(path.split(/[\/]/).pop() ?? ""))
  .map((path) => {
    const name = relative(dist, path).replaceAll("\\", "/");
    const bytes = statSync(path).size;
    const gzip = COMPRESSIBLE.has(extname(path).toLowerCase()) ? gzipSync(readFileSync(path)).length : bytes;
    // A character model lies directly in models/; props lie deeper.
    const character = /^models\/[^/]+\.glb$/.test(name);
    return { name, bytes, gzip, character };
  });

const characters = entries.filter((entry) => entry.character).sort((one, other) => other.bytes - one.bytes);
const biggestCharacter = characters[0];
const groups = [
  { title: "Page and code", match: (entry) => /^(index\.html|favicon\.svg|assets\/)/.test(entry.name) },
  { title: "Sounds", match: (entry) => entry.name.startsWith("sounds/") },
  { title: "Props and rocks", match: (entry) => entry.name.startsWith("models/") && !entry.character },
  { title: "One character (the biggest)", match: (entry) => entry === biggestCharacter },
];

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;
const total = (list, key) => list.reduce((sum, entry) => sum + entry[key], 0);
const line = (label, bytes, gzip) => `  ${label.padEnd(34)} ${mb(bytes).padStart(9)}   (${mb(gzip)} compressed)`;

console.log("\nBuild size (dist/)\n");
const start = [];
for (const group of groups) {
  const members = entries.filter(group.match);
  start.push(...members);
  console.log(line(group.title, total(members, "bytes"), total(members, "gzip")));
}
const startBytes = total(start, "bytes");
console.log(`  ${"-".repeat(34)}`);
console.log(line("Start bundle", startBytes, total(start, "gzip")));
const others = characters.slice(1);
console.log(line(`Other characters (${others.length}, on demand)`, total(others, "bytes"), total(others, "gzip")));
console.log(line("Everything", total(entries, "bytes"), total(entries, "gzip")));

console.log("\nLargest files\n");
for (const entry of [...entries].sort((one, other) => other.bytes - one.bytes).slice(0, 6)) {
  console.log(`  ${mb(entry.bytes).padStart(9)}  ${entry.name}`);
}

const share = startBytes / START_BUDGET_BYTES;
console.log(`\nStart bundle: ${mb(startBytes)} of ${mb(START_BUDGET_BYTES)} (${(share * 100).toFixed(0)}%).`);
if (share > 1) {
  console.error("Size check FAILED: the start bundle is over budget.\n");
  process.exit(1);
}
console.log(share > WARN_SHARE ? "Size check passed, but with little room left.\n" : "Size check passed.\n");
