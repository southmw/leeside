import type { WebGLRenderer } from "three";
import type { GameDebug } from "./debugApi";
import { readDevice } from "./deviceInfo";

/** Must match DEV_LOG_PATH in scripts/devLogPlugin.mjs. */
const DEV_LOG_PATH = "/__devlog";
/** How often a performance sample is written. */
const SAMPLE_INTERVAL_MS = 5000;
/** Frames to collect before the first sample, so start-up hitches do not dominate it. */
const WARM_UP_SAMPLES = 60;

export interface DevLog {
  /** Call once per rendered frame. */
  update(nowMs: number): void;
}

function send(entry: Record<string, unknown>): void {
  // keepalive lets the last sample go out while the page is closing.
  void fetch(DEV_LOG_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entry),
    keepalive: true,
  }).catch(() => {
    // The log is a convenience; a failed write must never disturb the game.
  });
}

/**
 * Development-only performance log. While the game runs under `npm run dev` it posts a
 * sample every few seconds to the dev server, which appends it to Src/logs/perf.jsonl.
 * Read the result with `npm run perf:report`.
 *
 * Automated browsers (the smoke test) are skipped so the log holds real sessions only.
 */
export function createDevLog(debug: GameDebug, renderer: WebGLRenderer): DevLog {
  if (navigator.webdriver) {
    return { update: () => {} };
  }

  const session = crypto.randomUUID().slice(0, 8);
  const query = window.location.search;
  let lastSampleAt = Number.NEGATIVE_INFINITY;
  let started = false;

  const sample = (kind: "perf" | "end"): void => {
    send({
      kind,
      session,
      simSeconds: Math.round(debug.simSeconds * 10) / 10,
      canvas: `${debug.canvas.width}x${debug.canvas.height}`,
      entities: debug.entityCount,
      stats: { ...debug.stats },
    });
  };

  window.addEventListener("pagehide", () => {
    if (started) {
      sample("end");
    }
  });

  return {
    update(nowMs: number): void {
      if (document.hidden || debug.stats.samples < WARM_UP_SAMPLES) {
        return;
      }
      if (!started) {
        started = true;
        send({ kind: "start", session, query, device: readDevice(renderer) });
      }
      if (nowMs - lastSampleAt >= SAMPLE_INTERVAL_MS) {
        lastSampleAt = nowMs;
        sample("perf");
      }
    },
  };
}
