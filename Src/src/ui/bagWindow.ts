import { isQuickSlotItem, type ItemId, ITEMS } from "../data/items";
import type { I18n } from "../locales/i18n";
import { type BagView, keyLabel, moveGridSelection, sameBag } from "./hudState";
import { createIcon, setIcon } from "./icons";
import { KEY_MARK, setKeyText } from "./keyCap";
import type { Ui, UiWindow } from "./uiRoot";

/**
 * The bag window (UI design 7): the one place where what is in the bag is seen. Tab opens
 * and closes it, the game runs on beside it, and it follows the bag as the bag changes. It
 * stands top right, so the character and what is coming at them stay in sight, and a
 * container's panel can stand open next to it.
 * It changes nothing itself: using, throwing out and putting on a quick slot are asked for
 * through `onUse`, `onDiscard` and `onAssign`.
 */

const TOGGLE_KEY = "Tab";
const DISCARD_KEY = "KeyX";
/**
 * Not E, though that is the key for using things elsewhere: with the bag open E still has to
 * search the container the player stands at and pick up what lies on the ground.
 */
const USE_KEYS: readonly string[] = ["Enter", "NumpadEnter"];
/** The keys of the quick slots, in the order of the slots. */
const QUICK_KEYS: readonly string[] = ["Digit1", "Digit2", "Digit3", "Digit4"];
/** Slots in a row. */
export const BAG_COLUMNS = 4;

const ARROWS: Readonly<Record<string, "left" | "right" | "up" | "down">> = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down",
};
/** Among the windows at the side the bag stands on the right, after a container's panel. */
const SIDE_ORDER = 1;

const css = `
#bag-window { min-width: 24em; }
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
/* Top left, where the quick slots on the HUD have their key: under the name it would be read as part of it. */
#bag-window .bag-slot-quick { position: absolute; left: 0.3em; top: 0.25em; font-size: 0.7em; }
#bag-window .bag-slot-quick:empty { display: none; }
#bag-window .bag-detail { min-height: 4.9em; }
#bag-window .bag-name { font-weight: 700; display: flex; justify-content: space-between; gap: 1em; }
#bag-window .bag-quick { font-weight: 400; opacity: 0.85; }
#bag-window .bag-note { color: #ffb45e; }
#bag-window .bag-hint { margin-top: 0.6em; text-align: right; }
#bag-window .bag-description { opacity: 0.85; }
#bag-window .bag-actions { display: flex; justify-content: flex-end; gap: 0.5em; margin-top: 0.6em; }
#bag-window .bag-actions .ui-button { width: auto; margin: 0; white-space: pre; }
`;

export interface BagWindowOptions {
  /** Whether the window may be opened now (in play, the character standing). */
  canOpen(): boolean;
  /**
   * Whether a list stands beside the bag (a container's panel) that the up and down keys go
   * through. Then left and right walk through all the bag's slots, one after the other.
   */
  listBeside(): boolean;
  /** Asks for one thing to be thrown out of a slot. */
  onDiscard(slot: number): void;
  /** Asks for one of an item to be used. */
  onUse(item: ItemId): void;
  /** Asks for what a quick slot's number does with an item chosen: on, off, or swapped (gameplay/quickSlots.ts). */
  onAssign(quickSlot: number, item: ItemId): void;
}

/** What the window shows besides the bag itself. */
export interface BagExtras {
  /** What is on each quick slot. */
  quick: ReadonlyArray<ItemId | null>;
  /** The items in the bag that using would do something right now. */
  usable: readonly ItemId[];
}

export interface BagWindow {
  readonly isOpen: boolean;
  /** Closes the window if it is open. */
  close(): void;
  /** Shows the bag as it now is. Call every step; nothing is redrawn unless something changed. */
  update(bag: BagView, extras: BagExtras): void;
}

