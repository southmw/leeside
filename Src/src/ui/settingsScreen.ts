import { QUALITIES, SENSITIVITY_MAX, SENSITIVITY_MIN, type Settings, type SettingsStore } from "../app/settings";
import { type I18n, LANGUAGES } from "../locales/i18n";
import type { Ui, UiWindow } from "./uiRoot";

/**
 * The settings screen (UI design 11): everything on one page, each change applied at once
 * and kept by the browser. It is reached from the title and from the pause screen and goes
 * back to wherever it was opened from. This file only shows the settings and asks the store
 * to change them; applying them is the business of whoever listens to the store.
 */

const css = `
#settings { min-width: 30em; }
#settings .settings-heading { font-size: 0.8em; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.7; margin: 0.9em 0 0.3em; }
#settings .settings-heading:first-child { margin-top: 0; }
#settings .settings-row { display: flex; align-items: center; gap: 0.8em; padding: 0.2em 0 0.2em 0.8em; }
#settings .settings-name { flex: 1; }
#settings .settings-value { width: 3.2em; text-align: right; font-weight: 700; }
#settings input[type="range"] { width: 12em; accent-color: #d9c79a; }
#settings .settings-choice { display: flex; gap: 0.3em; }
#settings .settings-choice .ui-button { width: auto; margin: 0; padding: 0.25em 0.9em; }
`;

/** How far one notch of the sliders goes. */
const SENSITIVITY_STEP = 0.05;
const VOLUME_STEP = 0.05;

export interface SettingsScreenOptions {
  /** Whether the page fills the screen, and making it do so or not. */
  fullscreen: { isOn(): boolean; set(on: boolean): void };
}

export interface SettingsScreen {
  readonly isOpen: boolean;
  /** Shows the settings. `onBack` is called once when the player leaves them. */
  open(onBack: () => void): void;
}

