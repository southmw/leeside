/** Pure viewport calculations, kept free of Three.js so they can be unit tested. */

/** Upper bound for the device pixel ratio. Higher values cost a lot of fill rate for little gain. */
export const MAX_PIXEL_RATIO = 2;

export interface Viewport {
  width: number;
  height: number;
  aspect: number;
  pixelRatio: number;
}

/** Caps the device pixel ratio and guards against missing or invalid values. */
export function computePixelRatio(devicePixelRatio: number, max: number = MAX_PIXEL_RATIO): number {
  if (!Number.isFinite(devicePixelRatio) || devicePixelRatio <= 0) {
    return 1;
  }
  return Math.min(devicePixelRatio, max);
}

/**
 * Describes the drawable area for a window of the given size.
 * A minimised or hidden window can report a size of 0, so both sides are kept at 1 or more.
 */
export function computeViewport(
  windowWidth: number,
  windowHeight: number,
  devicePixelRatio: number,
  maxPixelRatio: number = MAX_PIXEL_RATIO,
): Viewport {
  const width = Math.max(1, Math.floor(windowWidth));
  const height = Math.max(1, Math.floor(windowHeight));
  return {
    width,
    height,
    aspect: width / height,
    pixelRatio: computePixelRatio(devicePixelRatio, maxPixelRatio),
  };
}
