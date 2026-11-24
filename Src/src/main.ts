import { version } from "../package.json";
import { advanceStartFlow, initialStartFlow, type StartFlowEvent } from "./app/startFlow";
import { checkSupport } from "./app/support";
import { createSettingsStore, type SettingsStorage } from "./app/settings";
import { createI18n, detectLanguage } from "./locales/i18n";
import { chooseCharacter } from "./render/characterCatalog";
import { createErrorScreen } from "./ui/errorScreen";
import { createTitleScreen, type TitleScreen } from "./ui/titleScreen";
import { createSettingsScreen } from "./ui/settingsScreen";
import { createUi } from "./ui/uiRoot";

/**
 * Entry point. It is deliberately small: the title screen appears as soon as this file has
 * loaded, and the game itself (3D engine, physics, world) is fetched behind it.
 *
 * `?skipTitle` goes straight into the game, for development and automated checks.
 * `?bench` starts a performance measurement and has no title either.
 */

/** Parts of loading the progress bar counts: fetching the game's code, then the game's own steps. */
const GAME_LOADING_STEPS = 3;
const LOADING_STEPS = 1 + GAME_LOADING_STEPS;

// Start conditions come from the URL, e.g. `?lang=ko`.
const startParams = new URLSearchParams(window.location.search);

// The settings are kept in the browser. Storage can be unavailable (private windows, blocked
// site data); they then last for the visit.
function browserStorage(): SettingsStorage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}
const settings = createSettingsStore(browserStorage());

// The language: `?lang` for this visit, else the one chosen in the settings, else the browser's.
const i18n = createI18n(detectLanguage({ query: startParams.get("lang") ?? settings.get().language, browser: navigator.languages }));
settings.onChange((now) => i18n.setLanguage(now.language ?? detectLanguage({ browser: navigator.languages })));
document.documentElement.lang = i18n.language;
i18n.onChange((language) => {
  document.documentElement.lang = language;
});

// The character chosen last time is kept in the browser. Storage can be unavailable (private
// windows, blocked site data); the game then simply starts with the default each time.
const CHARACTER_STORAGE_KEY = "leeside.character";
function storedCharacter(): string | null {
  try {
    return window.localStorage.getItem(CHARACTER_STORAGE_KEY);
  } catch {
    return null;
  }
}
function storeCharacter(id: string): void {
  try {
    window.localStorage.setItem(CHARACTER_STORAGE_KEY, id);
  } catch {
    // Not being able to remember the choice is not worth interrupting the player for.
  }
}
// Whether the introduction has been played through here before: then the title offers to skip it.
const INTRO_STORAGE_KEY = "leeside.introDone";
function introDone(): boolean {
  try {
    return window.localStorage.getItem(INTRO_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}
function storeIntroDone(): void {
  try {
    window.localStorage.setItem(INTRO_STORAGE_KEY, "1");
  } catch {
    // Then the introduction is simply not offered for skipping next time.
  }
}
// `?character=lis` picks a character for this visit only.
let character = chooseCharacter(startParams.get("character"), storedCharacter());

const ui = createUi(i18n);

// An error nothing handled stops the game behind a screen that says so (UI design 13).
// Set up before the game is fetched, so that it also covers the game's own start.
const errorScreen = createErrorScreen(ui, i18n, { version, reload: () => window.location.reload() });
window.addEventListener("error", (event) => errorScreen.show(event.error ?? event.message));
window.addEventListener("unhandledrejection", (event) => errorScreen.show(event.reason));
const settingsScreen = createSettingsScreen(ui, i18n, settings, {
  fullscreen: {
    isOn: () => document.fullscreenElement !== null,
    // The browser may refuse (it wants a click first, or does not allow it at all); then nothing changes.
    set: (on) => void (on ? document.documentElement.requestFullscreen() : document.exitFullscreen()).catch(() => {}),
  },
});
const withoutTitle = startParams.has("skipTitle") || startParams.has("bench");

let flow = initialStartFlow(LOADING_STEPS);
let startGame: ((skipIntro: boolean) => void) | undefined;
let setGameCharacter: ((id: string) => Promise<void>) | undefined;

const showTitle = (): TitleScreen =>
  createTitleScreen(ui, i18n, {
    // "0.1.0" is shown as "0.1".
    version: version.split(".").slice(0, 2).join("."),
    character,
    onStart: () => dispatch({ type: "start" }),
    // Back from the settings the title is drawn again: what it says about play records may have changed.
    onSettings: () => settingsScreen.open(() => title?.setState(flow)),
    sendsRecords: () => settings.get().sendRecords,
    introDone: introDone(),
    onCharacter: (id) => {
      character = id;
      storeCharacter(id);
      void setGameCharacter?.(id);
    },
  });
let title = withoutTitle ? undefined : showTitle();

function dispatch(event: StartFlowEvent): void {
  const wasPlaying = flow.phase === "playing";
  flow = advanceStartFlow(flow, event);
  title?.setState(flow);
  const isPlaying = flow.phase === "playing";
  if (isPlaying && !wasPlaying) {
    const skipIntro = title?.skipIntro ?? false;
    title?.remove();
    title = undefined;
    startGame?.(skipIntro);
  } else if (wasPlaying && !isPlaying) {
    // Back from the game, which has put itself back to its beginning. This is the one way to
    // the title for a visit that began without it (`?skipTitle`).
    title = showTitle();
    title.setState(flow);
  }
}

const unsupported = checkSupport({
  userAgent: navigator.userAgent,
  maxTouchPoints: navigator.maxTouchPoints,
  finePointer: window.matchMedia("(pointer: fine)").matches,
  webgl2: document.createElement("canvas").getContext("webgl2") !== null,
});

if (unsupported && !withoutTitle) {
  dispatch({ type: "unsupported", reason: unsupported });
} else {
  try {
    const { bootGame } = await import("./game");
    dispatch({ type: "step_done" });
    const game = await bootGame({
      i18n,
      ui,
      startParams,
      character,
      settings,
      openSettings: (onBack) => settingsScreen.open(onBack),
      onProgress: () => dispatch({ type: "step_done" }),
      onQuit: () => dispatch({ type: "quit" }),
      onIntroDone: storeIntroDone,
      recordStorage: browserStorage(),
    });
    startGame = (skipIntro) => game.start({ skipIntro });
    setGameCharacter = (id) => game.setCharacter(id);
    // The player may have picked another character while the game was still loading.
    void game.setCharacter(character);
    dispatch({ type: "loaded" });
    if (withoutTitle) {
      dispatch({ type: "start" });
    }
  } catch (error) {
    console.error("The game could not be started.", error);
    dispatch({ type: "failed", message: error instanceof Error ? error.message : String(error) });
  }
}
