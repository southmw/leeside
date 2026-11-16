import en from "./en.json";
import ko from "./ko.json";

export const LANGUAGES = ["en", "ko"] as const;
export type Language = (typeof LANGUAGES)[number];

/** Used when neither the URL nor the browser asks for a supported language. */
export const DEFAULT_LANGUAGE: Language = "en";

/** Every text shown on screen has an entry in the English file; its keys define the set. */
export type MessageKey = keyof typeof en;
export type MessageParams = Readonly<Record<string, string | number>>;
export type MessageTable = Readonly<Record<string, string>>;

/** Typing `ko` against the English keys makes a missing Korean entry a compile error. */
export const MESSAGES: Readonly<Record<Language, Readonly<Record<MessageKey, string>>>> = { en, ko };

const PLACEHOLDER = /\{(\w+)\}/g;

/** Names of the `{placeholders}` in a text, in order of appearance. */
export function placeholdersOf(template: string): string[] {
  return Array.from(template.matchAll(PLACEHOLDER), (match) => match[1] ?? "");
}

/**
 * Fills `{name}` placeholders. A placeholder without a value is left as it is, so the
 * mistake stays visible on screen instead of turning into "undefined".
 */
export function formatMessage(template: string, params: MessageParams = {}): string {
  return template.replace(PLACEHOLDER, (whole, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : whole,
  );
}

/**
 * Looks a text up and fills in its values. An unknown key is reported through `onMissing`
 * and the key itself is returned, which is easy to spot on screen.
 */
export function translate(
  table: MessageTable,
  key: string,
  params?: MessageParams,
  onMissing?: (key: string) => void,
): string {
  if (!Object.hasOwn(table, key)) {
    onMissing?.(key);
    return key;
  }
  return formatMessage(table[key] ?? key, params);
}

/** Maps a language tag such as "ko", "ko-KR" or "EN_us" to a supported language. */
export function parseLanguage(tag: string | null | undefined): Language | undefined {
  const primary = tag?.trim().toLowerCase().split(/[-_]/)[0];
  return LANGUAGES.find((language) => language === primary);
}

export interface LanguageSources {
  /** Value of `?lang=` in the URL, if any. It wins over everything else. */
  query?: string | null;
  /** The browser's preferred languages, most preferred first (`navigator.languages`). */
  browser?: readonly string[];
}

/**
 * Picks the starting language: `?lang` if it names a supported language, otherwise the
 * browser's first preference if supported, otherwise English.
 */
export function detectLanguage({ query, browser = [] }: LanguageSources): Language {
  return parseLanguage(query) ?? parseLanguage(browser[0]) ?? DEFAULT_LANGUAGE;
}

export interface I18n {
  readonly language: Language;
  /** Switches language and notifies listeners. Nothing happens if it is already active. */
  setLanguage(language: Language): void;
  /** Returns the text for `key` in the active language, with `{name}` values filled in. */
  t(key: MessageKey, params?: MessageParams): string;
  /**
   * Like `t`, for keys that come from data (a zone's or an item's name key) and so cannot be
   * checked at compile time. An unknown key is reported and shown as it is.
   */
  tData(key: string, params?: MessageParams): string;
  /** Calls `listener` after every language change. Returns a function that unsubscribes. */
  onChange(listener: (language: Language) => void): () => void;
}

export interface I18nOptions {
  /** Text tables per language. Defaults to the game's locale files; tests pass their own. */
  messages?: Readonly<Record<Language, MessageTable>>;
  /** Called once per unknown key. */
  onMissing?: (key: string, language: Language) => void;
}

export function createI18n(initial: Language, options: I18nOptions = {}): I18n {
  const messages = options.messages ?? MESSAGES;
  const onMissing =
    options.onMissing ??
    ((key, language) => console.error(`[i18n] Missing text "${key}" for language "${language}"`));

  let language = initial;
  const listeners = new Set<(language: Language) => void>();
  const reported = new Set<string>();

  const reportMissing = (key: string): void => {
    const id = `${language}:${key}`;
    if (!reported.has(id)) {
      reported.add(id);
      onMissing(key, language);
    }
  };

  return {
    get language(): Language {
      return language;
    },
    setLanguage(next: Language): void {
      if (next === language) {
        return;
      }
      language = next;
      for (const listener of listeners) {
        listener(language);
      }
    },
    t(key, params) {
      return translate(messages[language], key, params, reportMissing);
    },
    tData(key, params) {
      return translate(messages[language], key, params, reportMissing);
    },
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
