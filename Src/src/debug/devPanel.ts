import type { I18n, Language } from "../locales/i18n";
import type { Ui } from "../ui/uiRoot";
import { type ClockTime, displayTime } from "../gameplay/clock";
import type { AudioState } from "../audio/audio";
import type { WeatherReading } from "../gameplay/weather";
import type { ZonePlace } from "../world/startPoint";

/**
 * The development panel: everything the start conditions in the address do (`?character`,
 * `?props`, `?speed`, `?time`, `?timescale`, `?storm`, `?mute`, `?at`, `?lang`, `?bench`), changed on screen while the game runs.
 * Development builds only. F2 or the button in the corner opens and closes it.
 *
 * A new start condition gets a control here as well, so that nothing has to be tested by
 * editing the address.
 */

const TOGGLE_KEY = "F2";
const LANGUAGES: readonly Language[] = ["en", "ko"];
/** How often the panel's view of the clock is brought up to date while it is open, in milliseconds. */
const CLOCK_REFRESH_MS = 200;
/** How much one press of - or + changes the walking speed, in m/s. */
const SPEED_STEP = 1;
/** Hours the clock can be set to: setting out, noon, dusk, nightfall, midnight, the end of night. */
const HOURS = [6, 12, 18, 19, 0, 5];
/** Speeds the clock can be set to; 1 is normal and 0 stops it. A day takes 8 minutes at 1 and 8 seconds at 60. */
const TIME_SCALES = [0, 1, 10, 60];

const css = `
#dev-open { position: absolute; right: 0.75em; bottom: 3em; width: auto; margin: 0; padding: 0.3em 0.8em; font-size: 0.85em; opacity: 0.75; }
#dev-panel {
  position: absolute; right: 0.75em; top: 4.5em; width: 21em; max-height: calc(100vh - 9em); overflow-y: auto;
  padding: 0.9em 1em; font-size: 0.85em;
}
#dev-panel[hidden] { display: none; }
#dev-panel h2 { margin: 0 0 0.6em; font-size: 1.15em; }
#dev-panel h3 { margin: 0.9em 0 0.35em; font-size: 0.9em; font-weight: 400; opacity: 0.75; }
#dev-panel .dev-row { display: flex; flex-wrap: wrap; gap: 0.3em; align-items: center; }
#dev-panel .ui-button { width: auto; margin: 0; padding: 0.3em 0.7em; }
#dev-panel .dev-value { min-width: 5.5em; text-align: center; }
/* A press is answered at once, also by buttons that have no lasting selected state. */
#dev-panel .ui-button:active { background: #d9c79a; border-color: #d9c79a; color: #1b1a17; }
#dev-panel .dev-now { margin-left: 0.5em; opacity: 1; font-weight: 700; color: #e8dcc0; }
`;

/** What the panel can read and change in the running game. */
export interface DevControls {
  characters: readonly string[];
  character(): string;
  setCharacter(id: string): Promise<void>;
  /** Ids of the sets of prop models (world/propModels.ts). */
  propSets: readonly string[];
  propSet(): string;
  setPropSet(id: string): Promise<void>;
  moveSpeed(): number;
  setMoveSpeed(speed: number): void;
  defaultMoveSpeed: number;
  clock(): ClockTime;
  setHour(hour: number): void;
  timeScale(): number;
  setTimeScale(scale: number): void;
  weather(): WeatherReading;
  /** Calls a storm now: announced first (`warning`), or arriving at once. */
  callStorm(warning: boolean): void;
  /** Ends the storm and keeps the rest of the day clear. */
  calmWeather(): void;
  audio(): { state: AudioState; muted: boolean };
  setMuted(muted: boolean): void;
  places: readonly ZonePlace[];
  goTo(place: ZonePlace): void;
}

