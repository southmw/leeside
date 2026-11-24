import type { Language } from "../locales/i18n";

/**
 * Addresses outside the game.
 *
 * Feedback is left in a form (prototype design 2.7), one for each language of the game so
 * that nobody reads two languages at once. The questions are the same in both.
 */
export const FEEDBACK_URLS: Readonly<Record<Language, string>> = {
  en: "https://docs.google.com/forms/d/e/1FAIpQLSeshZJCMGZt22okfl6zQUVNHchU0aHzOn6pWCUzZfaH5aEpeg/viewform",
  ko: "https://docs.google.com/forms/d/e/1FAIpQLSeWnxpYZwHNNlqv-Y2FVCwISDQMnMMnoFC4rL0I9DfIM7ZHaA/viewform",
};

/** The field of both forms that takes the game's number (the forms are copies of one another, so it is the same). */
export const FEEDBACK_GAME_FIELD = "entry.557299748";

/** In place of an address: no feedback at all, for looking at the screens without the button. */
export const NO_FEEDBACK = "none";

/**
 * Where feedback is left in a language, or "" when nowhere: then every button that would
 * lead there is left out. A language without a form of its own uses another's. `override`
 * stands in for the forms (development only): an address, or `NO_FEEDBACK`.
 */
export function feedbackUrlFor(language: Language, override = "", urls: Readonly<Record<Language, string>> = FEEDBACK_URLS): string {
  if (override) {
    return override === NO_FEEDBACK ? "" : override;
  }
  return urls[language] || Object.values(urls).find((url) => url !== "") || "";
}

/**
 * The address of a form with the game's number filled in, so that an answer can be put
 * beside the play record the game sent (prototype design 2.7). Only the game's own forms
 * take it; any other address, and a game without a number, is left as it is.
 */
export function withGameNumber(url: string, gameId: string, urls: Readonly<Record<Language, string>> = FEEDBACK_URLS): string {
  if (!gameId || !Object.values(urls).includes(url)) {
    return url;
  }
  return `${url}?usp=pp_url&${FEEDBACK_GAME_FIELD}=${encodeURIComponent(gameId)}`;
}
