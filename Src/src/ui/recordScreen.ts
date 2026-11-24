import type { PlayRecord } from "../app/playRecord";
import { playSummary } from "../gameplay/summary";
import type { I18n, MessageKey } from "../locales/i18n";
import type { Ui, UiWindow } from "./uiRoot";

/**
 * The play record on screen (prototype design 2.6): this game so far in lines that can be
 * read, and a button that copies everything kept on the machine, for handing over with
 * feedback. Reached from the pause screen.
 */

const css = `
#record { min-width: 28em; }
#record-rows { display: grid; grid-template-columns: auto 1fr; gap: 0.25em 1.5em; margin: 0.2em 0 0.8em; }
#record-rows .record-value { font-weight: 700; text-align: right; overflow-wrap: anywhere; }
#record-note { opacity: 0.75; margin: 0 0 0.6em; }
`;

export interface RecordScreenOptions {
  /** The record of the game being played, as it now stands. */
  current(): PlayRecord;
  /** Everything kept on the machine as text, for copying. */
  exportText(): string;
}

export interface RecordScreen {
  /** Shows the record. `onBack` is called once when the player leaves it. */
  open(onBack: () => void): void;
}

export function createRecordScreen(ui: Ui, i18n: I18n, options: RecordScreenOptions): RecordScreen {
  const style = document.createElement("style");
  style.textContent = css;
  document.head.append(style);

  return {
    open(onBack): void {
      const record = options.current();
      const time = playSummary(record.playSeconds, record.day, record.deaths.length);
      const { t } = i18n;
      const yesNo = (value: boolean): string => t(value ? "common.yes" : "common.no");
      // The causes of death in a word each, in the order they happened.
      const causes = record.deaths.map((death) => t(`hud.damage.${death.cause}` as MessageKey)).join(", ");
      const rows: Array<[MessageKey, string]> = [
        ["record.time", t("end.time_value", { minutes: time.minutes, seconds: time.seconds })],
        ["record.days", String(record.day)],
        ["record.tutorial", yesNo(record.tutorialDone)],
        ["record.returns", String(record.returns)],
        ["record.deaths", causes ? t("record.deaths_value", { count: record.deaths.length, causes }) : "0"],
        ["record.repair", t("record.repair_value", { ...record.repair, done: yesNo(record.repairDone) })],
        ["record.avg_fps", String(record.performance.avgFps)],
        ["record.low1_fps", String(record.performance.low1Fps)],
        ["record.long_frames", t("record.long_frames_value", { long: record.performance.longFrames, veryLong: record.performance.veryLongFrames })],
        ["record.quality", record.performance.quality === "low" || record.performance.quality === "high" ? t(`quality.${record.performance.quality}`) : "-"],
        ["record.gpu", record.performance.gpu || "-"],
      ];
      const content = document.createElement("div");
      content.id = "record";
      const table = document.createElement("div");
      table.id = "record-rows";
      for (const [key, value] of rows) {
        const name = document.createElement("span");
        name.textContent = t(key);
        const figure = document.createElement("span");
        figure.className = "record-value";
        figure.dataset.row = key;
        figure.textContent = value;
        table.append(name, figure);
      }
      const note = document.createElement("p");
      note.id = "record-note";
      note.className = "ui-small";
      note.textContent = t("record.note");
      const copied = document.createElement("p");
      copied.id = "record-copied";
      copied.className = "ui-small";
      content.append(table, note, copied);

      let left = false;
      const leave = (): void => {
        if (!left) {
          left = true;
          shown.close();
          onBack();
        }
      };
      const shown: UiWindow = ui.openWindow({
        id: "record",
        title: t("record.title"),
        content,
        buttons: [
          { label: t("pause.back"), onActivate: leave },
          {
            label: t("record.copy"),
            onActivate: () => {
              // The browser may refuse (no permission, no secure page): the player is told either way.
              const done = (key: MessageKey) => (): void => {
                copied.textContent = t(key);
                copied.dataset.result = key;
              };
              try {
                navigator.clipboard.writeText(options.exportText()).then(done("record.copied"), done("record.copy_failed"));
              } catch {
                done("record.copy_failed")();
              }
            },
          },
        ],
        onClose: leave,
      });
    },
  };
}
