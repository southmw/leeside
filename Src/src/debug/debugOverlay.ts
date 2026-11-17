import type { I18n } from "../locales/i18n";
import type { GameDebug } from "./debugApi";
import { GRAPH_GUIDES_MS, GRAPH_SCALE_MS, graphBar, type FrameLevel } from "./frameGraph";
import { LONG_FRAME_MS, VERY_LONG_FRAME_MS, type FrameStats } from "./frameStats";
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
#debug-overlay canvas { display: block; width: 100%; height: 48px; background: rgba(0, 0, 0, 0.35); }
`;

/** Graph size in canvas pixels. One column per frame in the statistics window. */
const GRAPH_WIDTH = 300;
const GRAPH_HEIGHT = 48;
const GRAPH_COLORS: Readonly<Record<FrameLevel, string>> = { ok: "#9fb58a", long: "#ffb347", veryLong: "#ff5a3c" };
const GRAPH_GUIDE_COLOR = "rgba(232, 220, 192, 0.3)";

const fixed = (value: number, digits = 0): string => value.toFixed(digits);
const integer = (value: number): string => Math.round(value).toLocaleString("en-US");

/**
 * Development-only panel with performance figures and live state, toggled with F3.
 * Start with `?debug` in the URL to show it from the first frame.
 */
export function createDebugOverlay(
  debug: GameDebug,
  i18n: I18n,
  frameStats: FrameStats,
  quality: Quality = "high",
): DebugOverlay {
  const { t } = i18n;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.append(style);

  const panel = document.createElement("div");
  panel.id = "debug-overlay";
  panel.hidden = !new URLSearchParams(window.location.search).has("debug");
  // The text is rebuilt on every refresh; the graph canvas stays, so it sits beside the text.
  const content = document.createElement("div");
  const graphTitle = document.createElement("div");
  graphTitle.className = "title";
  const graph = document.createElement("canvas");
  graph.id = "debug-frame-graph";
  graph.width = GRAPH_WIDTH;
  graph.height = GRAPH_HEIGHT;
  const hint = document.createElement("div");
  hint.className = "title";
  panel.append(content, graphTitle, graph, hint);
  document.body.append(panel);
  const graphContext = graph.getContext("2d");

  /** Newest frame at the right edge, one pixel column per frame. */
  const drawGraph = (): void => {
    if (!graphContext) {
      return;
    }
    graphContext.clearRect(0, 0, GRAPH_WIDTH, GRAPH_HEIGHT);
    const times = frameStats.times();
    const offset = GRAPH_WIDTH - times.length;
    for (let i = Math.max(0, -offset); i < times.length; i += 1) {
      const { height, level } = graphBar(times[i] ?? 0, GRAPH_HEIGHT);
      graphContext.fillStyle = GRAPH_COLORS[level];
      graphContext.fillRect(offset + i, GRAPH_HEIGHT - height, 1, height);
    }
    graphContext.fillStyle = GRAPH_GUIDE_COLOR;
    for (const guideMs of GRAPH_GUIDES_MS) {
      graphContext.fillRect(0, GRAPH_HEIGHT - Math.round((guideMs / GRAPH_SCALE_MS) * GRAPH_HEIGHT), GRAPH_WIDTH, 1);
    }
  };

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
    const { stats, input, player, view } = debug;
    const degrees = (radians: number): string => fixed((radians * 180) / Math.PI, 0);
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

    const sectionRow = (label: string, { avgMs, maxMs }: { avgMs: number; maxMs: number }): Row => ({
      label,
      value: t("debug.section_time_value", { avg: fixed(avgMs, 2), max: fixed(maxMs, 1) }),
    });

    content.innerHTML =
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
      section(t("debug.section.timing"), [
        sectionRow(t("debug.timing_sim"), stats.sections.sim),
        sectionRow(t("debug.timing_render"), stats.sections.render),
      ]) +
      section(t("debug.section.render"), [
        { label: t("debug.draw_calls"), value: integer(stats.drawCalls), ok: verdict.drawCalls },
        { label: t("debug.triangles"), value: integer(stats.triangles), ok: verdict.triangles },
        { label: t("debug.geometries"), value: integer(stats.geometries) },
        { label: t("debug.textures"), value: integer(stats.textures) },
        { label: t("debug.buffer"), value: `${debug.canvas.width} x ${debug.canvas.height}` },
        {
          label: t("debug.memory"),
          value:
            stats.heapMb === undefined
              ? t("debug.not_supported")
              : t("debug.memory_value", { mb: fixed(stats.heapMb, 1) }),
        },
      ]) +
      section(t("debug.section.world"), [
        {
          label: t("debug.zone"),
          value: t("debug.zone_value", {
            name: debug.zone.nameKey ? i18n.tData(debug.zone.nameKey) : "-",
            buildings: debug.zone.buildings,
            props: debug.zone.props,
            rocks: debug.zone.rocks,
          }),
        },
        {
          label: t("debug.weather"),
          value: t(Number.isFinite(debug.weather.secondsLeft) ? "debug.weather_value" : "debug.weather_value_open", {
            phase: t(`weather.${debug.weather.phase}`),
            seconds: fixed(Number.isFinite(debug.weather.secondsLeft) ? debug.weather.secondsLeft : 0, 0),
            intensity: fixed(debug.weather.intensity, 2),
            approach: fixed(debug.weather.approach, 2),
          }),
        },
        { label: t("debug.inside"), value: player.inside ?? "-" },
        { label: t("debug.entities"), value: integer(debug.entityCount) },
        { label: t("debug.bodies"), value: integer(debug.bodyCount) },
        { label: t("debug.position"), value: `${fixed(player.x, 2)}, ${fixed(player.y, 2)}, ${fixed(player.z, 2)}` },
        { label: t("debug.character_model"), value: `${player.model} / ${player.animation}` },
        { label: t("debug.move_speed"), value: t("debug.speed_value", { value: fixed(debug.moveSpeed, 1) }) },
        { label: t("debug.ground_height"), value: t("debug.metres", { value: fixed(player.groundHeight, 2) }) },
        { label: t("debug.grounded"), value: t(player.grounded ? "common.yes" : "common.no") },
        { label: t("debug.tick"), value: integer(debug.tick) },
        { label: t("debug.sim_time"), value: t("debug.sim_time_value", { seconds: fixed(debug.simSeconds, 1) }) },
        { label: t("debug.language"), value: t(`language.${i18n.language}`) },
      ]) +
      section(t("debug.section.input"), [
        {
          label: t("debug.view"),
          value: t("debug.view_value", { yaw: degrees(view.yaw), pitch: degrees(view.pitch) }),
        },
        { label: t("debug.camera_distance"), value: t("debug.camera_distance_value", {
            now: fixed(debug.camera.distance, 2),
            wanted: fixed(debug.camera.wantedDistance, 1),
          }),
        },
        { label: t("debug.mouse_look"), value: t(view.looking ? "common.yes" : "common.no") },
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
      ]);

    graphTitle.textContent = t("debug.graph_title", { count: GRAPH_WIDTH, max: GRAPH_SCALE_MS });
    hint.textContent = t("debug.hint_hide");
    drawGraph();
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
