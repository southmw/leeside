/**
 * Sizing rules for the UI (UI design 3.1), as plain arithmetic. The UI is designed at
 * 1920 x 1080 and scaled with the window's height, so it keeps its proportions.
 */

export const DESIGN_WIDTH = 1920;
export const DESIGN_HEIGHT = 1080;
/** Smallest window the game supports. Below it a notice asks for a bigger window. */
export const MIN_WIDTH = 1280;
export const MIN_HEIGHT = 720;
/** The UI stops growing here, so it does not become oversized on very tall screens. */
const MAX_SCALE = 2;

/** Factor to multiply design sizes by for a window of the given height. 1 at 1080 px high. */
export function uiScale(windowHeight: number): number {
  const min = MIN_HEIGHT / DESIGN_HEIGHT;
  if (!Number.isFinite(windowHeight)) {
    return 1;
  }
  return Math.min(Math.max(windowHeight / DESIGN_HEIGHT, min), MAX_SCALE);
}

/** Whether the window is smaller than the game supports. */
export function isWindowTooSmall(width: number, height: number): boolean {
  return width < MIN_WIDTH || height < MIN_HEIGHT;
}

/**
 * The part of the window the HUD may use: at most 16:9, centred. On an ultrawide screen the
 * HUD then stays in the middle instead of spreading to corners far out of sight.
 */
export function hudBounds(width: number, height: number): { left: number; width: number } {
  const widest = (height * DESIGN_WIDTH) / DESIGN_HEIGHT;
  const hudWidth = Math.min(width, widest);
  return { left: (width - hudWidth) / 2, width: hudWidth };
}
