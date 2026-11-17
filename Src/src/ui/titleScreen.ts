import { canStart, loadingFraction, type StartFlowState } from "../app/startFlow";
import type { I18n, Language } from "../locales/i18n";
import { CHARACTERS, neighbourCharacter } from "../render/characterCatalog";
import { createBar, type Ui } from "./uiRoot";

const css = `
.title-screen {
  position: fixed; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;
  /* Slightly above the middle. The title camera keeps the character to the left, clear of this. */
  padding-bottom: 8vh; box-sizing: border-box;
  text-align: center; transition: opacity 0.4s;
  background: linear-gradient(rgba(20, 19, 16, 0.35), rgba(20, 19, 16, 0.1) 40%, rgba(20, 19, 16, 0.45));
}
.title-screen.loading { background: #1b1a17; }
.title-screen.leaving { opacity: 0; pointer-events: none; }
.title-name { font-size: 4.5em; font-weight: 700; letter-spacing: 0.35em; margin: 0 0 0 0.35em; text-shadow: 0 0.05em 0.3em rgba(0, 0, 0, 0.6); }
.title-subtitle { font-size: 1.25em; letter-spacing: 0.2em; margin: 0.2em 0 0; opacity: 0.9; }
.title-tagline { font-size: 1.1em; margin: 0.8em 0 2.2em; opacity: 0.9; text-shadow: 0 0.05em 0.3em rgba(0, 0, 0, 0.7); }
.title-action { width: 16em; min-height: 3.4em; }
.title-action .ui-button { margin: 0; padding: 0.8em 1em; font-size: 1.15em; letter-spacing: 0.25em; }
.title-characters { margin-top: 1.4em; }
.title-characters-label { font-size: 0.875em; opacity: 0.8; margin-bottom: 0.4em; text-shadow: 0 0.05em 0.3em rgba(0, 0, 0, 0.7); }
.title-characters-row { display: flex; justify-content: center; border: 1px solid rgba(232, 220, 192, 0.3); border-radius: 0.3em; overflow: hidden; }
.title-characters-row .ui-button { width: auto; min-width: 5em; margin: 0; padding: 0.4em 0.9em; border: 0; border-radius: 0; }
.title-controls { margin-top: 2em; font-size: 0.95em; opacity: 0.85; text-shadow: 0 0.05em 0.3em rgba(0, 0, 0, 0.7); }
.title-corner { position: absolute; display: flex; gap: 0.6em; align-items: center; }
.title-corner.top-right { top: 1.5em; right: 1.5em; }
.title-corner.bottom-left { bottom: 1.5em; left: 1.5em; }
.title-corner.bottom-right { bottom: 1.5em; right: 1.5em; }
.title-corner .ui-button { width: auto; margin: 0; padding: 0.35em 0.9em; }
.title-languages { display: flex; border: 1px solid rgba(232, 220, 192, 0.3); border-radius: 0.3em; overflow: hidden; }
.title-languages .ui-button { border: 0; border-radius: 0; }
.title-message { max-width: 30em; font-size: 1.1em; }
`;

const LANGUAGES: readonly Language[] = ["en", "ko"];

export interface TitleScreenOptions {
  /** Shown in the corner, such as "0.1". */
  version: string;
  /** Id of the character chosen at first. */
  character: string;
  /** Called when START is pressed while the game is ready. */
  onStart(): void;
  /** Called when the player picks another character. */
  onCharacter(id: string): void;
}

export interface TitleScreen {
  /** Shows the loading bar, the START button or a message, according to the state. */
  setState(state: StartFlowState): void;
  /** Fades the title out and removes it. */
  remove(): void;
}

/**
 * The first screen (UI design 4): the game's name, START, language switch and a settings
 * button, over the live scene. While loading, a progress bar stands where START will be.
 */
