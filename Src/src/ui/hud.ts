import { type ClockTime, displayTime } from "../gameplay/clock";
import type { TemperatureStage } from "../gameplay/temperature";
import type { I18n } from "../locales/i18n";
import { ITEMS } from "../data/items";
import { type BagView, type CompassPosition, compassPosition, type HudAlerts, type InteractionCue, type QuickSlotView } from "./hudState";
import { createIcon, type IconName, setIcon } from "./icons";
import { KEY_MARK, setKeyText } from "./keyCap";
import { createProgressRing } from "./progressRing";
import type { Ui } from "./uiRoot";

/**
 * What is on screen during play (UI design 5): the compass and the storm warning at the top,
 * the day and time top right (with a word under it from dusk on: colour alone is not to be
 * relied on, UI design 1, rule 4), health, body temperature and thirst bottom left, and the
 * "sheltered" sign bottom right, how full the bag is above it, the quick slots bottom centre,
 * and in the middle a dot with, under it, what the key E would do here. Colours bleed in from the edges of the screen when the player is in trouble. What to show is decided in hudState.ts; this file only draws it.
 */

const css = `
#hud { position: absolute; inset: 0; pointer-events: none; }
#hud[hidden] { display: none; }
.ui-icon { display: inline-block; width: 1.15em; height: 1.15em; vertical-align: -0.2em; flex: none; }
.ui-icon svg { display: block; width: 100%; height: 100%; }
@keyframes hud-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
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
/* The compass: a strip whose middle is where the player looks, 90 degrees to either side. */
#hud-top { position: absolute; top: 1em; left: 50%; width: 30em; transform: translateX(-50%); }
#hud-compass {
  position: relative; height: 2.1em; overflow: hidden;
  background: linear-gradient(90deg, rgba(20, 19, 16, 0), rgba(20, 19, 16, 0.55) 18%, rgba(20, 19, 16, 0.55) 82%, rgba(20, 19, 16, 0));
  text-shadow: 0 0.05em 0.25em rgba(0, 0, 0, 0.75);
}
#hud-compass::after {
  content: ""; position: absolute; left: 50%; bottom: 0; margin-left: -0.3em;
  border: 0.3em solid transparent; border-bottom-color: #e8dcc0; border-top: 0;
}
#hud-compass .hud-point {
  position: absolute; top: 0.2em; width: 2em; margin-left: -1em; text-align: center; font-weight: 700;
}
#hud-compass .hud-point.minor { top: 0.75em; width: 0.12em; height: 0.6em; margin-left: -0.06em; background: rgba(232, 220, 192, 0.6); }
#hud-compass .hud-point[hidden] { display: none; }
#hud-compass-shelter {
  position: absolute; top: 0.15em; width: 3em; margin-left: -1.5em; text-align: center; white-space: nowrap;
  font-size: 1.05em; transition: color 0.3s;
}
#hud-compass-shelter[hidden] { display: none; }
/* Where the bag a death left behind lies. */
#hud-compass-bag { position: absolute; top: 0.15em; width: 3em; margin-left: -1.5em; text-align: center; white-space: nowrap; font-size: 1.05em; color: #ff9d4d; }
#hud-compass-bag[hidden] { display: none; }
#hud-compass-bag .hud-arrow { font-size: 0.8em; font-weight: 700; }
#hud-compass-shelter .hud-arrow { font-size: 0.8em; font-weight: 700; }
#hud-compass-shelter.marked { color: #f0c060; font-size: 1.3em; top: 0; animation: hud-blink 1s infinite; }
/* The storm warning: orange while it comes, red once it is here. */
#hud-storm {
  margin: 0.5em auto 0; width: 22em; padding: 0.45em 0.9em; box-sizing: border-box;
  display: flex; align-items: center; gap: 0.6em; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
  color: #ffb45e; background: rgba(20, 19, 16, 0.7); border: 0.1em solid #ff8a2a; border-radius: 0.25em;
}
#hud-storm[hidden] { display: none; }
#hud-storm .hud-storm-text { flex: none; }
#hud-storm .hud-storm-track { flex: 1; height: 0.5em; border-radius: 0.25em; background: rgba(255, 138, 42, 0.25); overflow: hidden; }
#hud-storm .hud-storm-fill { height: 100%; background: #ff8a2a; }
#hud-storm.storm { color: #ffd9d2; background: rgba(120, 28, 20, 0.85); border-color: #e0513f; justify-content: center; }
#hud-storm.storm .hud-storm-track { display: none; }
/* The frame rate, for those who ask for it in the settings. */
#hud-fps { position: absolute; left: 1.25em; top: 1em; font-size: 0.875em; font-weight: 700; opacity: 0.85; text-shadow: 0 0.05em 0.25em rgba(0, 0, 0, 0.75); }
#hud-fps[hidden] { display: none; }
#hud-vitals {
  position: absolute; left: 1.25em; bottom: 1em; width: 15em;
  text-shadow: 0 0.05em 0.25em rgba(0, 0, 0, 0.75);
}
#hud-vitals .ui-bar { margin: 0.45em 0 0; }
#hud-vitals .ui-bar-label { font-weight: 700; opacity: 1; align-items: center; }
#hud-vitals .hud-name { display: flex; align-items: center; gap: 0.35em; }
#hud-vitals .hud-name > .ui-icon { width: 1.4em; height: 1.4em; }
#hud-vitals .ui-bar-track { position: relative; height: 0.7em; background: rgba(20, 19, 16, 0.6); border: 0.06em solid rgba(232, 220, 192, 0.5); }
#hud-vitals .ui-bar.blink .ui-bar-track, #hud-vitals .ui-bar.blink .ui-icon { animation: hud-blink 1s infinite; }
#hud-health .ui-icon { color: #e2695a; }
#hud-health .ui-bar-fill { background: #c9584a; }
/* What is taking health, beside the bar's name. */
#hud-damage { display: flex; align-items: center; gap: 0.3em; margin-left: 0.6em; padding: 0 0.45em; border-radius: 0.2em; color: #1b1a17; background: #e2695a; font-size: 0.9em; }
#hud-damage[hidden] { display: none; }
#hud-thirst .ui-icon { color: #6fc8ea; }
#hud-thirst .ui-bar-fill { background: #4fb3d9; }
/* Body temperature is comfortable in the middle; the colder, the further the bar grows to the left. */
#hud-temperature .ui-bar-fill { position: absolute; right: 50%; top: 0; background: #6fa0ff; }
#hud-temperature .ui-bar-track::after {
  content: ""; position: absolute; left: 50%; top: 0; bottom: 0; width: 0.12em; margin-left: -0.06em; background: #e8dcc0;
}
#hud-temperature.cold .hud-stage, #hud-temperature.hypothermia .hud-stage,
#hud-temperature.cold .ui-icon, #hud-temperature.hypothermia .ui-icon { color: #6fa0ff; }
#hud-shelter {
  position: absolute; right: 1.25em; bottom: 1em; padding: 0.35em 0.9em;
  display: flex; align-items: center; gap: 0.45em;
  font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
  color: #e8dcc0; background: rgba(20, 19, 16, 0.55);
  border: 0.1em solid rgba(232, 220, 192, 0.7); border-radius: 0.25em;
  transition: background 0.4s, color 0.4s, border-color 0.4s;
}
#hud-shelter[hidden] { display: none; }
/* In a storm being sheltered is what matters most on screen. */
#hud-shelter.storm { color: #1b1a17; background: #d9c79a; border-color: #d9c79a; }
/* The bag: only how many of its slots are in use. What is in it is seen in the bag window. */
@keyframes hud-bag-pulse { 0% { background: rgba(232, 220, 192, 0.55); } 100% { background: rgba(20, 19, 16, 0.55); } }
@keyframes hud-bag-shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-0.3em); } 75% { transform: translateX(0.3em); } }
#hud-bag {
  position: absolute; right: 1.25em; bottom: 3.9em; padding: 0.3em 0.75em; white-space: pre;
  display: flex; align-items: center; gap: 0.45em; font-weight: 700;
  color: #e8dcc0; background: rgba(20, 19, 16, 0.55);
  border: 0.1em solid rgba(232, 220, 192, 0.3); border-radius: 0.25em;
  text-shadow: 0 0.05em 0.25em rgba(0, 0, 0, 0.75); transition: color 0.3s, border-color 0.3s;
}
#hud-bag.pulse { animation: hud-bag-pulse 0.5s ease-out; }
#hud-bag.shake { animation: hud-bag-shake 0.3s linear; }
/* No empty slot left: orange, the colour of warnings. */
#hud-bag.full { color: #ffb45e; border-color: #ff8a2a; }
/* The quick slots: what the keys 1 to 4 use out of the bag. They hold nothing themselves. */
@keyframes hud-quick-used { 0% { background: rgba(232, 220, 192, 0.6); } 100% { background: rgba(20, 19, 16, 0.55); } }
#hud-quick { position: absolute; left: 50%; bottom: 1em; transform: translateX(-50%); display: flex; gap: 0.4em; }
.hud-quick-slot {
  position: relative; width: 4.3em; height: 4.3em; box-sizing: border-box;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  color: #e8dcc0; background: rgba(20, 19, 16, 0.55);
  border: 0.1em solid rgba(232, 220, 192, 0.3); border-radius: 0.25em;
  text-shadow: 0 0.05em 0.25em rgba(0, 0, 0, 0.75);
}
.hud-quick-slot .ui-key { position: absolute; top: 0.25em; left: 0.3em; font-size: 0.7em; }
.hud-quick-slot .ui-icon { width: 1.9em; height: 1.9em; margin-top: 0.5em; }
.hud-quick-name { font-size: 0.75em; white-space: nowrap; }
.hud-quick-count { position: absolute; top: 0.05em; right: 0.4em; font-weight: 700; }
/* Nothing on the slot: only its key, on a darker square. */
.hud-quick-slot.empty { background: rgba(20, 19, 16, 0.3); border-color: rgba(232, 220, 192, 0.15); }
.hud-quick-slot.empty > :not(.ui-key) { display: none; }
.hud-quick-slot.empty .ui-key { opacity: 0.5; }
.hud-quick-slot.urgent { border-color: #f0c060; animation: hud-blink 1s infinite; }
.hud-quick-slot.used { animation: hud-quick-used 0.4s ease-out; }
.hud-quick-slot.refused { animation: hud-bag-shake 0.3s linear; }
/* The middle of the screen: a dot, the ring that fills round it, and the prompt under it. */
#hud-aim { position: absolute; left: 50%; top: 50%; width: 0; height: 0; }
#hud-aim[hidden] { display: none; }
#hud-aim .hud-dot {
  position: absolute; left: -0.15em; top: -0.15em; width: 0.3em; height: 0.3em; border-radius: 50%;
  background: #e8dcc0; opacity: 0.5; box-shadow: 0 0 0.2em rgba(0, 0, 0, 0.8);
  transition: transform 0.15s, opacity 0.15s;
}
#hud-aim.target .hud-dot { opacity: 1; transform: scale(1.6); }
#hud-aim .ui-ring { position: absolute; left: -1.1em; top: -1.1em; width: 2.2em; height: 2.2em; color: #f0c060; }
#hud-aim .ui-ring[hidden] { display: none; }
#hud-prompt {
  position: absolute; left: 0; top: 1.9em; transform: translateX(-50%); white-space: pre;
  display: flex; align-items: center; padding: 0.3em 0.75em; border-radius: 0.25em;
  font-weight: 700; background: rgba(20, 19, 16, 0.6); text-shadow: 0 0.05em 0.25em rgba(0, 0, 0, 0.75);
}
#hud-prompt[hidden] { display: none; }
/* Colours from the edges of the whole window, not just the 16:9 area the HUD keeps to. */
.hud-edge { position: fixed; inset: 0; opacity: 0; transition: opacity 0.6s; }
.hud-edge.shown { opacity: 1; }
#hud-edge-storm { box-shadow: inset 0 0 9em 2.5em rgba(196, 160, 96, 0.55); }
#hud-edge-cold { box-shadow: inset 0 0 8em 2em rgba(70, 120, 235, 0.5); }
#hud-edge-danger { box-shadow: inset 0 0 7em 1.5em rgba(200, 40, 30, 0.55); }
`;