export function createSettingsScreen(ui: Ui, i18n: I18n, store: SettingsStore, options: SettingsScreenOptions): SettingsScreen {
  const style = document.createElement("style");
  style.textContent = css;
  document.head.append(style);

  let shown: { window: UiWindow; content: HTMLElement; language: string; onBack(): void } | undefined;
  /** Set while the window is replaced by itself (another language), so that this is not taken for leaving. */
  let redrawing = false;

  const make = (tag: string, className = "", text = ""): HTMLElement => {
    const node = document.createElement(tag);
    node.className = className;
    node.textContent = text;
    return node;
  };

  const build = (settings: Settings): HTMLElement => {
    const content = make("div");
    content.id = "settings";
    const row = (id: string, name: string, ...controls: HTMLElement[]): HTMLElement => {
      const node = make("div", "settings-row");
      node.id = id;
      node.append(make("span", "settings-name", name), ...controls);
      return node;
    };
    const slider = (id: string, min: number, max: number, step: number, value: number, onInput: (value: number) => void): HTMLInputElement => {
      const input = document.createElement("input");
      input.type = "range";
      input.id = id;
      input.min = String(min);
      input.max = String(max);
      input.step = String(step);
      input.value = String(value);
      // The keyboard stays with the window: the slider is for the mouse.
      input.tabIndex = -1;
      input.addEventListener("input", () => onInput(Number(input.value)));
      input.addEventListener("change", () => input.blur());
      return input;
    };
    /** A row of buttons of which one is marked: the choice now. */
    const choice = <T>(id: string, values: readonly T[], current: T, label: (value: T) => string, onPick: (value: T) => void): HTMLElement => {
      const node = make("div", "settings-choice");
      values.forEach((value, index) => {
        const button = make("button", `ui-button${value === current ? " selected" : ""}`, label(value)) as HTMLButtonElement;
        button.type = "button";
        button.id = `${id}-${index}`;
        button.tabIndex = -1;
        button.addEventListener("click", () => {
          button.blur();
          onPick(value);
        });
        node.append(button);
      });
      return node;
    };
    const onOff = (id: string, on: boolean, onPick: (on: boolean) => void): HTMLElement =>
      choice(id, [false, true], on, (value) => i18n.t(value ? "settings.on" : "settings.off"), onPick);

    const sensitivityValue = make("span", "settings-value", settings.mouseSensitivity.toFixed(2));
    const volumeValue = make("span", "settings-value", i18n.t("settings.percent", { value: Math.round(settings.volume * 100) }));
    content.append(
      make("div", "settings-heading", i18n.t("settings.section.controls")),
      row(
        "settings-row-sensitivity",
        i18n.t("settings.sensitivity"),
        // While the slider is dragged only its number is redrawn: redrawing the page would take the slider out of the hand.
        slider("settings-sensitivity", SENSITIVITY_MIN, SENSITIVITY_MAX, SENSITIVITY_STEP, settings.mouseSensitivity, (value) => {
          sensitivityValue.textContent = value.toFixed(2);
          quiet(() => store.set({ mouseSensitivity: value }));
        }),
        sensitivityValue,
      ),
      row("settings-row-invert", i18n.t("settings.invert_y"), onOff("settings-invert", settings.invertY, (invertY) => store.set({ invertY }))),
      make("div", "settings-heading", i18n.t("settings.section.sound")),
      row(
        "settings-row-volume",
        i18n.t("settings.volume"),
        slider("settings-volume", 0, 1, VOLUME_STEP, settings.volume, (value) => {
          volumeValue.textContent = i18n.t("settings.percent", { value: Math.round(value * 100) });
          quiet(() => store.set({ volume: value }));
        }),
        volumeValue,
      ),
      make("div", "settings-heading", i18n.t("settings.section.display")),
      row("settings-row-quality", i18n.t("settings.quality"), choice("settings-quality", QUALITIES, settings.quality, (quality) => i18n.t(`quality.${quality}`), (quality) => store.set({ quality }))),
      row(
        "settings-row-fullscreen",
        i18n.t("settings.fullscreen"),
        onOff("settings-fullscreen", options.fullscreen.isOn(), (on) => {
          options.fullscreen.set(on);
          // The browser switches a moment later; the page is drawn again when it has (see below).
        }),
      ),
      row("settings-row-fps", i18n.t("settings.show_fps"), onOff("settings-fps", settings.showFps, (showFps) => store.set({ showFps }))),
      make("div", "settings-heading", i18n.t("settings.section.other")),
      row(
        "settings-row-language",
        i18n.t("settings.language"),
        choice("settings-language", LANGUAGES, i18n.language, (language) => i18n.t(`language.${language}`), (language) => store.set({ language })),
      ),
      row("settings-row-records", i18n.t("settings.send_records"), onOff("settings-records", settings.sendRecords, (sendRecords) => store.set({ sendRecords }))),
    );
    return content;
  };

  /** Runs a change without redrawing the page for it. */
  let quietly = false;
  function quiet(change: () => void): void {
    quietly = true;
    change();
    quietly = false;
  }

  const draw = (onBack: () => void): void => {
    redrawing = true;
    const leave = (): void => {
      if (shown) {
        const { window } = shown;
        shown = undefined;
        window.close();
        onBack();
      }
    };
    const content = build(store.get());
    const window = ui.openWindow({
      id: "settings",
      title: i18n.t("settings.title"),
      content,
      buttons: [
        { label: i18n.t("settings.back"), onActivate: leave },
        { label: i18n.t("settings.reset"), onActivate: () => store.reset() },
      ],
      onClose: () => {
        // Escape: the same as Back.
        if (!redrawing && shown) {
          shown = undefined;
          onBack();
        }
      },
    });
    shown = { window, content, language: i18n.language, onBack };
    redrawing = false;
  };
  const redraw = (): void => {
    if (!shown || quietly) {
      return;
    }
    if (shown.language !== i18n.language) {
      // The window's own title and buttons are in the old language: it is put up afresh.
      draw(shown.onBack);
    } else {
      // The window stays where it is and only what is in it is drawn again: no flicker.
      shown.content.replaceChildren(...build(store.get()).childNodes);
    }
  };
  store.onChange(redraw);
  // The language may change after the store's listeners have run; the page follows it too.
  i18n.onChange(redraw);
  document.addEventListener("fullscreenchange", redraw);

  return {
    get isOpen(): boolean {
      return shown !== undefined;
    },
    open(onBack): void {
      draw(onBack);
    },
  };
}
