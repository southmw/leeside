import { type ClockTime, displayTime } from "../gameplay/clock";
import type { TemperatureStage } from "../gameplay/temperature";
import type { I18n } from "../locales/i18n";
import type { Ui } from "./uiRoot";

/**
 * What is on screen during play (UI design 5). So far the day and time, top right, with a
 * word under it from dusk on (colour alone is not to be relied on: UI design 1, rule 4), the
 * "sheltered" sign, bottom right, and health, body temperature and thirst, bottom left; the storm
 * warning and the rest
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
#hud-vitals {
  position: absolute; left: 1.25em; bottom: 1em; width: 14em;
  text-shadow: 0 0.05em 0.25em rgba(0, 0, 0, 0.75);
}
#hud-vitals .ui-bar { margin: 0.45em 0 0; }
#hud-vitals .ui-bar-label { font-weight: 700; opacity: 1; }
#hud-vitals .ui-bar-track { position: relative; height: 0.7em; background: rgba(20, 19, 16, 0.6); border: 0.06em solid rgba(232, 220, 192, 0.5); }
#hud-health .ui-bar-fill { background: #c9584a; }
#hud-thirst .ui-bar-fill { background: #4fb3d9; }
/* Body temperature is comfortable in the middle; the colder, the further the bar grows to the left. */
#hud-temperature .ui-bar-fill { position: absolute; right: 50%; top: 0; background: #6fa0ff; }
#hud-temperature .ui-bar-track::after {
  content: ""; position: absolute; left: 50%; top: 0; bottom: 0; width: 0.12em; margin-left: -0.06em; background: #e8dcc0;
}
#hud-temperature.cold .hud-stage, #hud-temperature.hypothermia .hud-stage { color: #6fa0ff; }
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
  /** Sets the thirst bar. */
  setThirst(value: number, max: number): void;
  /** Sets the body temperature bar: `value` from -100 (coldest) to 0 (comfortable), and the stage it makes. */
  setTemperature(value: number, stage: TemperatureStage): void;
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
  // The shared bar (label and value over a track), filled in as the figure changes.
  const amountBar = (id: string): { bar: HTMLElement; name: HTMLElement; set(current: number, max: number): void } => {
    const bar = document.createElement("div");
    bar.id = id;
    bar.className = "ui-bar";
    const label = document.createElement("div");
    label.className = "ui-bar-label";
    const name = document.createElement("span");
    const value = document.createElement("span");
    value.id = `${id}-value`;
    label.append(name, value);
    const track = document.createElement("div");
    track.className = "ui-bar-track";
    const fill = document.createElement("div");
    fill.className = "ui-bar-fill";
    track.append(fill);
    bar.append(label, track);
    return {
      bar,
      name,
      set(current, max): void {
        // Rounded up, so the number reads 0 only when there is none left.
        const text = String(Math.ceil(current));
        if (text !== value.textContent) {
          value.textContent = text;
        }
        const width = `${(Math.min(Math.max(current / max, 0), 1) * 100).toFixed(1)}%`;
        if (width !== fill.style.width) {
          fill.style.width = width;
        }
      },
    };
  };
  const healthBar = amountBar("hud-health");
  const thirstBar = amountBar("hud-thirst");
  // The same again for body temperature, with the stage in words where health has its number.
  const temperature = document.createElement("div");
  temperature.id = "hud-temperature";
  temperature.className = "ui-bar";
  const temperatureLabel = document.createElement("div");
  temperatureLabel.className = "ui-bar-label";
  const temperatureName = document.createElement("span");
  const temperatureStageText = document.createElement("span");
  temperatureStageText.id = "hud-temperature-stage";
  temperatureStageText.className = "hud-stage";
  temperatureLabel.append(temperatureName, temperatureStageText);
  const temperatureTrack = document.createElement("div");
  temperatureTrack.className = "ui-bar-track";
  const temperatureFill = document.createElement("div");
  temperatureFill.className = "ui-bar-fill";
  temperatureTrack.append(temperatureFill);
  temperature.append(temperatureLabel, temperatureTrack);
  const vitals = document.createElement("div");
  vitals.id = "hud-vitals";
  vitals.append(healthBar.bar, temperature, thirstBar.bar);
  root.append(clock, vitals, shelter);
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
  let stage: TemperatureStage = "comfortable";
  const renderShelter = (): void => {
    shelter.textContent = i18n.t("hud.sheltered");
    healthBar.name.textContent = i18n.t("hud.health");
    thirstBar.name.textContent = i18n.t("hud.thirst");
    temperatureName.textContent = i18n.t("hud.temperature");
    temperatureStageText.textContent = i18n.t(`hud.temperature.${stage}`);
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
      healthBar.set(current, max);
    },
    setThirst(value, max): void {
      thirstBar.set(value, max);
    },
    setTemperature(value, next): void {
      if (next !== stage) {
        stage = next;
        temperatureStageText.textContent = i18n.t(`hud.temperature.${stage}`);
        temperature.classList.toggle("cold", stage === "cold");
        temperature.classList.toggle("hypothermia", stage === "hypothermia");
      }
      // Half the track is the cold side: full at -100.
      const width = `${(Math.min(Math.max(-value / 100, 0), 1) * 50).toFixed(1)}%`;
      if (width !== temperatureFill.style.width) {
        temperatureFill.style.width = width;
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
