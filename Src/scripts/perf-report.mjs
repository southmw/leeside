// Summarises Src/logs/perf.jsonl, the log written while the game runs under `npm run dev`.
//
//   npm run perf:report            every session
//   npm run perf:report -- 3       the latest 3 sessions
//
// Software-rendered sessions (headless browsers) are marked, since their numbers say
// nothing about real performance.

import { readFile } from "node:fs/promises";
import { PERF_LOG_FILE } from "./devLogPlugin.mjs";

const limit = Number.parseInt(process.argv[2] ?? "", 10);

let text;
try {
  text = await readFile(PERF_LOG_FILE, "utf8");
} catch {
  console.log(`No log yet (${PERF_LOG_FILE}).\nRun "npm run dev", open the game and leave it running for a while.`);
  process.exit(0);
}

const sessions = new Map();
for (const line of text.split("\n")) {
  if (!line.trim()) {
    continue;
  }
  let entry;
  try {
    entry = JSON.parse(line);
  } catch {
    continue;
  }
  if (!entry.session) {
    continue;
  }
  const session = sessions.get(entry.session) ?? { id: entry.session, samples: [] };
  sessions.set(entry.session, session);
  if (entry.kind === "start") {
    session.startedAt = entry.receivedAt;
    session.device = entry.device;
    session.query = entry.query;
  } else if (entry.stats) {
    session.samples.push(entry);
  }
}

const all = [...sessions.values()].filter((session) => session.samples.length > 0);
const shown = Number.isFinite(limit) && limit > 0 ? all.slice(-limit) : all;

if (shown.length === 0) {
  console.log("The log has no performance samples yet. Leave the game running for at least 10 seconds.");
  process.exit(0);
}

const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
const fixed = (value, digits = 1) => value.toFixed(digits);

console.log(`\nPerformance log: ${shown.length} of ${all.length} session(s)\n`);
for (const session of shown) {
  const stats = session.samples.map((sample) => sample.stats);
  const last = session.samples[session.samples.length - 1];
  const gpu = session.device?.gpu ?? "unknown";
  const software = /swiftshader|llvmpipe|software/i.test(gpu);

  console.log(`Session ${session.id}  ${session.startedAt ?? ""}${session.query ? `  ${session.query}` : ""}`);
  console.log(`  GPU            ${gpu}${software ? "   <-- SOFTWARE RENDERING, numbers not meaningful" : ""}`);
  console.log(
    `  Display        screen ${session.device?.screen ?? "?"}, pixel ratio ${session.device?.devicePixelRatio ?? "?"}, buffer ${last.canvas}`,
  );
  console.log(`  Duration       ${fixed(last.simSeconds, 0)} s simulated, ${session.samples.length} samples`);
  console.log(
    `  FPS            average ${fixed(mean(stats.map((s) => s.avgFps)))}   1% low: typical ${fixed(mean(stats.map((s) => s.low1Fps)))}, worst ${fixed(Math.min(...stats.map((s) => s.low1Fps)))}`,
  );
  console.log(
    `  Frame time     average ${fixed(mean(stats.map((s) => 1000 / Math.max(s.avgFps, 0.001))))} ms   worst frame ${fixed(Math.max(...stats.map((s) => s.maxFrameMs)))} ms`,
  );
  console.log(`  Long frames    over 34 ms: ${last.stats.longFrames}   over 50 ms: ${last.stats.veryLongFrames}`);
  console.log(
    `  Render         draw calls up to ${Math.max(...stats.map((s) => s.drawCalls))}, triangles up to ${Math.max(...stats.map((s) => s.triangles)).toLocaleString("en-US")}`,
  );
  console.log(
    `  GPU resources  geometries ${stats[0].geometries} -> ${last.stats.geometries}, textures ${stats[0].textures} -> ${last.stats.textures}, entities ${session.samples[0].entities} -> ${last.entities}`,
  );
  console.log("");
}
