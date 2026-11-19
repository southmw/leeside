import { ITEMS } from "../data/items";
import type { I18n } from "../locales/i18n";
import { type BagView, keyLabel, moveGridSelection, sameBag } from "./hudState";
import { createIcon, setIcon } from "./icons";
import { KEY_MARK, setKeyText } from "./keyCap";
import type { Ui, UiWindow } from "./uiRoot";

/**
 * The bag window (UI design 7): the one place where what is in the bag is seen. Tab opens
 * and closes it, the game runs on beside it, and it follows the bag as the bag changes. It
 * stands top right, so the character and what is coming at them stay in sight.
 * It changes nothing itself: throwing something out is asked for through `onDiscard`.
 */

const TOGGLE_KEY = "Tab";
const DISCARD_KEY = "KeyX";
/** Slots in a row. */
export const BAG_COLUMNS = 4;

const ARROWS: Readonly<Record<string, "left" | "right" | "up" | "down">> = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down",
};
/** Keys that would press a window's selected button. This window has none to press that way. */
const UNUSED_KEYS = ["Enter", "NumpadEnter"];
/** Jumping goes on with the bag open, like walking: the storm does not wait for the bag to be shut. */
const JUMP_KEY = "Space";

const css = `
#bag-window { min-width: 21em; }
#bag-window .bag-count { float: right; margin-top: -2.6em; font-weight: 700; }
#bag-window .bag-count.full { color: #ffb45e; }
#bag-window .bag-grid { display: grid; grid-template-columns: repeat(${BAG_COLUMNS}, 1fr); gap: 0.35em; margin: 0.4em 0 0.8em; clear: both; }
#bag-window .bag-slot {
  position: relative; height: 4.3em; box-sizing: border-box; cursor: pointer;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  background: rgba(232, 220, 192, 0.06); border: 0.1em solid rgba(232, 220, 192, 0.3); border-radius: 0.25em;
}
#bag-window .bag-slot.empty > * { display: none; }
#bag-window .bag-slot.selected { border-color: #d9c79a; background: rgba(217, 199, 154, 0.22); }
#bag-window .bag-slot .ui-icon { width: 1.9em; height: 1.9em; }
#bag-window .bag-slot-name { font-size: 0.75em; white-space: nowrap; }
#bag-window .bag-slot-count { position: absolute; top: 0.05em; right: 0.4em; font-weight: 700; }
#bag-window .bag-detail { min-height: 3.4em; }
#bag-window .bag-name { font-weight: 700; }
#bag-window .bag-description { opacity: 0.85; }
#bag-window .bag-actions { display: flex; justify-content: flex-end; gap: 0.5em; margin-top: 0.6em; }
#bag-window .bag-actions .ui-button { width: auto; margin: 0; white-space: pre; }
`;

export interface BagWindowOptions {
  /** Whether the window may be opened now (in play, the character standing). */
  canOpen(): boolean;
  /** Asks for one thing to be thrown out of a slot. */
  onDiscard(slot: number): void;
}

export interface BagWindow {
  readonly isOpen: boolean;
  /** Closes the window if it is open. */
  close(): void;
  /** Shows the bag as it now is. Call every step; nothing is redrawn unless something changed. */
  update(bag: BagView): void;
}

