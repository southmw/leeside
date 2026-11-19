import type { I18n } from "../locales/i18n";
import { createProgressRing } from "./progressRing";
import type { Ui, UiWindow } from "./uiRoot";

const TOGGLE_KEY = "F4";
/** The sample ring fills in the time a search takes, rests full for a moment, then starts again. Seconds. */
const RING_FILL_SECONDS = 1.5;
const RING_REST_SECONDS = 0.5;

/**
 * Development-only window for looking at the shared UI pieces: a panel, a bar, the progress
 * ring and buttons that work with mouse and keyboard. F4 opens and closes it.
 */
export function installSampleWindow(ui: Ui, i18n: I18n): void {
  const { t } = i18n;
  let sample: UiWindow | undefined;

  const open = (): void => {
    let presses = 0;
    // The ring as the HUD draws it round the dot, filling over and over.
    const ringRow = document.createElement("div");
    ringRow.style.cssText = "display: flex; align-items: center; gap: 0.75em; margin: 0.75em 0;";
    const ring = createProgressRing();
    ring.element.id = "sample-ring";
    ring.element.style.cssText = "display: inline-block; width: 2.2em; height: 2.2em; color: #f0c060;";
    const ringLabel = document.createElement("span");
    ringLabel.className = "ui-small";
    ringLabel.textContent = t("ui.sample.ring");
    ringRow.append(ring.element, ringLabel);
    const openedAt = performance.now();
    let ringFrame = 0;
    const turnRing = (now: number): void => {
      const seconds = ((now - openedAt) / 1000) % (RING_FILL_SECONDS + RING_REST_SECONDS);
      // Never quite empty, so the ring stays in sight between rounds.
      ring.set(Math.max(Math.min(seconds / RING_FILL_SECONDS, 1), 0.01));
      ringFrame = requestAnimationFrame(turnRing);
    };
    ringFrame = requestAnimationFrame(turnRing);
    sample = ui.openWindow({
      id: "sample",
      title: t("ui.sample.title"),
      text: t("ui.sample.text"),
      bars: [{ label: t("ui.sample.bar"), value: "60%", fraction: 0.6 }],
      content: ringRow,
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
        cancelAnimationFrame(ringFrame);
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
