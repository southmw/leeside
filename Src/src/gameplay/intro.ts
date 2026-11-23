/**
 * The introduction (prototype design 5.4): the first two minutes, in which a storm is on its
 * way and the player is led from the start to the cars, into house A and down to the shelter.
 * This is the plain logic: which step the player is at, what to tell them, and how long they
 * are protected. It only watches; nothing here makes the player do anything.
 */

/** How long the introduction keeps health from falling below the floor, in seconds of play. */
export const INTRO_PROTECTION_SECONDS = 120;
/** Health does not fall below this while the introduction protects. */
export const INTRO_HEALTH_FLOOR = 30;
/** The first step ends once the player has moved this far (metres) or this long has passed (seconds). */
export const INTRO_LOOK_METRES = 6;
export const INTRO_LOOK_SECONDS = 15;
/** From this far along the storm's approach (0 to 1) the player is told to take shelter, whatever they are doing. */
export const INTRO_FLEE_APPROACH = 0.55;
/** How long the tip about quick slots stays, in seconds. */
export const INTRO_TIP_SECONDS = 12;

/**
 * The steps, in order: look round and move; search the cars; get to house A before the storm;
 * go down the hatch; and done, once the player is in the shelter.
 */
export const INTRO_STEPS = ["look", "search", "shelter", "hatch", "done"] as const;
export type IntroStep = (typeof INTRO_STEPS)[number];

/** Plain data. */
export interface IntroState {
  step: IntroStep;
  /** Seconds of play since the introduction began. */
  seconds: number;
  /** Metres moved since it began. */
  moved: number;
  /** Seconds the tip about quick slots still shows; and whether it has been given. */
  tipSeconds: number;
  tipGiven: boolean;
}

export function createIntro(skip = false): IntroState {
  return { step: skip ? "done" : "look", seconds: 0, moved: 0, tipSeconds: 0, tipGiven: skip };
}

/** What the introduction goes by, each step. */
export interface IntroFacts {
  /** Metres the player has moved in this step of the simulation. */
  movedNow: number;
  /** Whether the trunk the introduction leads to has been opened. */
  trunkSearched: boolean;
  /** How near the storm has come, 0 to 1, and whether it is blowing. */
  stormApproach: number;
  stormHere: boolean;
  /** Whether the player is inside a building that gives shelter, out in the riverbed. */
  indoors: boolean;
  /** Whether the player is down in the shelter. */
  inShelter: boolean;
  /** Whether the player carries something that could go on a quick slot, and has nothing on one. */
  couldUseQuickSlot: boolean;
}

/** Moves the introduction on by `dt` seconds of play. Steps are never gone back to. */
export function stepIntro(intro: IntroState, facts: IntroFacts, dt: number): void {
  if (intro.step === "done") {
    return;
  }
  intro.seconds += Math.max(dt, 0);
  intro.moved += Math.max(facts.movedNow, 0);
  intro.tipSeconds = Math.max(intro.tipSeconds - Math.max(dt, 0), 0);
  if (!intro.tipGiven && facts.couldUseQuickSlot) {
    intro.tipGiven = true;
    intro.tipSeconds = INTRO_TIP_SECONDS;
  }
  if (facts.inShelter) {
    intro.step = "done";
    return;
  }
  if (intro.step === "look" && (intro.moved >= INTRO_LOOK_METRES || intro.seconds >= INTRO_LOOK_SECONDS)) {
    intro.step = "search";
  }
  // The storm does not wait for the search: once it is near, shelter is all that matters.
  if (intro.step === "search" && (facts.trunkSearched || facts.stormApproach >= INTRO_FLEE_APPROACH || facts.stormHere)) {
    intro.step = "shelter";
  }
  if ((intro.step === "shelter" || intro.step === "search" || intro.step === "look") && facts.indoors) {
    intro.step = "hatch";
  }
}

/** What to tell the player now: the tip while it shows, else the step's own line; null when there is nothing to say. */
export type IntroGuide = "look" | "search" | "shelter" | "hatch" | "quick";

export function introGuide(intro: IntroState): IntroGuide | null {
  if (intro.step === "done") {
    return null;
  }
  // Not over the call to take shelter: that one must not be missed.
  if (intro.tipSeconds > 0 && intro.step !== "shelter") {
    return "quick";
  }
  return intro.step;
}

/** Whether the introduction is still keeping the player alive. */
export function introProtects(intro: IntroState): boolean {
  return intro.step !== "done" && intro.seconds < INTRO_PROTECTION_SECONDS;
}

/** Health after the introduction's protection: not below the floor, unless it was below before. */
export function protectedHealth(health: number, before: number, protects: boolean): number {
  if (!protects) {
    return health;
  }
  return Math.max(health, Math.min(before, INTRO_HEALTH_FLOOR));
}
