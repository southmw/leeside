import { describe, expect, it } from "vitest";
import { describeError, formatErrorReport, isIgnorableError } from "../../src/app/errorReport";

describe("describeError", () => {
  it("reads an Error's name, message and stack", () => {
    const error = new TypeError("x is not a function");
    const details = describeError(error);
    expect(details.message).toBe("TypeError: x is not a function");
    expect(details.stack).toBe(error.stack);
  });

  it("reads an Error without a message by its name", () => {
    expect(describeError(new RangeError()).message).toBe("RangeError");
  });

  it("reads things that are not errors", () => {
    expect(describeError("it broke")).toEqual({ message: "it broke" });
    expect(describeError({ code: 7 })).toEqual({ message: '{"code":7}' });
    expect(describeError(42)).toEqual({ message: "42" });
  });

  it("says so when there is nothing to read", () => {
    expect(describeError(undefined)).toEqual({ message: "Unknown error" });
    expect(describeError(null)).toEqual({ message: "Unknown error" });
    expect(describeError("")).toEqual({ message: "Unknown error" });
  });

  it("survives a thing that cannot be written out", () => {
    const loop: { self?: unknown } = {};
    loop.self = loop;
    expect(describeError(loop).message).toBe("[object Object]");
  });
});

describe("isIgnorableError", () => {
  it("ignores what is not the game's", () => {
    expect(isIgnorableError("ResizeObserver loop completed with undelivered notifications.")).toBe(true);
    expect(isIgnorableError("ResizeObserver loop limit exceeded")).toBe(true);
    expect(isIgnorableError("Script error.")).toBe(true);
    expect(isIgnorableError("Error: Script error.")).toBe(true);
  });

  it("does not ignore the game's own errors", () => {
    expect(isIgnorableError("TypeError: x is not a function")).toBe(false);
    expect(isIgnorableError("Error: Script error. while loading the zone")).toBe(false);
  });
});

describe("formatErrorReport", () => {
  const context = { version: "0.1.0", address: "/leeside/?lang=ko", userAgent: "TestBrowser/1", language: "ko", when: "2026-11-24T10:00:00.000Z" };

  it("puts the error after where and when it happened", () => {
    const text = formatErrorReport({ message: "Error: boom", stack: "Error: boom\n    at play (game.js:1:2)" }, context);
    expect(text.split("\n")).toEqual([
      "LEESIDE 0.1.0 error report",
      "When: 2026-11-24T10:00:00.000Z",
      "Address: /leeside/?lang=ko",
      "Language: ko",
      "Browser: TestBrowser/1",
      "",
      "Error: boom",
      "",
      "Error: boom",
      "    at play (game.js:1:2)",
    ]);
  });

  it("leaves the stack out when there is none or it only repeats the message", () => {
    expect(formatErrorReport({ message: "it broke" }, context).endsWith("\n\nit broke")).toBe(true);
    expect(formatErrorReport({ message: "it broke", stack: "it broke\n" }, context).endsWith("\n\nit broke")).toBe(true);
  });
});
