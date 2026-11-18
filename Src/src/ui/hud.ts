import { type ClockTime, displayTime } from "../gameplay/clock";
import type { I18n } from "../locales/i18n";
import type { Ui } from "./uiRoot";

/**
 * What is on screen during play (UI design 5). So far the day and time, top right, with a
 * word under it from dusk on (colour alone is not to be relied on: UI design 1, rule 4), the
 * "sheltered" sign, bottom right, and health, bottom left; the storm warning and the rest
 * join as the systems behind them are built.
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
#hud-health {
  position: absolute; left: 1.25em; bottom: 1em; width: 14em; margin: 0;
  text-shadow: 0 0.05em 0.25em rgba(0, 0, 0, 0.75);
}
#hud-health .ui-bar-label { font-weight: 700; opacity: 1; }
#hud-health .ui-bar-track { height: 0.7em; background: rgba(20, 19, 16, 0.6); border: 0.06em solid rgba(232, 220, 192, 0.5); }
#hud-health .ui-bar-fill { background: #c9584a; }
#hud-shelter {
  position: absolute; right: 1.25em; bottom: 1em; padding: 0.35em 0.9em;
  font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
  color: #e8dcc0; background: rgba(20, 19, 16, 0.55);
  border: 0.1em solid rgba(232, 220, 192, 0.7); border-radius: 0.25em;
  transition: background 0.4s, color 0.4s, border-color 0.4s;
}
#hud-shelter[hidden] { display: none; }
/* In a storm being sheltered is what matters most on screen. */
#hud-shelter.storm { color: #1b1a17; background: #d9c79a; border-color: #d9c79a; }
`;

export interface Hud {
  /** Shows the HUD (during play) or hides it (title, measurements). */
  setVisible(visible: boolean): void;
  /** Call every frame; the text is rewritten only when it changes. */
  update(time: ClockTime): void;
  /** Sets the health bar. */
  setHealth(current: number, max: number): void;
  /** Shows the "sheltered" sign while the player is in a shelter zone, marked out during a storm. */
  setShelter(sheltered: boolean, storm: boolean): void;
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
  const shelter = document.createElement("div");
  shelter.id = "hud-shelter";
  shelter.hidden = true;
  // The shared bar (label and value over a track), filled in as health changes.
  const health = document.createElement("div");
  health.id = "hud-health";
  health.className = "ui-bar";
  const healthLabel = document.createElement("div");
  healthLabel.className = "ui-bar-label";
  const healthName = document.createElement("span");
  const healthValue = document.createElement("span");
  healthValue.id = "hud-health-value";
  healthLabel.append(healthName, healthValue);
  const healthTrack = document.createElement("div");
  healthTrack.className = "ui-bar-track";
  const healthFill = document.createElement("div");
  healthFill.className = "ui-bar-fill";
  healthTrack.append(healthFill);
  health.append(healthLabel, healthTrack);
  root.append(clock, health, shelter);
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
  const renderShelter = (): void => {
    shelter.textContent = i18n.t("hud.sheltered");
    healthName.textContent = i18n.t("hud.health");
  };
  renderShelter();
  i18n.onChange(render);
  i18n.onChange(renderShelter);

  return {
    setVisible(visible): void {
      root.hidden = !visible;
    },
    update(next): void {
      latest = next;
      render();
    },
    setHealth(current, max): void {
      // Rounded up, so the number reads 0 only when there is none left.
      const text = String(Math.ceil(current));
      if (text !== healthValue.textContent) {
        healthValue.textContent = text;
      }
      const width = `${(Math.min(Math.max(current / max, 0), 1) * 100).toFixed(1)}%`;
      if (width !== healthFill.style.width) {
        healthFill.style.width = width;
      }
    },
    setShelter(sheltered, storm): void {
      if (shelter.hidden === sheltered) {
        shelter.hidden = !sheltered;
      }
      shelter.classList.toggle("storm", storm);
    },
  };
}