export function createTitleScreen(ui: Ui, i18n: I18n, options: TitleScreenOptions): TitleScreen {
  const { t } = i18n;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.append(style);

  const screen = document.createElement("div");
  screen.className = "title-screen loading";
  screen.id = "title-screen";
  ui.root.append(screen);

  let state: StartFlowState = { phase: "loading", done: 0, total: 1 };
  let removed = false;
  let character = options.character;
  const pickCharacter = (id: string): void => {
    if (id !== character) {
      character = id;
      options.onCharacter(id);
      render();
    }
  };

  const element = (tag: string, className: string, text = ""): HTMLElement => {
    const node = document.createElement(tag);
    node.className = className;
    node.textContent = text;
    return node;
  };
  const button = (id: string, text: string, onClick: () => void, selected = false): HTMLButtonElement => {
    const node = element("button", `ui-button${selected ? " selected" : ""}`, text) as HTMLButtonElement;
    node.type = "button";
    node.id = id;
    node.tabIndex = -1;
    node.addEventListener("click", onClick);
    return node;
  };

  const openSettings = (): void => {
    // The settings screen itself arrives in plan step 2.22.
    const notice = ui.openWindow({
      id: "settings-pending",
      title: t("title.settings"),
      text: t("title.settings_pending"),
      buttons: [{ label: t("ui.close"), onActivate: () => notice.close() }],
    });
  };

  const render = (): void => {
    const unsupported = state.phase === "unsupported";
    screen.classList.toggle("loading", state.phase === "loading" || state.phase === "failed" || unsupported);

    const middle: HTMLElement[] = [element("h1", "title-name", "LEESIDE")];
    // The Korean subtitle is part of the name; other languages show the name alone.
    if (i18n.language === "ko") {
      middle.push(element("p", "title-subtitle", t("title.subtitle")));
    }

    if (state.phase === "unsupported") {
      middle.push(element("p", "title-tagline title-message", t(state.reason === "mobile" ? "title.unsupported_mobile" : "title.unsupported_webgl")));
    } else if (state.phase === "failed") {
      middle.push(element("p", "title-tagline title-message", t("title.load_failed", { message: state.message })));
    } else {
      middle.push(element("p", "title-tagline", t("title.tagline")));
      const action = element("div", "title-action");
      if (canStart(state)) {
        action.append(button("title-start", t("title.start"), options.onStart, true));
      } else {
        const fraction = loadingFraction(state);
        const bar = createBar({ label: t("title.loading"), value: `${Math.round(fraction * 100)}%`, fraction });
        bar.id = "title-loading";
        action.append(bar);
      }
      middle.push(action);
      // Choosing is optional: one of the characters is always chosen already.
      const characters = element("div", "title-characters");
      const row = element("div", "title-characters-row");
      for (const candidate of CHARACTERS) {
        row.append(
          button(`title-character-${candidate.id}`, i18n.tData(candidate.nameKey), () => pickCharacter(candidate.id), candidate.id === character),
        );
      }
      characters.append(element("div", "title-characters-label", t("title.character")), row);
      middle.push(characters, element("p", "title-controls", t("title.controls")));
    }

    const languages = element("div", "title-languages");
    for (const language of LANGUAGES) {
      languages.append(
        button(`title-language-${language}`, t(`language.${language}`), () => i18n.setLanguage(language), language === i18n.language),
      );
    }
    const topRight = element("div", "title-corner top-right");
    topRight.append(languages);
    if (!unsupported) {
      topRight.append(button("title-settings", t("title.settings"), openSettings));
    }

    const bottomLeft = element("div", "title-corner bottom-left ui-small", t("title.version", { version: options.version }));
    const bottomRight = element("div", "title-corner bottom-right ui-small", t("title.desktop_only"));
    screen.replaceChildren(topRight, ...middle, bottomLeft, bottomRight);
  };

  // Enter or Space starts the game and the arrow keys change the character, as long as no
  // window is open on top of the title.
  const onKeyDown = (event: KeyboardEvent): void => {
    if (removed || ui.openWindowId !== null || event.repeat) {
      return;
    }
    if (event.code === "Enter" || event.code === "NumpadEnter" || event.code === "Space") {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (canStart(state)) {
        options.onStart();
      }
    } else if (event.code === "ArrowLeft" || event.code === "ArrowRight") {
      if (state.phase === "loading" || state.phase === "ready") {
        event.preventDefault();
        event.stopImmediatePropagation();
        pickCharacter(neighbourCharacter(character, event.code === "ArrowRight" ? 1 : -1));
      }
    }
  };
  window.addEventListener("keydown", onKeyDown, true);
  const stopListening = i18n.onChange(render);
  render();

  return {
    setState(next: StartFlowState): void {
      state = next;
      if (!removed) {
        render();
      }
    },
    remove(): void {
      if (removed) {
        return;
      }
      removed = true;
      window.removeEventListener("keydown", onKeyDown, true);
      stopListening();
      screen.classList.add("leaving");
      window.setTimeout(() => screen.remove(), 400);
    },
  };
}
