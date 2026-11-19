import type { ContainerKind } from "../core/ecs";
import { type ItemId, ITEMS } from "../data/items";
import type { I18n } from "../locales/i18n";
import { type BagView, keyLabel } from "./hudState";
import { createIcon, setIcon } from "./icons";
import { KEY_MARK, setKeyText } from "./keyCap";
import type { Ui, UiWindow } from "./uiRoot";

/**
 * The container panel (UI design 6): what is in an opened container, and taking it. It
 * stands top right, to the left of the bag window if that is open, and the game runs on. It changes
 * nothing itself: taking is asked for through `onTake` and `onTakeAll`.
 */

const TAKE_KEY = "KeyE";
const TAKE_ALL_KEY = "KeyF";

const css = `
#container-panel { min-width: 19em; }
#container-panel .container-list { margin: 0.2em 0 0.7em; }
#container-panel .container-row {
  display: flex; align-items: center; gap: 0.55em; padding: 0.3em 0.6em; cursor: pointer;
  border: 0.1em solid transparent; border-radius: 0.25em;
}
#container-panel .container-row.selected { border-color: #d9c79a; background: rgba(217, 199, 154, 0.22); }
#container-panel .container-row.unfit { opacity: 0.4; }
#container-panel .container-row .ui-icon { width: 1.5em; height: 1.5em; }
#container-panel .container-row-name { flex: 1; }
#container-panel .container-row-count { font-weight: 700; }
#container-panel .container-actions { display: flex; flex-wrap: wrap; gap: 0.5em; }
#container-panel .container-actions .ui-button { width: auto; margin: 0; white-space: pre; }
#container-panel .container-foot { display: flex; justify-content: space-between; gap: 1em; margin-top: 0.7em; font-weight: 700; }
#container-panel .container-bag.full, #container-panel .container-note { color: #ffb45e; }
`;

/** An opened container as the panel draws it. */
export interface ContainerView {
  id: string;
  kind: ContainerKind;
  /** What is in it, and whether the bag has room for at least one of each. */
  items: Array<{ item: ItemId; count: number; fits: boolean }>;
}

export interface ContainerPanelOptions {
  /** Asks for one entry of the container to be taken. */
  onTake(container: string, index: number): void;
  onTakeAll(container: string): void;
}

export interface ContainerPanel {
  /** Id of the container whose panel is open, or null. */
  readonly openId: string | null;
  /** Opens the panel for a container. It is filled in by the next `update`. */
  open(view: ContainerView, bag: BagView): void;
  close(): void;
  /** Shows the container and the bag as they now are. Call every step while open. */
  update(view: ContainerView, bag: BagView): void;
  /** Moves the selection by wheel notches: positive (rolled back) is down the list. */
  scroll(notches: number): void;
}

/** The entry selected after moving `steps` down a list of `count` entries (up for negative). Stops at the ends. */
export function moveListSelection(index: number, count: number, steps: number): number {
  return count <= 0 ? 0 : Math.min(Math.max(index + Math.trunc(steps), 0), count - 1);
}

