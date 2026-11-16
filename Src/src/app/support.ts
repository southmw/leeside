import type { UnsupportedReason } from "./startFlow";

/** What is known about the device and browser, gathered by the caller. */
export interface Environment {
  userAgent: string;
  /** `navigator.maxTouchPoints`. */
  maxTouchPoints: number;
  /** Whether the main pointer is precise, like a mouse (`matchMedia("(pointer: fine)")`). */
  finePointer: boolean;
  /** Whether a WebGL 2 context can be created. */
  webgl2: boolean;
}

const MOBILE_USER_AGENT = /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle|Opera Mini|IEMobile/i;

/**
 * Whether the game can run here. Phones and tablets are not supported (the game needs a
 * keyboard and a mouse), and neither is a browser without WebGL 2.
 *
 * A tablet that reports a desktop user agent (iPadOS does) is recognised by having touch
 * input and no precise pointer. A laptop with a touch screen has a precise pointer and passes.
 */
export function checkSupport(environment: Environment): UnsupportedReason | undefined {
  const touchOnly = environment.maxTouchPoints > 0 && !environment.finePointer;
  if (MOBILE_USER_AGENT.test(environment.userAgent) || touchOnly) {
    return "mobile";
  }
  if (!environment.webgl2) {
    return "no_webgl";
  }
  return undefined;
}