export function createBagWindow(ui: Ui, i18n: I18n, options: BagWindowOptions): BagWindow {
  const style = document.createElement("style");
  style.textContent = css;
  document.head.append(style);

  let bag: BagView = { slots: [], used: 0, size: 0, full: false, total: 0 };
  let extras: BagExtras = { quick: [], usable: [] };
  let selected = 0;
  /** A message about the last key pressed; it goes when another slot is chosen. */
  let notice: "" | "bag.quick_only" = "";
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
    const nameText = make("span");
    const quickText = make("span", "bag-quick");
    name.append(nameText, quickText);
    const note = make("div", "bag-note");
    const detail = make("div", "bag-detail");
    detail.append(name, description, note);
    const hint = make("div", "bag-hint ui-small");
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
    const canUse = (item: ItemId | undefined): item is ItemId => item !== undefined && extras.usable.includes(item);
    const use = (): void => {
      const item = bag.slots[selected]?.item;
      if (canUse(item)) {
        options.onUse(item);
      }
    };
    /** A quick slot's number pressed: the chosen item goes on that slot, or comes off it. */
    const assign = (quickSlot: number): void => {
      const item = bag.slots[selected]?.item;
      if (!item) {
        return;
      }
      if (isQuickSlotItem(item)) {
        options.onAssign(quickSlot, item);
      } else {
        notice = "bag.quick_only";
        render();
      }
    };
    const choose = (index: number): void => {
      if (index !== selected) {
        notice = "";
      }
      selected = index;
      render();
    };
    const useButton = button("bag-use", use);
    const discardButton = button("bag-discard", discard);
    const closeButton = button("bag-close", () => open?.window.close());
    const actions = make("div", "bag-actions");
    actions.append(useButton, discardButton, closeButton);
    content.append(count, grid, detail, actions, hint);

    const slots: Array<{ node: HTMLElement; icon: HTMLElement; name: HTMLElement; count: HTMLElement; quick: HTMLElement }> = [];
    const render = (): void => {
      // The bag says how many slots there are.
      while (slots.length < bag.slots.length) {
        const index = slots.length;
        const node = make("div", "bag-slot");
        const icon = createIcon("bag");
        const slotName = make("span", "bag-slot-name");
        const slotCount = make("span", "bag-slot-count");
        const slotQuick = make("span", "bag-slot-quick ui-key");
        node.append(icon, slotName, slotCount, slotQuick);
        node.addEventListener("click", () => choose(index));
        grid.append(node);
        slots.push({ node, icon, name: slotName, count: slotCount, quick: slotQuick });
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
        // The number of the quick slot the item is on, if it is on one.
        const quickSlot = content ? extras.quick.indexOf(content.item) : -1;
        slot.quick.textContent = quickSlot >= 0 ? keyLabel(QUICK_KEYS[quickSlot] ?? "") : "";
      });
      count.textContent = i18n.t("bag.count", { used: bag.used, size: bag.size });
      count.classList.toggle("full", bag.full);
      const chosen = bag.slots[selected];
      const chosenQuick = chosen ? extras.quick.indexOf(chosen.item) : -1;
      quickText.textContent = chosenQuick >= 0 ? i18n.t("bag.quick_slot", { slot: keyLabel(QUICK_KEYS[chosenQuick] ?? "") }) : "";
      if (chosen) {
        nameText.textContent = i18n.t(ITEMS[chosen.item].nameKey);
        description.textContent = i18n.t(ITEMS[chosen.item].descriptionKey);
      } else {
        nameText.textContent = bag.used === 0 ? i18n.t("bag.empty") : i18n.t("bag.empty_slot");
        description.textContent = "";
      }
      // Why the chosen thing cannot be used, unless a key press has just said something else.
      let reason: "" | "bag.not_needed" | "bag.material_hint" = "";
      if (chosen && !canUse(chosen.item)) {
        reason = isQuickSlotItem(chosen.item) ? "bag.not_needed" : "bag.material_hint";
      }
      const said = notice || reason;
      note.textContent = said ? i18n.t(said) : "";
      note.dataset.note = said;
      useButton.disabled = !canUse(chosen?.item);
      setKeyText(useButton, i18n.t("bag.use", { key: KEY_MARK }), i18n.t("key.enter"));
      hint.textContent = i18n.t("bag.assign_hint", { first: keyLabel(QUICK_KEYS[0] ?? ""), last: keyLabel(QUICK_KEYS[QUICK_KEYS.length - 1] ?? "") });
      discardButton.disabled = !chosen;
      setKeyText(discardButton, i18n.t("bag.discard", { key: KEY_MARK }), keyLabel(DISCARD_KEY));
      setKeyText(closeButton, i18n.t("bag.close", { key: KEY_MARK }), keyLabel(TOGGLE_KEY));
    };

    const window = ui.openWindow({
      id: "bag",
      title: i18n.t("bag.title"),
      content,
      placement: "side",
      order: SIDE_ORDER,
      buttons: [],
      onKey: (event) => {
        const direction = ARROWS[event.code];
        if (direction) {
          // Beside a list the slots are one long row: left and right reach every one of them.
          choose(
            options.listBeside()
              ? moveGridSelection(selected, bag.slots.length, bag.slots.length, direction)
              : moveGridSelection(selected, bag.slots.length, BAG_COLUMNS, direction),
          );
          return true;
        }
        if (USE_KEYS.includes(event.code)) {
          // One press, one thing, as with discarding.
          if (!event.repeat) {
            use();
          }
          return true;
        }
        const quickSlot = QUICK_KEYS.indexOf(event.code);
        if (quickSlot >= 0) {
          // With the window open the numbers put things on quick slots; they use nothing.
          if (!event.repeat) {
            assign(quickSlot);
          }
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
        return false;
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
    // A window in the middle of the screen has the keys; a container's panel at the side does not mind.
    if (!event.repeat && !open && ui.centreWindowId === null && options.canOpen()) {
      selected = 0;
      notice = "";
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
    update(next, nextExtras): void {
      const changed = !sameBag(bag, next) || extras.quick.join() !== nextExtras.quick.join() || extras.usable.join() !== nextExtras.usable.join();
      bag = next;
      extras = { quick: [...nextExtras.quick], usable: [...nextExtras.usable] };
      if (changed) {
        open?.render();
      }
    },
  };
}
