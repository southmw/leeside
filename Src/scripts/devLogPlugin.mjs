// Vite dev-server plugin: receives log entries from the running game and appends them to
// Src/logs/perf.jsonl (one JSON object per line). Development only — it is never part of
// a production build, and the deployed game has no server to send anything to.

import { appendFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
export const LOG_DIR = join(root, "logs");
export const PERF_LOG_FILE = join(LOG_DIR, "perf.jsonl");
export const DEV_LOG_PATH = "/__devlog";

/** Entries are small; anything larger than this is rejected. */
const MAX_BODY_BYTES = 64 * 1024;

/** @returns {import("vite").Plugin} */
export function devLogPlugin() {
  return {
    name: "leeside-dev-log",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(DEV_LOG_PATH, (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end();
          return;
        }

        const chunks = [];
        let size = 0;
        let rejected = false;
        req.on("data", (chunk) => {
          size += chunk.length;
          if (size > MAX_BODY_BYTES) {
            rejected = true;
            res.statusCode = 413;
            res.end();
            req.destroy();
            return;
          }
          chunks.push(chunk);
        });
        req.on("end", async () => {
          if (rejected) {
            return;
          }
          try {
            const entry = JSON.parse(Buffer.concat(chunks).toString("utf8"));
            if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
              throw new Error("entry must be a JSON object");
            }
            const line = JSON.stringify({ receivedAt: new Date().toISOString(), ...entry });
            await mkdir(LOG_DIR, { recursive: true });
            await appendFile(PERF_LOG_FILE, `${line}\n`, "utf8");
            res.statusCode = 204;
          } catch {
            res.statusCode = 400;
          }
          res.end();
        });
      });
    },
  };
}
