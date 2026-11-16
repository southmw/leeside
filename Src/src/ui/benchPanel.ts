import type { BenchRow } from "../bench/benchRecorder";
import type { DeviceInfo } from "../debug/deviceInfo";
import type { I18n, MessageKey } from "../locales/i18n";

const css = `
#bench-progress {
  position: fixed; left: 50%; top: 16px; transform: translateX(-50%); z-index: 20;
  padding: 8px 14px; border-radius: 4px; pointer-events: none;
  background: rgba(20, 19, 16, 0.75); color: #e8dcc0; font-size: 15px; white-space: nowrap;
}
#bench-result {
  position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 20;
  min-width: 380px; max-width: 90vw; padding: 20px 24px; border-radius: 6px;
  background: rgba(20, 19, 16, 0.92); border: 1px solid rgba(232, 220, 192, 0.25);
  color: #e8dcc0; font-size: 14px; line-height: 1.5;
}
#bench-result h2 { margin: 0 0 4px; font-size: 18px; }
#bench-result .verdict { margin-bottom: 12px; font-weight: 700; }
#bench-result .verdict.pass { color: #a9cf8a; }
#bench-result .verdict.over { color: #ff7a59; }
#bench-result .row { display: flex; justify-content: space-between; gap: 24px; font-variant-numeric: tabular-nums; }
#bench-result .row .label { opacity: 0.75; }
#bench-result .row .over { color: #ff7a59; font-weight: 700; }
#bench-result .device { margin-top: 12px; padding-top: 10px; border-top: 1px solid rgba(232, 220, 192, 0.2); font-size: 12px; opacity: 0.8; word-break: break-word; }
#bench-result button {
  margin-top: 14px; padding: 6px 14px; border-radius: 4px; cursor: pointer;
  background: #e8dcc0; color: #1b1a17; border: 0; font: inherit; font-weight: 700;
}
#bench-result .note { margin-top: 10px; font-size: 12px; opacity: 0.65; }
#bench-progress[hidden], #bench-result[hidden] { display: none; }
`;

const ROW_LABELS: Readonly<Record<BenchRow["key"], MessageKey>> = {
  avgFps: "bench.row.avg_fps",
  low1Fps: "bench.row.low1_fps",
  avgFrameMs: "bench.row.avg_frame",
  maxFrameMs: "bench.row.max_frame",
  longFrames: "bench.row.long_frames",
  veryLongFrames: "bench.row.very_long_frames",
  maxDrawCalls: "bench.row.draw_calls",
  maxTriangles: "bench.row.triangles",
  avgSimMs: "bench.row.sim",
  avgRenderMs: "bench.row.render",
  duration: "bench.row.duration",
  frames: "bench.row.frames",
};

export interface BenchResultView {
  rows: readonly BenchRow[];
  withinBudget: boolean;
  /** Text key of the quality setting the budget belongs to. */
  qualityKey: MessageKey;
  device: DeviceInfo;
  /** Size of the drawing buffer, such as "1920 x 911". */
  buffer: string;
}

export interface BenchPanel {
  showProgress(fraction: number): void;
  showResult(result: BenchResultView): void;
}

/** The result as plain text, for pasting into a message. */
export function benchReportText(result: BenchResultView, i18n: I18n): string {
  const { t } = i18n;
  const lines = [
    `LEESIDE - ${t("bench.title")} (${t("bench.budget", { quality: t(result.qualityKey) })})`,
    t(result.withinBudget ? "bench.verdict_pass" : "bench.verdict_over"),
    ...result.rows.map((row) => {
      const mark = row.ok === undefined ? "" : `  [${t(row.ok ? "bench.ok" : "bench.over")}]`;
      return `${t(ROW_LABELS[row.key])}: ${row.value}${mark}`;
    }),
    `${t("bench.device.gpu")}: ${result.device.gpu}`,
    `${t("bench.device.screen")}: ${result.device.screen}, ${t("bench.device.buffer")} ${result.buffer}, x${result.device.devicePixelRatio}`,
    `${t("bench.device.browser")}: ${result.device.userAgent}`,
  ];
  return lines.join("\n");
}

/** Shows the progress of a performance measurement and, at the end, its result with a copy button. */
export function createBenchPanel(i18n: I18n): BenchPanel {
  const { t } = i18n;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.append(style);

  const progress = document.createElement("div");
  progress.id = "bench-progress";
  const panel = document.createElement("div");
  panel.id = "bench-result";
  panel.hidden = true;
  document.body.append(progress, panel);

  const element = (tag: string, className: string, text: string): HTMLElement => {
    const node = document.createElement(tag);
    node.className = className;
    node.textContent = text;
    return node;
  };

  return {
    showProgress(fraction: number): void {
      progress.textContent = t("bench.measuring", { percent: Math.round(fraction * 100) });
    },
    showResult(result: BenchResultView): void {
      progress.hidden = true;
      panel.replaceChildren(
        element("h2", "", t("bench.title")),
        element(
          "div",
          `verdict ${result.withinBudget ? "pass" : "over"}`,
          `${t(result.withinBudget ? "bench.verdict_pass" : "bench.verdict_over")} (${t("bench.budget", { quality: t(result.qualityKey) })})`,
        ),
      );
      for (const row of result.rows) {
        const line = element("div", "row", "");
        line.append(
          element("span", "label", t(ROW_LABELS[row.key])),
          element("span", row.ok === false ? "over" : "", row.ok === false ? `${row.value}  (${t("bench.over")})` : row.value),
        );
        panel.append(line);
      }
      const device = element("div", "device", "");
      device.append(
        element("div", "", `${t("bench.device.gpu")}: ${result.device.gpu}`),
        element(
          "div",
          "",
          `${t("bench.device.screen")}: ${result.device.screen}, ${t("bench.device.buffer")} ${result.buffer}, x${result.device.devicePixelRatio}`,
        ),
        element("div", "", `${t("bench.device.browser")}: ${result.device.userAgent}`),
      );
      panel.append(device);

      const copy = element("button", "", t("bench.copy")) as HTMLButtonElement;
      copy.id = "bench-copy";
      copy.addEventListener("click", () => {
        navigator.clipboard.writeText(benchReportText(result, i18n)).then(
          () => (copy.textContent = t("bench.copied")),
          () => (copy.textContent = t("bench.copy_failed")),
        );
      });
      panel.append(copy, element("div", "note", t("bench.note")));
      panel.hidden = false;
    },
  };
}