/** The points of the compass: bearing in degrees, and the text key of its letter (none for the ones between). */
const COMPASS_POINTS = [
  { bearing: 0, key: "hud.compass.north" },
  { bearing: 45, key: undefined },
  { bearing: 90, key: "hud.compass.east" },
  { bearing: 135, key: undefined },
  { bearing: 180, key: "hud.compass.south" },
  { bearing: 225, key: undefined },
  { bearing: 270, key: "hud.compass.west" },
  { bearing: 315, key: undefined },
] as const;

/** How far from the middle the ends of the compass are drawn, in percent of the strip's width. */
const COMPASS_REACH = 45;

const EDGES = ["storm", "cold", "danger"] as const;


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
  /**
   * Turns the compass to `heading` and puts the shelter's mark at `shelterBearing` (both in
   * degrees clockwise from north). Returns where the mark ended up. With null for the
   * bearing there is no mark: the player is in the shelter. `bagBearing` puts a second mark
   * where the bag a death left behind lies; null (or left out) for none.
   */
  setCompass(heading: number, shelterBearing: number | null, bagBearing?: number | null): CompassPosition;
  /** Shows the warnings and effects the player's situation calls for (hudState.ts). */
  setAlerts(alerts: HudAlerts): void;
  /** Shows the frame rate in a corner (the setting), or hides it with null. */
  setFps(fps: number | null): void;
  /** Shows how full the bag is (hudState.ts); `key` is what the key that opens the bag window is called. */
  setBag(bag: BagView, key: string): void;
  /** Shakes the bag sign: something did not go in. */
  bagRefused(): void;
  /** Shows the quick slots (hudState.ts); `keys` is what each slot's key is called. */
  setQuickSlots(slots: readonly QuickSlotView[], keys: readonly string[]): void;
  /** Answers a quick slot's key: the slot lights up if something was used, and shakes if not. */
  quickSlotPressed(index: number, used: boolean): void;
  /**
   * Shows the dot in the middle and the prompt under it (hudState.ts). `key` is what the
   * interaction key is called; `progress` (0 to 1) fills the ring round the dot. `values` are
   * the numbers a prompt has in it (the repair's).
   */
  setInteraction(cue: InteractionCue, key: string, progress: number, values?: Readonly<Record<string, number>>): void;
}

