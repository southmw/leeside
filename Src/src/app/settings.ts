import { LANGUAGES, type Language } from "../locales/i18n";

/**
 * The player's settings (prototype design 7), as plain data: what there is to set, the
 * defaults, and reading them back from what the browser kept. Anything that does not read
 * as a setting falls back to its default, so a damaged or outdated entry never breaks a start.
 */

export const QUALITIES = ["low", "high"] as const;
export type Quality = (typeof QUALITIES)[number];

export interface Settings {
  /** How fast the view turns: a factor on the tuned speed, 1 being the middle of the slider. */
  mouseSensitivity: number;
  /** Whether moving the mouse up looks down. */
  invertY: boolean;
  /** Overall volume, 0 to 1. */
  volume: number;
  quality: Quality;
  /** Whether the frame rate is shown in a corner. */
  showFps: boolean;
  /** The language chosen; null follows the browser's. */
  language: Language | null;
}

export const SENSITIVITY_MIN = 0.25;
export const SENSITIVITY_MAX = 2.5;

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  mouseSensitivity: 1,
  invertY: false,
  volume: 0.8,
  quality: "high",
  showFps: false,
  language: null,
};

/** The name the settings are kept under in the browser. */
export const SETTINGS_STORAGE_KEY = "leeside.settings";

const inRange = (value: unknown, min: number, max: number): value is number => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;

/** Settings from any value: each entry that is what it should be is kept, every other is the default. */
export function sanitizeSettings(value: unknown): Settings {
  const given = (typeof value === "object" && value !== null ? value : {}) as Record<string, unknown>;
  return {
    mouseSensitivity: inRange(given.mouseSensitivity, SENSITIVITY_MIN, SENSITIVITY_MAX) ? given.mouseSensitivity : DEFAULT_SETTINGS.mouseSensitivity,
    invertY: typeof given.invertY === "boolean" ? given.invertY : DEFAULT_SETTINGS.invertY,
    volume: inRange(given.volume, 0, 1) ? given.volume : DEFAULT_SETTINGS.volume,
    quality: QUALITIES.find((quality) => quality === given.quality) ?? DEFAULT_SETTINGS.quality,
    showFps: typeof given.showFps === "boolean" ? given.showFps : DEFAULT_SETTINGS.showFps,
    language: LANGUAGES.find((language) => language === given.language) ?? DEFAULT_SETTINGS.language,
  };
}

/** Settings from the text the browser kept; the defaults if there is none or it cannot be read. */
export function parseSettings(text: string | null | undefined): Settings {
  if (!text) {
    return { ...DEFAULT_SETTINGS };
  }
  try {
    return sanitizeSettings(JSON.parse(text));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function serializeSettings(settings: Settings): string {
  return JSON.stringify(sanitizeSettings(settings));
}

/** Where settings are kept: the browser's storage, or anything like it (tests). */
export interface SettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface SettingsStore {
  /** The settings as they now are. A copy: change them with `set`. */
  get(): Settings;
  /** Changes some settings, keeps them, and tells the listeners. */
  set(changes: Partial<Settings>): void;
  /** Puts everything back to the defaults. */
  reset(): void;
  /** Calls `listener` with the settings after every change. Returns a function that unsubscribes. */
  onChange(listener: (settings: Settings) => void): () => void;
}

/**
 * The settings, read from `storage` and written back on every change. Storage may be
 * missing or refuse (private windows): the settings then last for the visit.
 */
export function createSettingsStore(storage?: SettingsStorage): SettingsStore {
  let stored: string | null = null;
  try {
    stored = storage?.getItem(SETTINGS_STORAGE_KEY) ?? null;
  } catch {
    stored = null;
  }
  let settings = parseSettings(stored);
  const listeners = new Set<(settings: Settings) => void>();
  const changed = (): void => {
    try {
      storage?.setItem(SETTINGS_STORAGE_KEY, serializeSettings(settings));
    } catch {
      // Not being able to keep a setting is not worth interrupting the player for.
    }
    for (const listener of listeners) {
      listener({ ...settings });
    }
  };
  return {
    get: () => ({ ...settings }),
    set(changes): void {
      settings = sanitizeSettings({ ...settings, ...changes });
      changed();
    },
    reset(): void {
      settings = { ...DEFAULT_SETTINGS };
      changed();
    },
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** What a quality level means for drawing. */
export interface QualityPreset {
  /** The most device pixels per CSS pixel that are drawn. */
  maxPixelRatio: number;
  /** How many of the storm's grains are drawn, as a share of all. */
  particleShare: number;
}

export const QUALITY_PRESETS: Readonly<Record<Quality, QualityPreset>> = {
  low: { maxPixelRatio: 1, particleShare: 0.4 },
  high: { maxPixelRatio: 2, particleShare: 1 },
};
