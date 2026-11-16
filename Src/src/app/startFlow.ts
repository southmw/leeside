/**
 * The steps from opening the page to playing, as a small state machine with no side effects:
 * loading (with progress) -> ready (START can be pressed) -> playing.
 */

export type StartFlowState =
  | { phase: "loading"; done: number; total: number }
  | { phase: "ready" }
  | { phase: "playing" }
  /** The game cannot run here: a phone or tablet, or a browser without the 3D graphics it needs. */
  | { phase: "unsupported"; reason: UnsupportedReason }
  /** Loading failed; `message` says what went wrong. */
  | { phase: "failed"; message: string };

export type UnsupportedReason = "mobile" | "no_webgl";

export type StartFlowEvent =
  /** One more part of loading has finished. */
  | { type: "step_done" }
  /** Everything is loaded and the first frame is on screen. */
  | { type: "loaded" }
  /** The player pressed START. */
  | { type: "start" }
  | { type: "unsupported"; reason: UnsupportedReason }
  | { type: "failed"; message: string };

export function initialStartFlow(totalSteps: number): StartFlowState {
  return { phase: "loading", done: 0, total: Math.max(1, totalSteps) };
}

/** The state after an event. Events that make no sense in the current state change nothing. */
export function advanceStartFlow(state: StartFlowState, event: StartFlowEvent): StartFlowState {
  switch (event.type) {
    case "step_done":
      return state.phase === "loading" ? { ...state, done: Math.min(state.done + 1, state.total) } : state;
    case "loaded":
      return state.phase === "loading" ? { phase: "ready" } : state;
    case "start":
      return state.phase === "ready" ? { phase: "playing" } : state;
    case "unsupported":
      return state.phase === "playing" ? state : { phase: "unsupported", reason: event.reason };
    case "failed":
      return state.phase === "loading" ? { phase: "failed", message: event.message } : state;
  }
}

/** How full the loading bar is, from 0 to 1. Full once loading is over. */
export function loadingFraction(state: StartFlowState): number {
  return state.phase === "loading" ? state.done / state.total : 1;
}

/** Whether pressing START does anything now. */
export function canStart(state: StartFlowState): boolean {
  return state.phase === "ready";
}
