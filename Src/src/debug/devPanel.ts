import type { I18n, Language } from "../locales/i18n";
import type { Ui } from "../ui/uiRoot";
import type { ZonePlace } from "../world/startPoint";

/**
 * The development panel: everything the start conditions in the address do (`?character`,
 * `?props`, `?speed`, `?at`, `?lang`, `?bench`), changed on screen while the game runs.
 * Development builds only. F2 or the button in the corner opens and closes it.
 *
 * A new start condition gets a control here as well, so that nothing has to be tested by
 * editing the address.
 */

const TOGGLE_KEY = "F2";
const LANGUAGES: readonly Language[] = ["en", "ko"];
/** How much one press of - or + changes the walking speed, in m/s. */
const SPEED_STEP = 1;

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
