import { type ClockTime, displayTime } from "../gameplay/clock";
import type { I18n } from "../locales/i18n";
import type { Ui } from "./uiRoot";

/**
 * What is on screen during play (UI design 5). So far only the day and time, top right, with
 * a word under it from dusk on (colour alone is not to be relied on: UI design 1, rule 4);
 * health, the storm warning and the rest join as the systems behind them are built.
 */

const css = `
#hud { position: absolute; inset: 0; pointer-events: none; }
#hud[hidden] { display: none; }
#hud-clock {
  position: absolute; top: 1em; right: 1.25em; text-align: right;
  text-shadow: 0 0.05em 0.25em rgba(0, 0, 0, 0.75);
}
#hud-clock .hud-day { font-size: 0.875em; opacity: 0.85; }
#hud-clock .hud-time { font-size: 1.5em; font-weight: 700; line-height: 1.15; transition: color 0.4s; }
#hud-clock .hud-phase { font-size: 0.875em; font-weight: 700; min-height: 1.45em; transition: color 0.4s; }
/* From dusk on the clock says that the light is going: in colour, and in a word under it. */
#hud-clock.dusk .hud-time, #hud-clock.dusk .hud-phase { color: #ff8a2a; }
#hud-clock.night .hud-time, #hud-clock.night .hud-phase { color: #6fa0ff; }
`;

export interface Hud {
  /** Shows the HUD (during play) or hides it (title, measurements). */
  setVisible(visible: boolean): void;
  /** Call every frame; the text is rewritten only when it changes. */
  update(time: ClockTime): void;
}

export function createHud(ui: Ui, i18n: I18n): Hud {
  const style = document.createElement("style");
  style.textContent = css;
  document.head.append(style);

  const root = document.createElement("div");
  root.id = "hud";
  root.hidden = true;
  const clock = document.createElement("div");
  clock.id = "hud-clock";
  const day = document.createElement("div");
  day.className = "hud-day";
  const time = document.createElement("div");
  time.className = "hud-time";
  const phase = document.createElement("div");
  phase.className = "hud-phase";
  clock.append(day, time, phase);
  root.append(clock);
  // Under the title and windows, which are added to the root later or sit above by their own rules.
  ui.root.prepend(root);

  let shown = "";
  let latest: ClockTime | undefined;
  const render = (): void => {
    if (!latest) {
      return;
    }
    const digits = displayTime(latest.hour);
    const key = `${i18n.language}|${latest.day}|${digits.hours}${digits.minutes}|${latest.phase}`;
    if (key === shown) {
      return;
    }
    shown = key;
    day.textContent = i18n.t("hud.day", { day: latest.day });
    time.textContent = i18n.t("hud.time", digits);
    // Daytime needs no word; the line stays, empty, so nothing below it moves.
    phase.textContent = latest.phase === "day" ? "" : i18n.t(`hud.phase.${latest.phase}`);
    clock.className = latest.phase;
  };
  i18n.onChange(render);

  return {
    setVisible(visible): void {
      root.hidden = !visible;
    },
    update(next): void {
      latest = next;
      render();
    },
  };
}