export function createBagWindow(ui: Ui, i18n: I18n, options: BagWindowOptions): BagWindow {
  const style = document.createElement("style");
  style.textContent = css;
  document.head.append(style);

  let bag: BagView = { slots: [], used: 0, size: 0, full: false, total: 0 };
  let selected = 0;
  let open: { window: UiWindow; render(): void } | undefined;

  const make = (tag: string, className = ""): HTMLElement => {
    const node = document.createElement(tag);
    node.className = className;
    return node;
  };

  const show = (): void => {
    const content = make("div");
    content.id = "bag-window";
    const count = make("div", "bag-count");
    const grid = make("div", "bag-grid");
    const name = make("div", "bag-name");
    const description = make("div", "bag-description");
    const detail = make("div", "bag-detail");
    detail.append(name, description);
    const button = (id: string, onClick: () => void): HTMLButtonElement => {
      const node = make("button", "ui-button") as HTMLButtonElement;
      node.type = "button";
      node.id = id;
      // The keyboard stays with the game and this window's own keys.
      node.tabIndex = -1;
      node.addEventListener("click", () => {
        node.blur();
        onClick();
      });
      return node;
    };
    const discard = (): void => {
      if (bag.slots[selected]) {
        options.onDiscard(selected);
      }
    };
    const discardButton = button("bag-discard", discard);
    const closeButton = button("bag-close", () => open?.window.close());
    const actions = make("div", "bag-actions");
    actions.append(discardButton, closeButton);
    content.append(count, grid, detail, actions);

    const slots: Array<{ node: HTMLElement; icon: HTMLElement; name: HTMLElement; count: HTMLElement }> = [];
    const render = (): void => {
      // The bag says how many slots there are.
      while (slots.length < bag.slots.length) {
        const index = slots.length;
        const node = make("div", "bag-slot");
        const icon = createIcon("bag");
        const slotName = make("span", "bag-slot-name");
        const slotCount = make("span", "bag-slot-count");
        node.append(icon, slotName, slotCount);
        node.addEventListener("click", () => {
          selected = index;
          render();
        });
        grid.append(node);
        slots.push({ node, icon, name: slotName, count: slotCount });
      }
      selected = Math.min(Math.max(selected, 0), Math.max(bag.slots.length - 1, 0));
      bag.slots.forEach((content, index) => {
        const slot = slots[index];
        if (!slot) {
          return;
        }
        slot.node.classList.toggle("empty", content === null);
        slot.node.classList.toggle("selected", index === selected);
        slot.node.dataset.item = content?.item ?? "";
        if (content) {
          const item = ITEMS[content.item];
          setIcon(slot.icon, item.icon);
          slot.name.textContent = i18n.t(item.shortNameKey);
          slot.count.textContent = String(content.count);
        }
      });
      count.textContent = i18n.t("bag.count", { used: bag.used, size: bag.size });
      count.classList.toggle("full", bag.full);
      const chosen = bag.slots[selected];
      if (chosen) {
        name.textContent = i18n.t(ITEMS[chosen.item].nameKey);
        description.textContent = i18n.t(ITEMS[chosen.item].descriptionKey);
      } else {
        name.textContent = bag.used === 0 ? i18n.t("bag.empty") : i18n.t("bag.empty_slot");
        description.textContent = "";
      }
      discardButton.disabled = !chosen;
      setKeyText(discardButton, i18n.t("bag.discard", { key: KEY_MARK }), keyLabel(DISCARD_KEY));
      setKeyText(closeButton, i18n.t("bag.close", { key: KEY_MARK }), keyLabel(TOGGLE_KEY));
    };

    const window = ui.openWindow({
      id: "bag",
      title: i18n.t("bag.title"),
      content,
      placement: "side",
      buttons: [],
      onKey: (event) => {
        const direction = ARROWS[event.code];
        if (direction) {
          selected = moveGridSelection(selected, bag.slots.length, BAG_COLUMNS, direction);
          render();
          return true;
        }
        if (event.code === TOGGLE_KEY) {
          if (!event.repeat) {
            window.close();
          }
          return true;
        }
        if (event.code === DISCARD_KEY) {
          // One press, one thing: holding the key does not empty the slot.
          if (!event.repeat) {
            discard();
          }
          return true;
        }
        if (event.code === JUMP_KEY) {
          return "pass";
        }
        return UNUSED_KEYS.includes(event.code);
      },
      onClose: () => {
        open = undefined;
      },
    });
    open = { window, render };
    render();
  };

  // Tab opens the window. While it is open the window itself takes the key, and closes.
  window.addEventListener("keydown", (event) => {
    if (event.code !== TOGGLE_KEY) {
      return;
    }
    // Tab must not walk the browser's focus through the page, in or out of play.
    event.preventDefault();
    if (!event.repeat && !open && ui.openWindowId === null && options.canOpen()) {
      selected = 0;
      show();
    }
  });
  i18n.onChange(() => open?.render());

  return {
    get isOpen(): boolean {
      return open !== undefined;
    },
    close(): void {
      open?.window.close();
    },
    update(next): void {
      const changed = !sameBag(bag, next);
      bag = next;
      if (changed) {
        open?.render();
      }
    },
  };
}