export function createContainerPanel(ui: Ui, i18n: I18n, options: ContainerPanelOptions): ContainerPanel {
  const style = document.createElement("style");
  style.textContent = css;
  document.head.append(style);

  let open: { id: string; window: UiWindow; show(view: ContainerView, bag: BagView): void; move(steps: number): void } | undefined;

  const make = (tag: string, className = ""): HTMLElement => {
    const node = document.createElement(tag);
    node.className = className;
    return node;
  };

  const show = (first: ContainerView, firstBag: BagView): void => {
    let view = first;
    let bag = firstBag;
    let selected = 0;
    let drawn = "";

    const content = make("div");
    content.id = "container-panel";
    const list = make("div", "container-list");
    const button = (id: string, onClick: () => void): HTMLButtonElement => {
      const node = make("button", "ui-button") as HTMLButtonElement;
      node.type = "button";
      node.id = id;
      node.tabIndex = -1;
      node.addEventListener("click", () => {
        node.blur();
        onClick();
      });
      return node;
    };
    const take = (): void => {
      if (view.items[selected]) {
        options.onTake(view.id, selected);
      }
    };
    const takeButton = button("container-take", take);
    const takeAllButton = button("container-take-all", () => options.onTakeAll(view.id));
    const closeButton = button("container-close", () => panel.close());
    const actions = make("div", "container-actions");
    actions.append(takeButton, takeAllButton, closeButton);
    const bagLine = make("span", "container-bag");
    const note = make("span", "container-note");
    const foot = make("div", "container-foot");
    foot.append(bagLine, note);
    content.append(list, actions, foot);

    const render = (): void => {
      selected = moveListSelection(selected, view.items.length, 0);
      const key = `${i18n.language}|${selected}|${bag.used}/${bag.size}|${view.items.map((entry) => `${entry.item}:${entry.count}:${entry.fits}`).join()}`;
      if (key === drawn) {
        return;
      }
      drawn = key;
      list.replaceChildren(
        ...view.items.map((entry, index) => {
          const row = make("div", `container-row${index === selected ? " selected" : ""}${entry.fits ? "" : " unfit"}`);
          row.dataset.item = entry.item;
          const icon = createIcon("bag");
          setIcon(icon, ITEMS[entry.item].icon);
          const name = make("span", "container-row-name");
          name.textContent = i18n.t(ITEMS[entry.item].nameKey);
          const count = make("span", "container-row-count");
          count.textContent = i18n.t("container.count", { count: entry.count });
          row.append(icon, name, count);
          row.addEventListener("click", () => {
            selected = index;
            render();
          });
          row.addEventListener("dblclick", () => {
            selected = index;
            take();
          });
          return row;
        }),
      );
      setKeyText(takeButton, i18n.t("container.take", { key: KEY_MARK }), keyLabel(TAKE_KEY));
      setKeyText(takeAllButton, i18n.t("container.take_all", { key: KEY_MARK }), keyLabel(TAKE_ALL_KEY));
      setKeyText(closeButton, i18n.t("container.close", { key: KEY_MARK }), i18n.t("key.escape"));
      bagLine.textContent = i18n.t("container.bag", { used: bag.used, size: bag.size });
      bagLine.classList.toggle("full", bag.full);
      note.textContent = view.items.some((entry) => !entry.fits) ? i18n.t("container.bag_full") : "";
    };
    const move = (steps: number): void => {
      selected = moveListSelection(selected, view.items.length, steps);
      render();
    };
    // Over the panel itself the wheel goes through the list too.
    content.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        move(Math.sign(event.deltaY));
      },
      { passive: false },
    );

    const panel = ui.openWindow({
      id: "container",
      title: i18n.t(`container.${view.kind}`),
      content,
      placement: "side",
      buttons: [],
      onKey: (event) => {
        if (event.code === "ArrowUp" || event.code === "ArrowDown") {
          move(event.code === "ArrowDown" ? 1 : -1);
          return true;
        }
        if (event.code === TAKE_KEY) {
          // Not a held key: the E that searched the container must not also take from it.
          if (!event.repeat) {
            take();
          }
          return true;
        }
        if (event.code === TAKE_ALL_KEY) {
          if (!event.repeat) {
            options.onTakeAll(view.id);
          }
          return true;
        }
        // Escape is left to the window, which closes on it. Everything else is not the
        // panel's: it goes to the bag window, if that is open beside it, or to the game.
        return false;
      },
      onClose: () => {
        open = undefined;
      },
    });
    open = {
      id: view.id,
      window: panel,
      show: (nextView, nextBag) => {
        view = nextView;
        bag = nextBag;
        render();
      },
      move,
    };
    render();
  };

  i18n.onChange(() => open?.move(0));

  return {
    get openId(): string | null {
      return open?.id ?? null;
    },
    open(view, bag): void {
      if (open?.id === view.id) {
        return;
      }
      show(view, bag);
    },
    close(): void {
      open?.window.close();
    },
    update(view, bag): void {
      if (open?.id === view.id) {
        open.show(view, bag);
      }
    },
    scroll(notches): void {
      if (notches !== 0) {
        open?.move(Math.sign(notches));
      }
    },
  };
}