export function createDevPanel(ui: Ui, i18n: I18n, controls: DevControls): void {
  const { t } = i18n;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.append(style);

  const panel = document.createElement("div");
  panel.id = "dev-panel";
  panel.className = "ui-panel";
  panel.hidden = true;
  const opener = document.createElement("button");
  opener.id = "dev-open";
  opener.className = "ui-button";
  opener.type = "button";
  ui.root.append(opener, panel);

  const toggle = (): void => {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) {
      render();
    }
  };
  opener.addEventListener("click", () => {
    opener.blur();
    toggle();
  });

  const element = (tag: string, text = "", className = ""): HTMLElement => {
    const node = document.createElement(tag);
    node.textContent = text;
    node.className = className;
    return node;
  };
  const button = (id: string, text: string, onClick: () => void | Promise<void>, selected = false): HTMLButtonElement => {
    const node = element("button", text, `ui-button${selected ? " selected" : ""}`) as HTMLButtonElement;
    node.type = "button";
    node.id = id;
    node.tabIndex = -1;
    node.addEventListener("click", () => {
      // Keep the keyboard with the game: a focused button would take Space for itself.
      node.blur();
      void Promise.resolve(onClick()).then(render);
    });
    return node;
  };
  const section = (title: string, ...children: HTMLElement[]): HTMLElement[] => {
    const row = element("div", "", "dev-row");
    row.append(...children);
    return [element("h3", title), row];
  };
  /** Starts the page again with these start conditions, keeping the current character and props. */
  const reloadWith = (condition: string): void => {
    const params = new URLSearchParams({ character: controls.character(), props: controls.propSet() });
    window.location.search = `?${condition}&${params.toString()}`;
  };
  const pressKey = (code: string): void => {
    window.dispatchEvent(new KeyboardEvent("keydown", { code, key: code }));
  };

  // The clock runs on while the panel is open, so this section is kept up to date in place
  // (rebuilding the panel under the mouse would swallow clicks): the time now is written next
  // to the heading, and the button of the hour last passed is marked.
  let timeNow: HTMLElement | undefined;
  let timeButtons: Array<{ hour: number; node: HTMLButtonElement }> = [];
  const timeSection = (): HTMLElement[] => {
    timeButtons = HOURS.map((hour) => ({
      hour,
      node: button(`dev-time-${hour}`, t("hud.time", displayTime(hour)), () => controls.setHour(hour)),
    }));
    const [heading, row] = section(t("dev.time"), ...timeButtons.map((entry) => entry.node));
    timeNow = element("span", "", "dev-now");
    timeNow.id = "dev-time-now";
    heading?.append(timeNow);
    refreshClock();
    return heading && row ? [heading, row] : [];
  };
  let weatherNow: HTMLElement | undefined;
  const weatherSection = (): HTMLElement[] => {
    const [heading, row] = section(
      t("dev.weather"),
      button("dev-storm-warning", t("dev.weather.warning"), () => controls.callStorm(true)),
      button("dev-storm-now", t("dev.weather.storm"), () => controls.callStorm(false)),
      button("dev-storm-calm", t("dev.weather.calm"), () => controls.calmWeather()),
    );
    weatherNow = element("span", "", "dev-now");
    weatherNow.id = "dev-weather-now";
    heading?.append(weatherNow);
    return heading && row ? [heading, row] : [];
  };
  // The sound's state changes by itself too (loading, then waiting for the first click).
  let audioNow: HTMLElement | undefined;
  const audioSection = (): HTMLElement[] => {
    const { muted } = controls.audio();
    const [heading, row] = section(
      t("dev.audio"),
      button("dev-audio-on", t("dev.audio.on"), () => controls.setMuted(false), !muted),
      button("dev-audio-off", t("dev.audio.off"), () => controls.setMuted(true), muted),
    );
    audioNow = element("span", "", "dev-now");
    audioNow.id = "dev-audio-now";
    heading?.append(audioNow);
    return heading && row ? [heading, row] : [];
  };
  function refreshClock(): void {
    if (audioNow) {
      audioNow.textContent = t(`audio.${controls.audio().state}`);
    }
    if (weatherNow) {
      const weather = controls.weather();
      const phase = t(`weather.${weather.phase}`);
      weatherNow.textContent = Number.isFinite(weather.secondsLeft)
        ? t("dev.weather.now", { phase, seconds: Math.ceil(weather.secondsLeft) })
        : phase;
    }
    if (!timeNow) {
      return;
    }
    const time = controls.clock();
    timeNow.textContent = `${t("hud.day", { day: time.day })} ${t("hud.time", displayTime(time.hour))}`;
    // The hour last passed, counting from the start of the day (06:00) round to 05:59.
    const sinceDawn = (hour: number): number => (hour - 6 + 24) % 24;
    let current = timeButtons[0];
    for (const entry of timeButtons) {
      if (sinceDawn(entry.hour) <= sinceDawn(time.hour) && (!current || sinceDawn(entry.hour) >= sinceDawn(current.hour))) {
        current = entry;
      }
    }
    for (const entry of timeButtons) {
      entry.node.classList.toggle("selected", entry === current);
    }
  }
  window.setInterval(() => {
    if (!panel.hidden) {
      refreshClock();
    }
  }, CLOCK_REFRESH_MS);

  function render(): void {
    opener.textContent = t("dev.open");
    if (panel.hidden) {
      return;
    }
    const speed = controls.moveSpeed();
    panel.replaceChildren(
      element("h2", t("dev.title")),
      ...section(
        t("dev.character"),
        ...controls.characters.map((id) =>
          button(`dev-character-${id}`, i18n.tData(`character.${id}`), () => controls.setCharacter(id), id === controls.character()),
        ),
      ),
      ...section(
        t("dev.props"),
        // The sets are named by their ids, which are the names of the asset packs.
        ...controls.propSets.map((id) => button(`dev-props-${id}`, id, () => controls.setPropSet(id), id === controls.propSet())),
      ),
      ...section(
        t("dev.speed"),
        button("dev-speed-down", "-", () => controls.setMoveSpeed(speed - SPEED_STEP)),
        element("span", t("dev.speed.value", { speed }), "dev-value"),
        button("dev-speed-up", "+", () => controls.setMoveSpeed(speed + SPEED_STEP)),
        button("dev-speed-reset", t("dev.speed.reset"), () => controls.setMoveSpeed(controls.defaultMoveSpeed)),
      ),
      ...timeSection(),
      ...section(
        t("dev.timescale"),
        ...TIME_SCALES.map((scale) =>
          button(`dev-timescale-${scale}`, t("dev.timescale.value", { scale }), () => controls.setTimeScale(scale), scale === controls.timeScale()),
        ),
      ),
      ...weatherSection(),
      ...audioSection(),
      // Places are named by their ids in the zone data, which are not text for players.
      ...section(t("dev.places"), ...controls.places.map((place) => button(`dev-place-${place.id}`, place.id, () => controls.goTo(place)))),
      ...section(
        t("dev.language"),
        ...LANGUAGES.map((language) =>
          button(`dev-language-${language}`, t(`language.${language}`), () => i18n.setLanguage(language), language === i18n.language),
        ),
      ),
      ...section(
        t("dev.tools"),
        button("dev-tool-debug", t("dev.tools.debug"), () => pressKey("F3")),
        button("dev-tool-sample", t("dev.tools.sample"), () => pressKey("F4")),
        button("dev-tool-bench", t("dev.tools.bench"), () => reloadWith("bench")),
        button("dev-tool-title", t("dev.tools.title"), () => {
          window.location.search = "";
        }),
      ),
    );
    // The parts that follow the clock are filled in at once, not at the next tick.
    refreshClock();
  }

  window.addEventListener("keydown", (event) => {
    if (event.code === TOGGLE_KEY && !event.repeat) {
      event.preventDefault();
      toggle();
    }
  });
  i18n.onChange(render);
  render();
}
