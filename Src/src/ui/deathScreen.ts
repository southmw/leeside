import type { DamageCause } from "../core/ecs";
import type { I18n } from "../locales/i18n";
import type { Ui, UiWindow } from "./uiRoot";

/**
 * What the player sees on dying (UI design 9): the picture darkens while the character
 * falls, then a window says what happened and asks whether to go on or to stop. The world
 * behind it keeps running.
 */

const css = `
#death-veil {
  position: fixed; inset: 0; pointer-events: none; opacity: 0;
  background: radial-gradient(rgba(20, 19, 16, 0.2), rgba(20, 19, 16, 0.7));
  transition: opacity 0.4s;
}
#death-veil.shown { opacity: 1; transition: opacity var(--death-fade, 1.5s); }
`;

export interface DeathChoices {
  /** Start again the next morning. Also what closing the window with Escape means. */
  onContinue(): void;
  /** Leave for the title screen. */
  onQuit(): void;
}

export interface DeathScreen {
  /** Starts darkening the picture, over `seconds`. */
  darken(seconds: number): void;
  /** Opens the window; `cause` is what took the last of the player's health. Exactly one of the choices is called, once. */
  ask(cause: DamageCause, choices: DeathChoices): void;
  /** Takes everything away again, without calling a choice. */
  clear(): void;
}

export function createDeathScreen(ui: Ui, i18n: I18n): DeathScreen {
  const style = document.createElement("style");
  style.textContent = css;
  document.head.append(style);

  const veil = document.createElement("div");
  veil.id = "death-veil";
  // Above the HUD (the first child) and under any window, which is added after it.
  ui.root.append(veil);

  let open: { window: UiWindow; settle(): boolean } | undefined;

  return {
    darken(seconds): void {
      veil.style.setProperty("--death-fade", `${seconds}s`);
      veil.classList.add("shown");
    },
    ask(cause, choices): void {
      let settled = false;
      // True the first time only: a click and a key press must not both count.
      const settle = (): boolean => {
        const first = !settled;
        settled = true;
        return first;
      };
      const choose = (action: () => void) => (): void => {
        if (settle()) {
          asked.close();
          action();
        }
      };
      const asked = ui.openWindow({
        id: "death",
        title: i18n.t("death.title"),
        text: i18n.t(`death.text.${cause}`),
        buttons: [
          { label: i18n.t("death.continue"), onActivate: choose(choices.onContinue) },
          { label: i18n.t("death.quit"), onActivate: choose(choices.onQuit) },
        ],
        // Closed some other way (Escape, another window opening): the game must not be left
        // waiting on a window that is gone.
        onClose: () => {
          if (settle()) {
            choices.onContinue();
          }
        },
      });
      open = { window: asked, settle };
    },
    clear(): void {
      veil.classList.remove("shown");
      if (open) {
        open.settle();
        open.window.close();
        open = undefined;
      }
    },
  };
}
