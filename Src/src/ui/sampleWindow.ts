import type { I18n } from "../locales/i18n";
import type { Ui, UiWindow } from "./uiRoot";

const TOGGLE_KEY = "F4";

/**
 * Development-only window for looking at the shared UI pieces: a panel, a bar and buttons
 * that work with mouse and keyboard. F4 opens and closes it.
 */
export function installSampleWindow(ui: Ui, i18n: I18n): void {
  const { t } = i18n;
  let sample: UiWindow | undefined;

  const open = (): void => {
    let presses = 0;
    sample = ui.openWindow({
      id: "sample",
      title: t("ui.sample.title"),
      text: t("ui.sample.text"),
      bars: [{ label: t("ui.sample.bar"), value: "60%", fraction: 0.6 }],
      buttons: [
        {
          label: t("ui.sample.count", { count: presses }),
          onActivate: () => {
            presses += 1;
            const button = ui.root.querySelector<HTMLButtonElement>('[data-window="sample"] .ui-button');
            if (button) {
              button.textContent = t("ui.sample.count", { count: presses });
            }
          },
        },
        { label: t("ui.sample.nothing"), onActivate: () => {} },
        { label: t("ui.close"), onActivate: () => sample?.close() },
      ],
      onClose: () => {
        sample = undefined;
      },
    });
  };

  window.addEventListener("keydown", (event) => {
    if (event.code !== TOGGLE_KEY || event.repeat) {
      return;
    }
    event.preventDefault();
    if (sample) {
      sample.close();
    } else {
      open();
    }
  });
}
