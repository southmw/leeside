import { describe, expect, it, vi } from "vitest";
import {
  createI18n,
  detectLanguage,
  formatMessage,
  LANGUAGES,
  MESSAGES,
  parseLanguage,
  placeholdersOf,
  translate,
} from "../../src/locales/i18n";

describe("locale files", () => {
  const enKeys = Object.keys(MESSAGES.en).sort();

  it("have entries", () => {
    expect(enKeys.length).toBeGreaterThan(0);
  });

  it.each(LANGUAGES)("%s has exactly the same keys as en", (language) => {
    expect(Object.keys(MESSAGES[language]).sort()).toEqual(enKeys);
  });

  it.each(LANGUAGES)("%s has no empty text", (language) => {
    const empty = Object.entries(MESSAGES[language]).filter(([, text]) => text.trim() === "");
    expect(empty).toEqual([]);
  });

  it.each(LANGUAGES)("%s uses the same placeholders as en", (language) => {
    const table: Record<string, string> = MESSAGES[language];
    const mismatched = Object.entries(MESSAGES.en)
      .filter(([key, text]) => {
        const expected = placeholdersOf(text).sort();
        const actual = placeholdersOf(table[key] ?? "").sort();
        return expected.join() !== actual.join();
      })
      .map(([key]) => key);
    expect(mismatched).toEqual([]);
  });
});

describe("formatMessage", () => {
  it("fills in values", () => {
    expect(formatMessage("{count}개 획득", { count: 3 })).toBe("3개 획득");
    expect(formatMessage("Picked up {count} x {name}", { count: 2, name: "Scrap" })).toBe("Picked up 2 x Scrap");
  });

  it("fills a repeated placeholder every time", () => {
    expect(formatMessage("{n} of {n}", { n: 5 })).toBe("5 of 5");
  });

  it("leaves a placeholder without a value untouched", () => {
    expect(formatMessage("{count} left", {})).toBe("{count} left");
  });

  it("returns text without placeholders unchanged", () => {
    expect(formatMessage("Storm approaching")).toBe("Storm approaching");
  });
});

describe("translate", () => {
  const table = { hello: "Hello, {name}" };

  it("returns the text for a known key", () => {
    expect(translate(table, "hello", { name: "Ada" })).toBe("Hello, Ada");
  });

  it("reports an unknown key and returns the key", () => {
    const onMissing = vi.fn();
    expect(translate(table, "nope", undefined, onMissing)).toBe("nope");
    expect(onMissing).toHaveBeenCalledWith("nope");
  });

  it("does not treat inherited properties as texts", () => {
    const onMissing = vi.fn();
    expect(translate(table, "toString", undefined, onMissing)).toBe("toString");
    expect(onMissing).toHaveBeenCalledOnce();
  });
});

describe("parseLanguage", () => {
  it("accepts supported languages with or without a region", () => {
    expect(parseLanguage("ko")).toBe("ko");
    expect(parseLanguage("ko-KR")).toBe("ko");
    expect(parseLanguage("EN_us")).toBe("en");
  });

  it("rejects everything else", () => {
    expect(parseLanguage("ja-JP")).toBeUndefined();
    expect(parseLanguage("")).toBeUndefined();
    expect(parseLanguage(null)).toBeUndefined();
    expect(parseLanguage("korean")).toBeUndefined();
  });
});

describe("detectLanguage", () => {
  it("uses Korean for a Korean browser and English for any other", () => {
    expect(detectLanguage({ browser: ["ko-KR", "en-US"] })).toBe("ko");
    expect(detectLanguage({ browser: ["en-US", "ko-KR"] })).toBe("en");
    expect(detectLanguage({ browser: ["ja-JP", "ko-KR"] })).toBe("en");
    expect(detectLanguage({})).toBe("en");
  });

  it("lets ?lang override the browser", () => {
    expect(detectLanguage({ query: "en", browser: ["ko-KR"] })).toBe("en");
    expect(detectLanguage({ query: "ko", browser: ["en-US"] })).toBe("ko");
  });

  it("ignores an unsupported ?lang", () => {
    expect(detectLanguage({ query: "xx", browser: ["ko-KR"] })).toBe("ko");
  });
});

describe("createI18n", () => {
  const messages = {
    en: { greeting: "Hello", got: "Got {count}" },
    ko: { greeting: "안녕하세요", got: "{count}개 획득" },
  };

  it("returns text in the active language", () => {
    const i18n = createI18n("ko");
    expect(i18n.t("quality.high")).toBe("높음");
    i18n.setLanguage("en");
    expect(i18n.t("quality.high")).toBe("High");
    expect(i18n.t("debug.frames_over", { ms: 34 })).toBe("Frames > 34 ms");
  });

  it("notifies listeners on change, and only on a real change", () => {
    const i18n = createI18n("en", { messages });
    const listener = vi.fn();
    const unsubscribe = i18n.onChange(listener);

    i18n.setLanguage("en");
    expect(listener).not.toHaveBeenCalled();

    i18n.setLanguage("ko");
    expect(listener).toHaveBeenCalledExactlyOnceWith("ko");
    expect(i18n.language).toBe("ko");

    unsubscribe();
    i18n.setLanguage("en");
    expect(listener).toHaveBeenCalledOnce();
  });

  it("reports a missing key once per language", () => {
    const onMissing = vi.fn();
    const i18n = createI18n("en", { messages, onMissing });
    const lookUp = i18n.t as (key: string) => string;

    expect(lookUp("missing.key")).toBe("missing.key");
    lookUp("missing.key");
    expect(onMissing).toHaveBeenCalledExactlyOnceWith("missing.key", "en");

    i18n.setLanguage("ko");
    lookUp("missing.key");
    expect(onMissing).toHaveBeenCalledTimes(2);
  });
});
