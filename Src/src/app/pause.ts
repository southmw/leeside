/**
 * Pausing (UI design 10), as plain logic: when the game may be paused, and whether the
 * simulation runs. Paused, nothing in the game moves on: not the clock, not the weather, not
 * thirst. The screen that goes with it is ui/pauseScreen.ts.
 */

/** What decides whether the game can be paused right now. */
export interface PauseSituation {
  /** Whether the player is in control: not behind the title, not in a measurement. */
  playing: boolean;
  /** Whether a window is open. Escape then closes that window instead. */
  windowOpen: boolean;
  /** Whether the picture is dark for a change of zone. */
  travelling: boolean;
  paused: boolean;
}

/** Whether Escape, or the page losing the player's attention, pauses the game now. */
export function canPause(situation: PauseSituation): boolean {
  return situation.playing && !situation.paused && !situation.windowOpen && !situation.travelling;
}

/**
 * Whether the page losing focus or being hidden pauses the game. Unlike Escape this also
 * holds while a side window (the bag) is open: whoever has looked away is not playing.
 */
export function shouldPauseOnLeave(situation: Omit<PauseSituation, "windowOpen"> & { centreWindowOpen: boolean }): boolean {
  return situation.playing && !situation.paused && !situation.centreWindowOpen && !situation.travelling;
}

/** Whether the simulation is stepped: only in play (or behind the title, where it idles), and not while paused. */
export function simulationRuns(paused: boolean): boolean {
  return !paused;
}

/** The keys shown on the controls screen, in order: text key of what each does, and the keys' names. */
export const CONTROLS = [
  { action: "controls.move", keys: ["W", "A", "S", "D"] },
  { action: "controls.look", keys: ["controls.key.mouse_drag"] },
  { action: "controls.zoom", keys: ["controls.key.wheel"] },
  { action: "controls.jump", keys: ["Space"] },
  { action: "controls.interact", keys: ["E"] },
  { action: "controls.take_all", keys: ["F"] },
  { action: "controls.quick", keys: ["1", "2", "3", "4"] },
  { action: "controls.bag", keys: ["Tab"] },
  { action: "controls.use", keys: ["Enter"] },
  { action: "controls.discard", keys: ["X"] },
  { action: "controls.pause", keys: ["Esc"] },
] as const;