export function createHud(ui: Ui, i18n: I18n): Hud {
  const style = document.createElement("style");
  style.textContent = css;
  document.head.append(style);

  const make = (tag: string, id = "", className = ""): HTMLElement => {
    const node = document.createElement(tag);
    if (id) {
      node.id = id;
    }
    if (className) {
      node.className = className;
    }
    return node;
  };

  const root = make("div", "hud");
  root.hidden = true;

  // Day and time.
  const clock = make("div", "hud-clock");
  const day = make("div", "", "hud-day");
  const time = make("div", "", "hud-time");
  const phase = make("div", "", "hud-phase");
  clock.append(day, time, phase);

  // Compass and, under it, the storm warning.
  const compass = make("div", "hud-compass");
  const points = COMPASS_POINTS.map((point) => {
    const node = make("div", "", point.key ? "hud-point" : "hud-point minor");
    compass.append(node);
    return { ...point, node };
  });
  const shelterMark = make("div", "hud-compass-shelter");
  const arrowLeft = make("span", "", "hud-arrow");
  arrowLeft.textContent = "‹";
  const arrowRight = make("span", "", "hud-arrow");
  arrowRight.textContent = "›";
  shelterMark.append(arrowLeft, createIcon("shelter"), arrowRight);
  compass.append(shelterMark);
  const bagMark = make("div", "hud-compass-bag");
  bagMark.hidden = true;
  const bagArrowLeft = make("span", "", "hud-arrow");
  bagArrowLeft.textContent = "‹";
  const bagArrowRight = make("span", "", "hud-arrow");
  bagArrowRight.textContent = "›";
  bagMark.append(bagArrowLeft, createIcon("marker-bag"), bagArrowRight);
  compass.append(bagMark);
  const storm = make("div", "hud-storm");
  storm.hidden = true;
  const stormIcon = createIcon("warning");
  const stormText = make("span", "", "hud-storm-text");
  const stormTrack = make("div", "", "hud-storm-track");
  const stormFill = make("div", "", "hud-storm-fill");
  stormTrack.append(stormFill);
  storm.append(stormIcon, stormText, stormTrack);
  const top = make("div", "hud-top");
  top.append(compass, storm);

  // The shared bar (icon, label and value over a track), filled in as the figure changes.
  const labelledBar = (id: string, icon: IconName): { bar: HTMLElement; name: HTMLElement; nameText: HTMLElement; value: HTMLElement; fill: HTMLElement } => {
    const bar = make("div", id, "ui-bar");
    const label = make("div", "", "ui-bar-label");
    const name = make("span", "", "hud-name");
    const nameText = make("span");
    name.append(createIcon(icon), nameText);
    const value = make("span", `${id}-value`);
    label.append(name, value);
    const track = make("div", "", "ui-bar-track");
    const fill = make("div", "", "ui-bar-fill");
    track.append(fill);
    bar.append(label, track);
    return { bar, name, nameText, value, fill };
  };
  const setAmount = (bar: { value: HTMLElement; fill: HTMLElement }, current: number, max: number): void => {
    // Rounded up, so the number reads 0 only when there is none left.
    const text = String(Math.ceil(current));
    if (text !== bar.value.textContent) {
      bar.value.textContent = text;
    }
    const width = `${(Math.min(Math.max(current / max, 0), 1) * 100).toFixed(1)}%`;
    if (width !== bar.fill.style.width) {
      bar.fill.style.width = width;
    }
  };
  const healthBar = labelledBar("hud-health", "health");
  const thirstBar = labelledBar("hud-thirst", "thirst");
  // Body temperature has its stage in words where the others have a number.
  const temperatureBar = labelledBar("hud-temperature", "temperature");
  temperatureBar.value.id = "hud-temperature-stage";
  temperatureBar.value.className = "hud-stage";
  // What is taking health: an icon and a word, next to the health bar's name.
  const damage = make("span", "hud-damage");
  damage.hidden = true;
  const damageIcon = createIcon("storm");
  const damageText = make("span");
  damage.append(damageIcon, damageText);
  healthBar.name.append(damage);
  const vitals = make("div", "hud-vitals");
  vitals.append(healthBar.bar, temperatureBar.bar, thirstBar.bar);

  const shelter = make("div", "hud-shelter");
  shelter.hidden = true;
  const shelterText = make("span");
  shelter.append(createIcon("shelter"), shelterText);

  const edges = EDGES.map((name) => ({ name, node: make("div", `hud-edge-${name}`, "hud-edge") }));

  // The middle: the dot, the ring round it and the prompt under it.
  const aim = make("div", "hud-aim");
  const ring = createProgressRing();
  const prompt = make("div", "hud-prompt");
  prompt.hidden = true;
  aim.append(ring.element, make("div", "", "hud-dot"), prompt);

  // The bag: an icon, the key that opens it, and how many slots are in use.
  const bag = make("div", "hud-bag");
  const bagText = make("span");
  bag.append(createIcon("bag"), bagText);

  // The quick slots: made as the game says how many there are.
  const quick = make("div", "hud-quick");
  const quickSlots: Array<{ node: HTMLElement; key: HTMLElement; icon: HTMLElement; name: HTMLElement; count: HTMLElement }> = [];

  const fps = make("div", "hud-fps");
  fps.hidden = true;
  let fpsShown: number | null = null;

  root.append(...edges.map((edge) => edge.node), clock, top, vitals, shelter, bag, quick, aim, fps);
  // Under the title and windows, which are added to the root later or sit above by their own rules.
  ui.root.prepend(root);

  let shown = "";
  let latest: ClockTime | undefined;
  const renderClock = (): void => {
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
  let stormKind: "warning" | "storm" | null = null;
  let damageCause: HudAlerts["damage"] = null;
  let latestBag: { view: BagView; key: string } | undefined;
  let bagShown = "";
  let bagTotal = -1;
  /** Plays one of the bag sign's short animations from its start, even if it is still playing. */
  const animateBag = (name: "pulse" | "shake"): void => {
    bag.classList.remove("pulse", "shake");
    // Reading the size makes the browser take note of the removal, so adding starts afresh.
    void bag.offsetWidth;
    bag.classList.add(name);
  };
  const renderBag = (view: BagView, key: string): void => {
    latestBag = { view, key };
    const shown = `${i18n.language}|${key}|${view.used}|${view.size}`;
    if (shown !== bagShown) {
      bagShown = shown;
      setKeyText(bagText, i18n.t("hud.bag", { key: KEY_MARK, used: view.used, size: view.size }), key);
      bag.classList.toggle("full", view.full);
    }
    // Something went in or came out: the sign lights up for a moment. Not when first shown.
    if (view.total !== bagTotal) {
      if (bagTotal >= 0) {
        animateBag("pulse");
      }
      bagTotal = view.total;
    }
  };
  let latestQuick: { slots: readonly QuickSlotView[]; keys: readonly string[] } | undefined;
  let quickShown = "";
  const renderQuick = (slots: readonly QuickSlotView[], keys: readonly string[]): void => {
    latestQuick = { slots, keys };
    const shown = `${i18n.language}|${keys.join()}|${slots.map((slot) => (slot ? `${slot.item}:${slot.count}:${slot.urgent}` : "-")).join()}`;
    if (shown === quickShown) {
      return;
    }
    quickShown = shown;
    while (quickSlots.length < slots.length) {
      const node = make("div", "", "hud-quick-slot");
      const key = make("span", "", "ui-key");
      const icon = createIcon("bag");
      const name = make("span", "", "hud-quick-name");
      const count = make("span", "", "hud-quick-count");
      node.append(key, icon, name, count);
      quick.append(node);
      quickSlots.push({ node, key, icon, name, count });
    }
    slots.forEach((slot, index) => {
      const drawn = quickSlots[index];
      if (!drawn) {
        return;
      }
      drawn.key.textContent = keys[index] ?? "";
      drawn.node.classList.toggle("empty", slot === null);
      drawn.node.classList.toggle("urgent", slot !== null && slot.urgent);
      drawn.node.dataset.item = slot?.item ?? "";
      if (slot) {
        setIcon(drawn.icon, ITEMS[slot.item].icon);
        drawn.name.textContent = i18n.t(ITEMS[slot.item].shortNameKey);
        drawn.count.textContent = String(slot.count);
      }
    });
  };
  let promptKind: InteractionCue["prompt"] = null;
  let promptKeyLabel = "";
  let promptValues: Readonly<Record<string, number>> = {};
  let promptValuesShown = "";
  // The key has a place in the sentence that differs from language to language. The sentence
  // is asked for with a mark where the key goes, and the key's box is put there.
  const renderPrompt = (): void => {
    if (!promptKind) {
      return;
    }
    setKeyText(prompt, i18n.t(`interact.${promptKind}`, { ...promptValues, key: KEY_MARK }), promptKeyLabel);
  };
  // Everything whose words do not change from frame to frame, written again when the language does.
  const renderWords = (): void => {
    shelterText.textContent = i18n.t("hud.sheltered");
    healthBar.nameText.textContent = i18n.t("hud.health");
    thirstBar.nameText.textContent = i18n.t("hud.thirst");
    temperatureBar.nameText.textContent = i18n.t("hud.temperature");
    temperatureBar.value.textContent = i18n.t(`hud.temperature.${stage}`);
    for (const point of points) {
      if (point.key) {
        point.node.textContent = i18n.t(point.key);
      }
    }
    if (stormKind) {
      stormText.textContent = i18n.t(stormKind === "storm" ? "hud.storm.now" : "hud.storm.warning");
    }
    if (damageCause) {
      damageText.textContent = i18n.t(`hud.damage.${damageCause}`);
    }
    renderPrompt();
    if (latestBag) {
      renderBag(latestBag.view, latestBag.key);
    }
    if (latestQuick) {
      renderQuick(latestQuick.slots, latestQuick.keys);
    }
  };
  renderWords();
  i18n.onChange(renderClock);
  i18n.onChange(renderWords);

  /**
   * Where something sits along the compass strip, as a CSS value. The ends are held a little
   * inside the strip, so a letter or mark there is not cut in half.
   */
  const along = (offset: number): string => `${(50 + offset * COMPASS_REACH).toFixed(2)}%`;

  return {
    setVisible(visible): void {
      root.hidden = !visible;
    },
    update(next): void {
      latest = next;
      renderClock();
    },
    setFps(value): void {
      const rounded = value === null ? null : Math.round(value);
      if (rounded !== fpsShown) {
        fpsShown = rounded;
        fps.hidden = rounded === null;
        if (rounded !== null) {
          fps.textContent = i18n.t("hud.fps", { fps: rounded });
        }
      }
    },
    setHealth(current, max): void {
      setAmount(healthBar, current, max);
    },
    setThirst(value, max): void {
      setAmount(thirstBar, value, max);
    },
    setTemperature(value, next): void {
      if (next !== stage) {
        stage = next;
        temperatureBar.value.textContent = i18n.t(`hud.temperature.${stage}`);
        temperatureBar.bar.classList.toggle("cold", stage === "cold");
        temperatureBar.bar.classList.toggle("hypothermia", stage === "hypothermia");
      }
      // Half the track is the cold side: full at -100.
      const width = `${(Math.min(Math.max(-value / 100, 0), 1) * 50).toFixed(1)}%`;
      if (width !== temperatureBar.fill.style.width) {
        temperatureBar.fill.style.width = width;
      }
    },
    setShelter(sheltered, inStorm): void {
      if (shelter.hidden === sheltered) {
        shelter.hidden = !sheltered;
      }
      shelter.classList.toggle("storm", inStorm);
    },
    setCompass(heading, shelterBearing, bagBearing = null): CompassPosition {
      bagMark.hidden = bagBearing === null;
      if (bagBearing !== null) {
        const bagAt = compassPosition(heading, bagBearing);
        bagMark.style.left = along(bagAt.offset);
        bagArrowLeft.hidden = bagAt.beyond !== -1;
        bagArrowRight.hidden = bagAt.beyond !== 1;
      }
      for (const point of points) {
        const at = compassPosition(heading, point.bearing);
        // The points of the compass simply leave the strip; only the shelter is held at its end.
        point.node.hidden = at.beyond !== 0;
        point.node.style.left = along(at.offset);
      }
      shelterMark.hidden = shelterBearing === null;
      const at = compassPosition(heading, shelterBearing ?? heading);
      shelterMark.style.left = along(at.offset);
      arrowLeft.hidden = at.beyond !== -1;
      arrowRight.hidden = at.beyond !== 1;
      return at;
    },
    setBag(view, key): void {
      renderBag(view, key);
    },
    bagRefused(): void {
      animateBag("shake");
    },
    setQuickSlots(slots, keys): void {
      renderQuick(slots, keys);
    },
    quickSlotPressed(index, used): void {
      const node = quickSlots[index]?.node;
      if (!node) {
        return;
      }
      node.classList.remove("used", "refused");
      // Reading the size makes the browser take note of the removal, so adding starts afresh.
      void node.offsetWidth;
      node.classList.add(used ? "used" : "refused");
    },
    setInteraction(cue, key, progress, values = {}): void {
      aim.hidden = cue.crosshair === "hidden";
      aim.classList.toggle("target", cue.crosshair === "target");
      const valuesNow = cue.prompt === null ? "" : Object.values(values).join();
      if (cue.prompt !== promptKind || key !== promptKeyLabel || valuesNow !== promptValuesShown) {
        promptKind = cue.prompt;
        promptKeyLabel = key;
        promptValues = values;
        promptValuesShown = valuesNow;
        prompt.hidden = promptKind === null;
        renderPrompt();
      }
      ring.set(cue.crosshair === "hidden" ? 0 : progress);
    },
    setAlerts(alerts): void {
      const kind = alerts.storm?.kind ?? null;
      if (kind !== stormKind) {
        stormKind = kind;
        storm.hidden = kind === null;
        storm.classList.toggle("storm", kind === "storm");
        if (kind) {
          setIcon(stormIcon, kind === "storm" ? "storm" : "warning");
          stormText.textContent = i18n.t(kind === "storm" ? "hud.storm.now" : "hud.storm.warning");
        }
      }
      if (alerts.storm?.kind === "warning") {
        const width = `${(alerts.storm.remaining * 100).toFixed(1)}%`;
        if (width !== stormFill.style.width) {
          stormFill.style.width = width;
        }
      }
      for (const edge of edges) {
        edge.node.classList.toggle("shown", alerts.edges[edge.name]);
      }
      healthBar.bar.classList.toggle("blink", alerts.blink.health);
      temperatureBar.bar.classList.toggle("blink", alerts.blink.temperature);
      thirstBar.bar.classList.toggle("blink", alerts.blink.thirst);
      shelterMark.classList.toggle("marked", alerts.shelterMarked);
      if (alerts.damage !== damageCause) {
        damageCause = alerts.damage;
        damage.hidden = damageCause === null;
        if (damageCause) {
          damage.dataset.cause = damageCause;
          setIcon(damageIcon, damageCause);
          damageText.textContent = i18n.t(`hud.damage.${damageCause}`);
        }
      }
    },
  };
}
