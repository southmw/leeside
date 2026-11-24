import { describeError, formatErrorReport, isIgnorableError, type ErrorDetails } from "../app/errorReport";
import type { I18n, MessageKey } from "../locales/i18n";
import { menuAction, moveSelection } from "./menuKeys";
import type { Ui } from "./uiRoot";

/**
 * The screen for an error nothing handled (UI design 13). It covers everything, says the game
 * cannot go on, and offers to reload the page or to copy what happened, so that whoever was
 * playing can hand it over.
 *
 * It is drawn on its own and not as one of the shared windows: another window opening must
 * not close it, and it has to come up even when the code for windows is what broke. It cannot
 * be closed, because the game behind it may have stopped or be in a state nothing expects.
 */

const css = `
#error-screen {
  position: fixed; inset: 0; z-index: 90; display: flex; align-items: center; justify-content: center;
  background: rgba(12, 11, 9, 0.82);
}
#error-screen .ui-panel { width: 30em; max-width: 90%; }
#error-message {
  margin: 0 0 1em; padding: 0.6em 0.8em; max-height: 7.5em; overflow: auto;
  font-family: ui-monospace, Consolas, monospace; font-size: 0.8em; white-space: pre-wrap; word-break: break-word;
  background: rgba(0, 0, 0, 0.35); border-radius: 0.3em;
}
#error-copied { min-height: 1.45em; margin: 0.6em 0 0; text-align: center; }
`;

export interface ErrorScreenOptions {
  /** The game's version, for the copied text. */
  version: string;
  /** Opens the page again. */
  reload(): void;
}

export interface ErrorScreen {
  /** Shows the screen for whatever was thrown. Only the first error is shown: it is the cause. */
  show(reason: unknown): void;
  readonly shown: boolean;
}

export function createErrorScreen(ui: Ui, i18n: I18n, options: ErrorScreenOptions): ErrorScreen {
  let shown = false;

  const build = (details: ErrorDetails): void => {
    const { t } = i18n;
    const style = document.createElement("style");
    style.textContent = css;
    document.head.append(style);

    const screen = document.createElement("div");
    screen.id = "error-screen";
    const panel = document.createElement("div");
    panel.className = "ui-panel";
    const title = document.createElement("h2");
    title.className = "ui-title";
    title.textContent = t("error.title");
    const text = document.createElement("p");
    text.className = "ui-text";
    text.textContent = t("error.text");
    const message = document.createElement("pre");
    message.id = "error-message";
    message.textContent = details.message;
    const copied = document.createElement("p");
    copied.id = "error-copied";
    copied.className = "ui-small";

    const report = formatErrorReport(details, {
      version: options.version,
      address: `${window.location.pathname}${window.location.search}`,
      userAgent: navigator.userAgent,
      language: i18n.language,
      when: new Date().toISOString(),
    });
    const copy = (): void => {
      // The browser may refuse (no permission, no secure page): the player is told either way.
      const done = (key: MessageKey) => (): void => {
        copied.textContent = t(key);
        copied.dataset.result = key;
      };
      try {
        navigator.clipboard.writeText(report).then(done("error.copied"), done("error.copy_failed"));
      } catch {
        done("error.copy_failed")();
      }
    };

    const actions: { id: string; label: string; run(): void }[] = [
      { id: "error-reload", label: t("error.reload"), run: options.reload },
      { id: "error-copy", label: t("error.copy"), run: copy },
    ];
    let selected = 0;
    const buttons = actions.map((action, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.id = action.id;
      button.className = "ui-button";
      button.textContent = action.label;
      // As in the shared windows: the keys are handled here, not by the browser's focus.
      button.tabIndex = -1;
      button.addEventListener("mouseenter", () => select(index));
      button.addEventListener("click", () => action.run());
      return button;
    });
    const select = (index: number): void => {
      selected = index;
      buttons.forEach((button, buttonIndex) => button.classList.toggle("selected", buttonIndex === selected));
    };
    select(0);

    panel.append(title, text, message, ...buttons, copied);
    screen.append(panel);
    ui.root.append(screen);

    // Capture phase, and stopped there: no key reaches the game or a window behind the screen.
    // Keys held with Ctrl or Alt are the browser's own (reload, the developer tools) and are let through.
    const swallow = (event: KeyboardEvent): void => {
      if (event.ctrlKey || event.metaKey || event.altKey || /^F\d+$/.test(event.code)) {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.type !== "keydown") {
        return;
      }
      const action = menuAction(event.code, event.shiftKey);
      if (action === "activate") {
        if (!event.repeat) {
          actions[selected]?.run();
        }
      } else if (action === "next" || action === "previous") {
        select(moveSelection(selected, buttons.length, action));
      }
    };
    window.addEventListener("keydown", swallow, true);
    window.addEventListener("keyup", swallow, true);
  };

  return {
    show(reason: unknown): void {
      const details = describeError(reason);
      if (shown || isIgnorableError(details.message)) {
        return;
      }
      shown = true;
      try {
        build(details);
      } catch (error) {
        // Nothing more can be done from here; the console at least keeps both.
        console.error("The error screen could not be shown.", error);
      }
    },
    get shown(): boolean {
      return shown;
    },
  };
}
