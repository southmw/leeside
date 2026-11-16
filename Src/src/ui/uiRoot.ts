import type { I18n } from "../locales/i18n";
import { menuAction, moveSelection } from "./menuKeys";
import { hudBounds, isWindowTooSmall, MIN_HEIGHT, MIN_WIDTH, uiScale } from "./uiScale";

/**
 * The frame every screen of the game is built in (UI design 3): one root element whose
 * size follows the window, shared looks for panels, buttons and bars, and windows that
 * can be used with the mouse or the keyboard.
 *
 * Sizes inside the root are in `em`, and the root's font size is the design size (16 px)
 * times the scale, so everything grows and shrinks together.
 */

const css = `
#ui {
  position: fixed; top: 0; bottom: 0; z-index: 30; pointer-events: none;
  font-size: calc(16px * var(--ui-scale, 1)); line-height: 1.45; color: #e8dcc0;
  font-variant-numeric: tabular-nums;
}
#ui > * { pointer-events: auto; }
.ui-panel {
  background: rgba(20, 19, 16, 0.88); border: 1px solid rgba(232, 220, 192, 0.28);
  border-radius: 0.4em; padding: 1.25em 1.5em;
}
.ui-title { font-size: 1.75em; font-weight: 700; margin: 0 0 0.4em; }
.ui-text { margin: 0 0 1em; opacity: 0.85; }
.ui-small { font-size: 0.875em; opacity: 0.7; }
.ui-button {
  display: block; width: 100%; margin: 0.4em 0 0; padding: 0.55em 1em; cursor: pointer;
  font: inherit; color: inherit; text-align: center;
  background: rgba(232, 220, 192, 0.08); border: 1px solid rgba(232, 220, 192, 0.3); border-radius: 0.3em;
  transition: background 0.1s, color 0.1s, border-color 0.1s;
}
.ui-button.selected { background: #d9c79a; border-color: #d9c79a; color: #1b1a17; font-weight: 700; }
.ui-bar { margin: 0.5em 0; }
.ui-bar .ui-bar-label { display: flex; justify-content: space-between; font-size: 0.875em; opacity: 0.85; }
.ui-bar .ui-bar-track { height: 0.6em; margin-top: 0.2em; border-radius: 0.3em; background: rgba(232, 220, 192, 0.15); overflow: hidden; }
.ui-bar .ui-bar-fill { height: 100%; background: #d9c79a; }
.ui-window {
  position: absolute; left: 50%; top: 50%; min-width: 22em; max-width: 34em;
  transform: translate(-50%, -50%); opacity: 1;
  transition: opacity 0.15s, transform 0.15s;
}
.ui-window.entering, .ui-window.leaving { opacity: 0; transform: translate(-50%, -46%); }
#ui-too-small {
  position: fixed; inset: 0; z-index: 100; display: flex; align-items: center; justify-content: center;
  padding: 24px; text-align: center; background: #1b1a17; color: #e8dcc0; font-size: 18px;
}
#ui-too-small[hidden] { display: none; }
`;

/** Matches the CSS transition of windows, in milliseconds. */
const WINDOW_TRANSITION_MS = 150;

export interface UiButton {
  label: string;
  /** Called when the button is clicked or chosen with the keyboard. */
  onActivate(): void;
}

export interface UiBar {
  label: string;
  /** Text shown opposite the label, such as "42%". */
  value: string;
  /** How full the bar is, from 0 to 1. */
  fraction: number;
}

export interface UiWindowOptions {
  /** Identifies the window, for `Ui.openWindowId` and for tests. */
  id: string;
  title: string;
  text?: string;
  bars?: readonly UiBar[];
  buttons: readonly UiButton[];
  /** Called once when the window closes, however that happens. */
  onClose?(): void;
}

export interface UiWindow {
  close(): void;
}

export interface Ui {
  /** The root element: anything added to it scales with the window. */
  readonly root: HTMLElement;
  /** Current size factor (1 at a window height of 1080 px). */
  readonly scale: number;
  /** True while the window is below the smallest supported size and the notice is shown. */
  readonly tooSmall: boolean;
  /** Id of the window that is open, or null. */
  readonly openWindowId: string | null;
  /** Index of the selected button in the open window, or -1. */
  readonly selectedButton: number;
  /** Opens a window. Only one is open at a time: opening another closes the current one. */
  openWindow(options: UiWindowOptions): UiWindow;
}

