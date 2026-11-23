import { ITEMS } from "../data/items";
import type { ReturnTally } from "../gameplay/expedition";
import type { I18n } from "../locales/i18n";
import { createIcon, setIcon } from "./icons";
import type { Ui, UiWindow } from "./uiRoot";

/**
 * The tally of a return to the shelter (UI design 8): what the outing brought in, the rest
 * and what of it went into the door's repair, the rest it earns, how many days the player
 * has lasted, and one button, for the next day. This is the prototype's reward: the bars of
 * the repair fill up before the player's eyes.
 */

const css = `
#tally { min-width: 40em; }
#tally .tally-columns { display: grid; grid-template-columns: 1fr 1.5fr; gap: 2em; }
#tally .tally-repair-row { display: flex; align-items: center; gap: 0.5em; padding: 0.2em 0; }
#tally .tally-repair-row .ui-icon { width: 1.5em; height: 1.5em; }
#tally .tally-repair-name { width: 4.2em; white-space: nowrap; }
#tally .tally-bar { flex: 1; display: flex; height: 0.8em; border-radius: 0.2em; overflow: hidden; background: rgba(232, 220, 192, 0.15); }
#tally .tally-bar-had { background: #d9c79a; }
/* What went in just now: another colour, growing from nothing. */
#tally .tally-bar-added { background: #f0c060; width: 0; transition: width 0.9s ease-out 0.3s; }
#tally .tally-repair-count { width: 4em; text-align: right; font-weight: 700; white-space: nowrap; }
#tally .tally-repair-added { width: 2.8em; color: #f0c060; font-weight: 700; white-space: nowrap; }
#tally .tally-repair-row.full .tally-bar-had, #tally .tally-repair-row.full .tally-bar-added { background: #9fd08a; }
#tally .tally-done { margin-top: 0.4em; font-weight: 700; color: #9fd08a; }
#tally .tally-heading { font-size: 0.875em; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.75; margin: 0.4em 0 0.3em; }
#tally .tally-row { display: flex; align-items: center; gap: 0.55em; padding: 0.15em 0; }
#tally .tally-row .ui-icon { width: 1.5em; height: 1.5em; }
#tally .tally-row-name { flex: 1; }
#tally .tally-row-count { font-weight: 700; }
#tally .tally-nothing { opacity: 0.75; }
#tally .tally-facts { display: flex; justify-content: space-between; gap: 1.5em; margin: 0.9em 0 0.5em; padding-top: 0.7em; border-top: 1px solid rgba(232, 220, 192, 0.25); font-weight: 700; }
#tally .tally-health { display: flex; align-items: center; gap: 0.35em; }
#tally .tally-health .ui-icon { color: #e2695a; }
`;

export interface TallyScreen {
  readonly isOpen: boolean;
  /**
   * Shows a return. `onNextDay` is called once, when the player moves on: with the button,
   * with Enter, or by closing the window.
   */
  show(tally: ReturnTally, onNextDay: () => void): void;
  /** Takes the window away without moving on. */
  clear(): void;
}

export function createTallyScreen(ui: Ui, i18n: I18n): TallyScreen {
  const style = document.createElement("style");
  style.textContent = css;
  document.head.append(style);

  let open: { window: UiWindow; settle(): boolean } | undefined;

  const make = (tag: string, className = "", text = ""): HTMLElement => {
    const node = document.createElement(tag);
    node.className = className;
    node.textContent = text;
    return node;
  };

  return {
    get isOpen(): boolean {
      return open !== undefined;
    },
    show(tally, onNextDay): void {
      const content = make("div");
      content.id = "tally";
      // The first time, a line says what the door's repair is about.
      if (tally.firstReturn) {
        const goal = make("p", "ui-text tally-goal", i18n.t("tally.first_return"));
        goal.id = "tally-goal";
        content.append(goal);
      }
      const columns = make("div", "tally-columns");
      const left = make("div");
      const right = make("div");
      columns.append(left, right);
      left.append(make("div", "tally-heading", i18n.t("tally.brought")));
      if (tally.brought.length === 0) {
        left.append(make("div", "tally-nothing", i18n.t("tally.nothing")));
      }
      for (const stack of tally.brought) {
        const row = make("div", "tally-row");
        row.dataset.item = stack.item;
        const icon = createIcon("bag");
        setIcon(icon, ITEMS[stack.item].icon);
        row.append(icon, make("span", "tally-row-name", i18n.t(ITEMS[stack.item].nameKey)), make("span", "tally-row-count", i18n.t("container.count", { count: stack.count })));
        left.append(row);
      }
      // The door's repair: a bar for each material, with what has just gone in marked out.
      right.append(make("div", "tally-heading", i18n.t("tally.repair")));
      const growing: Array<{ bar: HTMLElement; width: string }> = [];
      for (const material of tally.repair) {
        const row = make("div", `tally-repair-row${material.have >= material.need ? " full" : ""}`);
        row.dataset.item = material.item;
        const icon = createIcon("bag");
        setIcon(icon, ITEMS[material.item].icon);
        const bar = make("div", "tally-bar");
        const had = make("div", "tally-bar-had");
        had.style.width = `${(((material.have - material.added) / material.need) * 100).toFixed(1)}%`;
        const added = make("div", "tally-bar-added");
        growing.push({ bar: added, width: `${((material.added / material.need) * 100).toFixed(1)}%` });
        bar.append(had, added);
        row.append(
          icon,
          make("span", "tally-repair-name", i18n.t(ITEMS[material.item].shortNameKey)),
          bar,
          make("span", "tally-repair-count", i18n.t("tally.repair_count", { have: material.have, need: material.need })),
          make("span", "tally-repair-added", material.added > 0 ? i18n.t("tally.repair_added", { added: material.added }) : ""),
        );
        right.append(row);
      }
      if (tally.repairDone) {
        right.append(make("div", "tally-done", i18n.t("tally.repair_done")));
      }
      content.append(columns);
      // Once the window is drawn the new part of each bar grows to its length.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          for (const { bar, width } of growing) {
            bar.style.width = width;
          }
        }),
      );
      const facts = make("div", "tally-facts");
      const health = make("span", "tally-health");
      health.append(createIcon("health"), make("span", "", i18n.t("tally.health", { amount: tally.healthRestored })));
      facts.append(health, make("span", "tally-days", i18n.t("tally.days", { days: tally.day })));
      content.append(facts);

      let settled = false;
      // True the first time only: a click and a key press must not both count.
      const settle = (): boolean => {
        const first = !settled;
        settled = true;
        return first;
      };
      const moveOn = (): void => {
        if (settle()) {
          open = undefined;
          shown.close();
          onNextDay();
        }
      };
      const shown = ui.openWindow({
        id: "tally",
        title: i18n.t("tally.title", { day: tally.day }),
        content,
        buttons: [{ label: i18n.t("tally.next_day"), onActivate: moveOn }],
        // Closed some other way (Escape): there is nothing to do here but to move on.
        onClose: moveOn,
      });
      open = { window: shown, settle };
    },
    clear(): void {
      if (open) {
        open.settle();
        open.window.close();
        open = undefined;
      }
    },
  };
}
