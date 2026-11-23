import type { PlaySummary } from "../gameplay/summary";
import type { I18n } from "../locales/i18n";
import type { Ui, UiWindow } from "./uiRoot";

/**
 * The end screen (UI design 12): the door is repaired, which is as far as the prototype
 * goes. It says so, sums the game up, asks for feedback and lets the player play on.
 */

const css = `
#end-summary { display: grid; grid-template-columns: 1fr auto; gap: 0.3em 2em; margin: 0.6em 0 1em; }
#end-summary .end-value { font-weight: 700; text-align: right; }
#end-note { opacity: 0.75; margin: 0.8em 0 0; }
`;

export interface EndScreenOptions {
  /** Where to leave feedback. Without it the button is left out (the address is decided when the prototype is put online). */
  feedbackUrl?: string;
}

export interface EndScreen {
  readonly isOpen: boolean;
  /** Shows the screen. `onKeepPlaying` is called once when the player goes on: with the button or with Escape. */
  show(summary: PlaySummary, onKeepPlaying: () => void): void;
  /** Takes the screen away without calling anything. */
  clear(): void;
}

export function createEndScreen(ui: Ui, i18n: I18n, options: EndScreenOptions = {}): EndScreen {
  const style = document.createElement("style");
  style.textContent = css;
  document.head.append(style);

  let open: { window: UiWindow; settle(): boolean } | undefined;

  return {
    get isOpen(): boolean {
      return open !== undefined;
    },
    show(summary, onKeepPlaying): void {
      const content = document.createElement("div");
      const table = document.createElement("div");
      table.id = "end-summary";
      const row = (id: string, name: string, value: string): void => {
        const label = document.createElement("span");
        label.textContent = name;
        const figure = document.createElement("span");
        figure.className = "end-value";
        figure.id = id;
        figure.textContent = value;
        table.append(label, figure);
      };
      row("end-time", i18n.t("end.time"), i18n.t("end.time_value", { minutes: summary.minutes, seconds: summary.seconds }));
      row("end-days", i18n.t("end.days"), String(summary.days));
      row("end-deaths", i18n.t("end.deaths"), String(summary.deaths));
      const note = document.createElement("p");
      note.id = "end-note";
      note.textContent = i18n.t("end.note");
      content.append(table, note);

      let settled = false;
      const settle = (): boolean => {
        const first = !settled;
        settled = true;
        return first;
      };
      const keepPlaying = (): void => {
        if (settle()) {
          open = undefined;
          shown.close();
          onKeepPlaying();
        }
      };
      const { feedbackUrl } = options;
      const shown = ui.openWindow({
        id: "end",
        title: i18n.t("end.title"),
        text: i18n.t("end.text"),
        content,
        buttons: [
          // Feedback first: of the two it is the one that should catch the eye. It does not close the screen.
          ...(feedbackUrl ? [{ label: i18n.t("end.feedback"), onActivate: () => void window.open(feedbackUrl, "_blank", "noopener") }] : []),
          { label: i18n.t("end.keep_playing"), onActivate: keepPlaying },
        ],
        onClose: keepPlaying,
      });
      open = { window: shown, settle };
    },
    clear(): void {
      if (open) {
        open.settle();
        open.window.close();
        open = undefined;
      }
    },
  };
}
