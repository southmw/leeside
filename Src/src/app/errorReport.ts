/**
 * What to say about an error nothing handled (UI design 13), as plain logic: reading whatever
 * was thrown, telling apart the errors that are not the game's, and the text the player copies
 * to hand over. Nothing is sent anywhere.
 */

export interface ErrorDetails {
  /** One line: what went wrong. */
  message: string;
  /** Where, if the browser says. */
  stack?: string;
}

/** Where and when it happened; goes into the copied text beside the error itself. */
export interface ErrorContext {
  version: string;
  /** The page's address without its host: the path and the start conditions. */
  address: string;
  userAgent: string;
  language: string;
  /** ISO 8601. */
  when: string;
}

/** Anything can be thrown, not only an Error: this reads what there is. */
export function describeError(reason: unknown): ErrorDetails {
  if (reason instanceof Error) {
    const message = reason.message ? `${reason.name}: ${reason.message}` : reason.name;
    return reason.stack ? { message, stack: reason.stack } : { message };
  }
  if (typeof reason === "string") {
    return { message: reason || "Unknown error" };
  }
  if (reason === undefined || reason === null) {
    return { message: "Unknown error" };
  }
  try {
    return { message: JSON.stringify(reason) ?? String(reason) };
  } catch {
    return { message: String(reason) };
  }
}

/**
 * Errors known to have nothing to do with the game, which must not stop it:
 * - the browser's note that a ResizeObserver could not deliver everything in one frame;
 * - "Script error." without anything else, which is all a page is told about an error in a
 *   script from elsewhere (the game has none; browser extensions do).
 */
export function isIgnorableError(message: string): boolean {
  return message.includes("ResizeObserver loop") || /^(Error: )?Script error\.?$/.test(message.trim());
}

/** The text copied from the error screen. English throughout: it is read by whoever fixes it. */
export function formatErrorReport(details: ErrorDetails, context: ErrorContext): string {
  const lines = [
    `LEESIDE ${context.version} error report`,
    `When: ${context.when}`,
    `Address: ${context.address}`,
    `Language: ${context.language}`,
    `Browser: ${context.userAgent}`,
    "",
    details.message,
  ];
  // Browsers that begin the stack with the message would say it twice.
  if (details.stack && details.stack.trim() !== details.message) {
    lines.push("", details.stack.trim());
  }
  return lines.join("\n");
}
