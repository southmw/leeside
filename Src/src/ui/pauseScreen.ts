import { CONTROLS } from "../app/pause";
import type { I18n, MessageKey } from "../locales/i18n";
import type { Ui, UiWindow } from "./uiRoot";

/**
 * The pause screen (UI design 10): the picture dims and a menu offers to go on, to change
 * the settings, to look up the controls, or to start over. The game itself stands still for
 * as long as any of these windows is up; this file only shows them.
 */

const css = `
#pause-veil { position: fixed; inset: 0; pointer-events: none; opacity: 0; background: rgba(13, 12, 10, 0.6); transition: opacity 0.2s; }
#pause-veil.shown { opacity: 1; }
#controls-list { display: grid; grid-template-columns: auto 1fr; gap: 0.45em 1.2em; align-items: center; margin: 0.2em 0 0.8em; }
#controls-list .controls-keys { display: flex; gap: 0.25em; justify-content: flex-end; white-space: nowrap; }
`;

export interface PauseScreenOptions {
  /** Called once when the player goes back to the game: with the button or with Escape. */
  onResume(): void;
  /** Called when the player has confirmed starting over. The screen is gone by then. */
  onRestart(): void;
  /** Opens the settings; `onBack` is to be called when they are closed. Without it there is no Settings button. */
  openSettings?(onBack: () => void): void;
  /** Where to leave feedback. Without it there is no such button. */
  feedbackUrl?: string;
}

export interface PauseScreen {
  /** Whether the pause screen, or one of the windows reached from it, is up. */
  readonly isOpen: boolean;
  /** Dims the picture and shows the menu. */
  open(): void;
  /** Takes everything away without calling anything. */
  clear(): void;
}

export function createPauseScreen(ui: Ui, i18n: I18n, options: PauseScreenOptions): PauseScreen {
  const style = document.createElement("style");
  style.textContent = css;
  document.head.append(style);

  const veil = document.createElement("div");
  veil.id = "pause-veil";
  ui.root.append(veil);

  let open = false;
  let current: UiWindow | undefined;
  /** Set while one window makes way for another, so that its closing is not taken for the player leaving. */
  let changing = false;

  /** Shows a window in place of whichever is up. `onLeave` is what closing it by itself (Escape) means. */
  const show = (window: Parameters<Ui["openWindow"]>[0], onLeave: () => void): void => {
    changing = true;
    current = ui.openWindow({
      ...window,
      onClose: () => {
        if (!changing && open) {
          onLeave();
        }
      },
    });
    changing = false;
  };
  const end = (): void => {
    open = false;
    veil.classList.remove("shown");
    changing = true;
    current?.close();
    changing = false;
    current = undefined;
  };
  const resume = (): void => {
    if (open) {
      end();
      options.onResume();
    }
  };

  const showControls = (): void => {
    const list = document.createElement("div");
    list.id = "controls-list";
    for (const { action, keys } of CONTROLS) {
      const what = document.createElement("span");
      what.textContent = i18n.t(action);
      const how = document.createElement("span");
      how.className = "controls-keys";
      for (const key of keys) {
        const box = document.createElement("span");
        box.className = "ui-key";
        // Keys that have no letter of their own are named in words.
        box.textContent = key.startsWith("controls.") ? i18n.t(key as MessageKey) : key;
        how.append(box);
      }
      list.append(what, how);
    }
    show({ id: "controls", title: i18n.t("controls.title"), content: list, buttons: [{ label: i18n.t("pause.back"), onActivate: showMenu }] }, showMenu);
  };
  const confirmRestart = (): void => {
    show(
      {
        id: "restart",
        title: i18n.t("pause.restart.title"),
        text: i18n.t("pause.restart.text"),
        // Going back is the first button, so that a hasty Enter loses nothing.
        buttons: [
          { label: i18n.t("pause.back"), onActivate: showMenu },
          {
            label: i18n.t("pause.restart.confirm"),
            onActivate: () => {
              end();
              options.onRestart();
            },
          },
        ],
      },
      showMenu,
    );
  };
  function showMenu(): void {
    const { openSettings, feedbackUrl } = options;
    show(
      {
        id: "pause",
        title: i18n.t("pause.title"),
        buttons: [
          { label: i18n.t("pause.resume"), onActivate: resume },
          ...(openSettings
            ? [
                {
                  label: i18n.t("pause.settings"),
                  onActivate: () => {
                    // The settings are a window of their own making: this one makes way for it.
                    changing = true;
                    current?.close();
                    changing = false;
                    current = undefined;
                    openSettings(() => {
                      if (open) {
                        showMenu();
                      }
                    });
                  },
                },
              ]
            : []),
          { label: i18n.t("pause.controls"), onActivate: showControls },
          { label: i18n.t("pause.restart"), onActivate: confirmRestart },
          ...(feedbackUrl ? [{ label: i18n.t("pause.feedback"), onActivate: () => void window.open(feedbackUrl, "_blank", "noopener") }] : []),
        ],
      },
      resume,
    );
  }

  return {
    get isOpen(): boolean {
      return open;
    },
    open(): void {
      if (open) {
        return;
      }
      open = true;
      veil.classList.add("shown");
      showMenu();
    },
    clear(): void {
      if (open) {
        end();
      }
    },
  };
}
