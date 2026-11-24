import { describe, expect, it } from "vitest";
import {
  createSettingsStore,
  DEFAULT_SETTINGS,
  parseSettings,
  QUALITY_PRESETS,
  sanitizeSettings,
  SENSITIVITY_MAX,
  serializeSettings,
  SETTINGS_STORAGE_KEY,
} from "../../src/app/settings";

const memory = (initial: Record<string, string> = {}) => {
  const kept = new Map(Object.entries(initial));
  return { kept, getItem: (key: string) => kept.get(key) ?? null, setItem: (key: string, value: string) => void kept.set(key, value) };
};

describe("the default settings", () => {
  it("are those of the design: middle sensitivity, 80% volume, high quality, the browser's language", () => {
    expect(DEFAULT_SETTINGS).toEqual({ mouseSensitivity: 1, invertY: false, volume: 0.8, quality: "high", showFps: false, language: null, sendRecords: true });
  });
});

describe("reading settings back", () => {
  it("gives the defaults when nothing was kept, or what was kept cannot be read", () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("")).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("{not json")).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("42")).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("null")).toEqual(DEFAULT_SETTINGS);
  });

  it("gives back what was written", () => {
    const settings = { mouseSensitivity: 1.6, invertY: true, volume: 0.25, quality: "low", showFps: true, language: "ko", sendRecords: false } as const;
    expect(parseSettings(serializeSettings(settings))).toEqual(settings);
  });

  it("takes each entry by itself: a wrong one is the default, the others are kept", () => {
    const read = sanitizeSettings({ mouseSensitivity: 99, invertY: "yes", volume: 0.5, quality: "ultra", showFps: true, language: "fr", extra: 1 });
    expect(read).toEqual({ ...DEFAULT_SETTINGS, volume: 0.5, showFps: true });
  });

  it("keeps numbers within their limits only", () => {
    expect(sanitizeSettings({ volume: -0.1 }).volume).toBe(0.8);
    expect(sanitizeSettings({ volume: 0 }).volume).toBe(0);
    expect(sanitizeSettings({ volume: Number.NaN }).volume).toBe(0.8);
    expect(sanitizeSettings({ mouseSensitivity: SENSITIVITY_MAX }).mouseSensitivity).toBe(SENSITIVITY_MAX);
    expect(sanitizeSettings({ mouseSensitivity: 0 }).mouseSensitivity).toBe(1);
  });
});

describe("the settings store", () => {
  it("starts from what the browser kept", () => {
    const storage = memory({ [SETTINGS_STORAGE_KEY]: JSON.stringify({ volume: 0.3, language: "ko" }) });
    expect(createSettingsStore(storage).get()).toEqual({ ...DEFAULT_SETTINGS, volume: 0.3, language: "ko" });
  });

  it("keeps every change and tells those who listen", () => {
    const storage = memory();
    const store = createSettingsStore(storage);
    const heard: number[] = [];
    store.onChange((settings) => heard.push(settings.volume));
    store.set({ volume: 0.4 });
    store.set({ invertY: true });
    expect(heard).toEqual([0.4, 0.4]);
    expect(createSettingsStore(storage).get()).toMatchObject({ volume: 0.4, invertY: true });
  });

  it("does not take a wrong value", () => {
    const store = createSettingsStore(memory());
    store.set({ volume: 7 });
    expect(store.get().volume).toBe(0.8);
  });

  it("goes back to the defaults, and keeps that too", () => {
    const storage = memory();
    const store = createSettingsStore(storage);
    store.set({ quality: "low", showFps: true, language: "en" });
    store.reset();
    expect(store.get()).toEqual(DEFAULT_SETTINGS);
    expect(createSettingsStore(storage).get()).toEqual(DEFAULT_SETTINGS);
  });

  it("works for the visit without storage, or with storage that refuses", () => {
    const refusing = {
      getItem: (): string | null => {
        throw new Error("blocked");
      },
      setItem: (): void => {
        throw new Error("blocked");
      },
    };
    for (const store of [createSettingsStore(), createSettingsStore(refusing)]) {
      store.set({ volume: 0.1 });
      expect(store.get().volume).toBe(0.1);
    }
  });

  it("hands out copies", () => {
    const store = createSettingsStore(memory());
    store.get().volume = 0;
    expect(store.get().volume).toBe(0.8);
  });
});

describe("the quality levels", () => {
  it("draw fewer pixels and fewer grains on low", () => {
    expect(QUALITY_PRESETS.low.maxPixelRatio).toBeLessThan(QUALITY_PRESETS.high.maxPixelRatio);
    expect(QUALITY_PRESETS.low.particleShare).toBeLessThan(QUALITY_PRESETS.high.particleShare);
    expect(QUALITY_PRESETS.high.particleShare).toBe(1);
  });
});
