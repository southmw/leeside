import type { GameDebug } from "./debugApi";
import { evaluateBudget, PERF_BUDGETS, type Quality } from "./perfBudget";

/** How often the text is rebuilt. Fast enough to follow, slow enough to read. */
const REFRESH_MS = 250;
const TOGGLE_KEY = "F3";

export interface DebugOverlay {
  /** Call once per rendered frame; the overlay refreshes itself on its own schedule. */
  update(nowMs: number): void;
  readonly visible: boolean;
}

interface Row {
  label: string;
  value: string;
  /** False when the value is outside the performance budget. */
  ok?: boolean;
}

const css = `
#debug-overlay {
  position: fixed; top: 8px; left: 8px; z-index: 1000;
  padding: 8px 10px; min-width: 250px;
  background: rgba(20, 19, 16, 0.82); border: 1px solid rgba(232, 220, 192, 0.25); border-radius: 4px;
  color: #e8dcc0; font: 12px/1.45 ui-monospace, Consolas, "Malgun Gothic", monospace;
  font-variant-numeric: tabular-nums; pointer-events: none; white-space: pre;
}
#debug-overlay[hidden] { display: none; }
#debug-overlay .row { display: flex; justify-content: space-between; gap: 16px; }
#debug-overlay .label { opacity: 0.7; }
#debug-overlay .over { color: #ff7a59; font-weight: 700; }
#debug-overlay .title { opacity: 0.55; margin: 6px 0 2px; letter-spacing: 0.08em; }
#debug-overlay .title:first-child { margin-top: 0; }
`;

const fixed = (value: number, digits = 0): string => value.toFixed(digits);
const integer = (value: number): string => Math.round(value).toLocaleString("en-US");

/**
 * Development-only panel with performance figures and live state, toggled with F3.
 * Start with `?debug` in the URL to show it from the first frame.
 */
export function createDebugOverlay(debug: GameDebug, quality: Quality = "high"): DebugOverlay {
  const style = document.createElement("style");
  style.textContent = css;
  document.head.append(style);

  const panel = document.createElement("div");
  panel.id = "debug-overlay";
  panel.hidden = !new URLSearchParams(window.location.search).has("debug");
  document.body.append(panel);

  window.addEventListener("keydown", (event) => {
    if (event.code === TOGGLE_KEY) {
      event.preventDefault(); // F3 is the browser's "find next".
      panel.hidden = !panel.hidden;
      lastRefresh = Number.NEGATIVE_INFINITY;
    }
  });

  let lastRefresh = Number.NEGATIVE_INFINITY;

  const section = (title: string, rows: Row[]): string =>
    `<div class="title">${title}</div>` +
    rows
      .map(
        ({ label, value, ok }) =>
          `<div class="row"><span class="label">${label}</span><span class="${ok === false ? "over" : ""}">${value}</span></div>`,
      )
      .join("");

  const render = (): void => {
    const { stats, input } = debug;
    const verdict = evaluateBudget(
      {
        avgFps: stats.avgFps,
        low1Fps: stats.low1Fps,
        drawCalls: stats.drawCalls,
        triangles: stats.triangles,
        veryLongFrames: stats.veryLongFrames,
      },
      PERF_BUDGETS[quality],
    );
    // Averages are meaningless for the first moments, so hold the verdict until there is data.
    const warmedUp = stats.samples >= 60;

    panel.innerHTML =
      section(`PERFORMANCE (budget: ${quality})`, [
        { label: "FPS", value: fixed(stats.fps) },
        { label: "FPS average", value: fixed(stats.avgFps, 1), ok: !warmedUp || verdict.avgFps },
        { label: "FPS 1% low", value: fixed(stats.low1Fps, 1), ok: !warmedUp || verdict.low1Fps },
        { label: "Frame time", value: `${fixed(stats.frameMs, 1)} ms (max ${fixed(stats.maxFrameMs, 1)})` },
        { label: "Frames > 34 ms", value: integer(stats.longFrames) },
        { label: "Frames > 50 ms", value: integer(stats.veryLongFrames), ok: verdict.veryLongFrames },
      ]) +
      section("RENDER", [
        { label: "Draw calls", value: integer(stats.drawCalls), ok: verdict.drawCalls },
        { label: "Triangles", value: integer(stats.triangles), ok: verdict.triangles },
        { label: "Geometries", value: integer(stats.geometries) },
        { label: "Textures", value: integer(stats.textures) },
        { label: "Buffer", value: `${debug.canvas.width} x ${debug.canvas.height}` },
      ]) +
      section("WORLD", [
        { label: "Entities", value: integer(debug.entityCount) },
        { label: "Tick", value: integer(debug.tick) },
        { label: "Sim time", value: `${fixed(debug.simSeconds, 1)} s` },
      ]) +
      section("INPUT", [
        { label: "Move", value: `${fixed(input.moveX, 2)}, ${fixed(input.moveY, 2)}` },
        {
          label: "Buttons",
          value:
            [
              input.jump && "jump",
              input.interact && "interact",
              input.useWater && "water",
              input.useBandage && "bandage",
            ]
              .filter(Boolean)
              .join(" ") || "-",
        },
      ]) +
      `<div class="title">F3 to hide</div>`;
  };

  return {
    update(nowMs: number): void {
      if (panel.hidden || nowMs - lastRefresh < REFRESH_MS) {
        return;
      }
      lastRefresh = nowMs;
      render();
    },
    get visible(): boolean {
      return !panel.hidden;
    },
  };
}
