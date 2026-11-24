import { describe, expect, it } from "vitest";
import { FEEDBACK_GAME_FIELD, FEEDBACK_URLS, feedbackUrlFor, NO_FEEDBACK, withGameNumber } from "../../src/app/links";
import { LANGUAGES } from "../../src/locales/i18n";

describe("feedbackUrlFor", () => {
  const urls = { en: "https://example.com/en", ko: "https://example.com/ko" };

  it("gives each language its own form", () => {
    expect(feedbackUrlFor("en", "", urls)).toBe("https://example.com/en");
    expect(feedbackUrlFor("ko", "", urls)).toBe("https://example.com/ko");
  });

  it("uses another language's form where a language has none", () => {
    expect(feedbackUrlFor("ko", "", { en: "https://example.com/en", ko: "" })).toBe("https://example.com/en");
    expect(feedbackUrlFor("en", "", { en: "", ko: "https://example.com/ko" })).toBe("https://example.com/ko");
  });

  it("gives nothing when there is no form at all", () => {
    expect(feedbackUrlFor("en", "", { en: "", ko: "" })).toBe("");
  });

  it("lets an override stand in for the forms, or take them away", () => {
    expect(feedbackUrlFor("ko", "https://example.com/other", urls)).toBe("https://example.com/other");
    expect(feedbackUrlFor("ko", NO_FEEDBACK, urls)).toBe("");
  });
});

describe("FEEDBACK_URLS", () => {
  it("has a secure address, or none, for every language", () => {
    for (const language of LANGUAGES) {
      expect(FEEDBACK_URLS[language] === "" || FEEDBACK_URLS[language].startsWith("https://")).toBe(true);
    }
  });

  it("does not send two languages to the same form", () => {
    const set = LANGUAGES.map((language) => FEEDBACK_URLS[language]).filter((url) => url !== "");
    expect(new Set(set).size).toBe(set.length);
  });
});

describe("withGameNumber", () => {
  const urls = { en: "https://example.com/en", ko: "https://example.com/ko" };

  it("fills the game's number into the game's own forms", () => {
    expect(withGameNumber("https://example.com/ko", "0123456789ab", urls)).toBe(`https://example.com/ko?usp=pp_url&${FEEDBACK_GAME_FIELD}=0123456789ab`);
  });

  it("leaves other addresses, no address, and a game without a number as they are", () => {
    expect(withGameNumber("https://example.com/other", "0123456789ab", urls)).toBe("https://example.com/other");
    expect(withGameNumber("", "0123456789ab", urls)).toBe("");
    expect(withGameNumber("https://example.com/ko", "", urls)).toBe("https://example.com/ko");
  });
});
