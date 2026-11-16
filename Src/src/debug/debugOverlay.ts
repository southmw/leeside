import type { I18n } from "../locales/i18n";
import type { GameDebug } from "./debugApi";
import { LONG_FRAME_MS, VERY_LONG_FRAME_MS } from "./frameStats";
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
export function createDebugOverlay(debug: GameDebug, i18n: I18n, quality: Quality = "high"): DebugOverlay {
  const { t } = i18n;
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
  // Redraw straight away when the language changes instead of waiting for the next refresh.
  i18n.onChange(() => {
    lastRefresh = Number.NEGATIVE_INFINITY;
  });

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
      section(t("debug.section.performance", { quality: t(`quality.${quality}`) }), [
        { label: t("debug.fps"), value: fixed(stats.fps) },
        { label: t("debug.fps_average"), value: fixed(stats.avgFps, 1), ok: !warmedUp || verdict.avgFps },
        { label: t("debug.fps_low1"), value: fixed(stats.low1Fps, 1), ok: !warmedUp || verdict.low1Fps },
        {
          label: t("debug.frame_time"),
          value: t("debug.frame_time_value", { ms: fixed(stats.frameMs, 1), max: fixed(stats.maxFrameMs, 1) }),
        },
        { label: t("debug.frames_over", { ms: LONG_FRAME_MS }), value: integer(stats.longFrames) },
        {
          label: t("debug.frames_over", { ms: VERY_LONG_FRAME_MS }),
          value: integer(stats.veryLongFrames),
          ok: verdict.veryLongFrames,
        },
      ]) +
      section(t("debug.section.render"), [
        { label: t("debug.draw_calls"), value: integer(stats.drawCalls), ok: verdict.drawCalls },
        { label: t("debug.triangles"), value: integer(stats.triangles), ok: verdict.triangles },
        { label: t("debug.geometries"), value: integer(stats.geometries) },
        { label: t("debug.textures"), value: integer(stats.textures) },
        { label: t("debug.buffer"), value: `${debug.canvas.width} x ${debug.canvas.height}` },
      ]) +
      section(t("debug.section.world"), [
        { label: t("debug.entities"), value: integer(debug.entityCount) },
        { label: t("debug.tick"), value: integer(debug.tick) },
        { label: t("debug.sim_time"), value: t("debug.sim_time_value", { seconds: fixed(debug.simSeconds, 1) }) },
        { label: t("debug.language"), value: t(`language.${i18n.language}`) },
      ]) +
      section(t("debug.section.input"), [
        { label: t("debug.move"), value: `${fixed(input.moveX, 2)}, ${fixed(input.moveY, 2)}` },
        {
          label: t("debug.buttons"),
          value:
            [
              input.jump && t("debug.button.jump"),
              input.interact && t("debug.button.interact"),
              input.useWater && t("debug.button.water"),
              input.useBandage && t("debug.button.bandage"),
            ]
              .filter(Boolean)
              .join(" ") || "-",
        },
      ]) +
      `<div class="title">${t("debug.hint_hide")}</div>`;
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
