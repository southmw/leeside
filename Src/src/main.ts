import { version } from "../package.json";
import { advanceStartFlow, initialStartFlow, type StartFlowEvent } from "./app/startFlow";
import { checkSupport } from "./app/support";
import { createI18n, detectLanguage } from "./locales/i18n";
import { createTitleScreen } from "./ui/titleScreen";
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

const i18n = createI18n(detectLanguage({ query: startParams.get("lang"), browser: navigator.languages }));
document.documentElement.lang = i18n.language;
i18n.onChange((language) => {
  document.documentElement.lang = language;
});

const ui = createUi(i18n);
const withoutTitle = startParams.has("skipTitle") || startParams.has("bench");

let flow = initialStartFlow(LOADING_STEPS);
let startGame: (() => void) | undefined;

const title = withoutTitle
  ? undefined
  : createTitleScreen(ui, i18n, {
      // "0.1.0" is shown as "0.1".
      version: version.split(".").slice(0, 2).join("."),
      onStart: () => dispatch({ type: "start" }),
    });

function dispatch(event: StartFlowEvent): void {
  const before = flow.phase;
  flow = advanceStartFlow(flow, event);
  title?.setState(flow);
  if (flow.phase === "playing" && before !== "playing") {
    title?.remove();
    startGame?.();
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
    const game = await bootGame({ i18n, ui, startParams, onProgress: () => dispatch({ type: "step_done" }) });
    startGame = () => game.start();
    dispatch({ type: "loaded" });
    if (withoutTitle) {
      dispatch({ type: "start" });
    }
  } catch (error) {
    console.error("The game could not be started.", error);
    dispatch({ type: "failed", message: error instanceof Error ? error.message : String(error) });
  }
}