export function createUi(i18n: I18n): Ui {
  const style = document.createElement("style");
  style.textContent = css;
  document.head.append(style);

  const root = document.createElement("div");
  root.id = "ui";
  const tooSmallNotice = document.createElement("div");
  tooSmallNotice.id = "ui-too-small";
  document.body.append(root, tooSmallNotice);

  let scale = 1;
  let tooSmall = false;
  const layout = (): void => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    scale = uiScale(height);
    tooSmall = isWindowTooSmall(width, height);
    const bounds = hudBounds(width, height);
    root.style.setProperty("--ui-scale", String(scale));
    root.style.left = `${bounds.left}px`;
    root.style.width = `${bounds.width}px`;
    tooSmallNotice.hidden = !tooSmall;
    tooSmallNotice.textContent = i18n.t("ui.window_too_small", { width: MIN_WIDTH, height: MIN_HEIGHT });
  };
  window.addEventListener("resize", layout);
  i18n.onChange(layout);
  layout();

  let current: { id: string; close(): void; selected(): number } | undefined;

  const openWindow = (options: UiWindowOptions): UiWindow => {
    current?.close();

    const panel = document.createElement("div");
    panel.className = "ui-panel ui-window entering";
    panel.dataset.window = options.id;
    panel.setAttribute("role", "dialog");

    const title = document.createElement("h2");
    title.className = "ui-title";
    title.textContent = options.title;
    panel.append(title);
    if (options.text) {
      const text = document.createElement("p");
      text.className = "ui-text";
      text.textContent = options.text;
      panel.append(text);
    }
    for (const bar of options.bars ?? []) {
      panel.append(createBar(bar));
    }

    let selected = 0;
    const buttons = options.buttons.map((button, index) => {
      const element = document.createElement("button");
      element.type = "button";
      element.className = "ui-button";
      element.textContent = button.label;
      // The game handles the keyboard itself; keeping browser focus off the buttons stops
      // Space or Enter from also "clicking" whichever one was clicked last.
      element.tabIndex = -1;
      element.addEventListener("mouseenter", () => select(index));
      element.addEventListener("click", () => button.onActivate());
      panel.append(element);
      return element;
    });
    const select = (index: number): void => {
      selected = index;
      buttons.forEach((element, buttonIndex) => element.classList.toggle("selected", buttonIndex === selected));
    };
    select(0);

    // Capture phase, and stopped there: keys the window uses must not also reach the game
    // (Space would jump, Escape would open the pause screen).
    const onKeyDown = (event: KeyboardEvent): void => {
      const action = menuAction(event.code, event.shiftKey);
      if (!action) {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.repeat && (action === "activate" || action === "close")) {
        return;
      }
      if (action === "close") {
        close();
      } else if (action === "activate") {
        options.buttons[selected]?.onActivate();
      } else {
        select(moveSelection(selected, buttons.length, action));
      }
    };
    window.addEventListener("keydown", onKeyDown, true);

    let closed = false;
    const close = (): void => {
      if (closed) {
        return;
      }
      closed = true;
      window.removeEventListener("keydown", onKeyDown, true);
      if (current?.id === options.id && current.close === close) {
        current = undefined;
      }
      panel.classList.add("leaving");
      window.setTimeout(() => panel.remove(), WINDOW_TRANSITION_MS);
      options.onClose?.();
    };

    root.append(panel);
    // Let the browser draw the starting state once, then remove it so the transition plays.
    requestAnimationFrame(() => panel.classList.remove("entering"));
    current = { id: options.id, close, selected: () => selected };
    return { close };
  };

  return {
    root,
    get scale(): number {
      return scale;
    },
    get tooSmall(): boolean {
      return tooSmall;
    },
    get openWindowId(): string | null {
      return current?.id ?? null;
    },
    get selectedButton(): number {
      return current?.selected() ?? -1;
    },
    openWindow,
  };
}

/** A labelled bar in the shared look, for progress and for amounts. */
export function createBar(bar: UiBar): HTMLElement {
  const element = document.createElement("div");
  element.className = "ui-bar";
  const label = document.createElement("div");
  label.className = "ui-bar-label";
  const name = document.createElement("span");
  name.textContent = bar.label;
  const value = document.createElement("span");
  value.textContent = bar.value;
  label.append(name, value);
  const track = document.createElement("div");
  track.className = "ui-bar-track";
  const fill = document.createElement("div");
  fill.className = "ui-bar-fill";
  fill.style.width = `${Math.min(Math.max(bar.fraction, 0), 1) * 100}%`;
  track.append(fill);
  element.append(label, track);
  return element;
}
