import { clamp } from "../core/math";
import { CAMERA_ZOOM_FACTOR, CAMERA_ZOOM_MAX, CAMERA_ZOOM_MIN } from "../data/tuning";

/**
 * Camera distance chosen with the mouse wheel. Rolling the wheel forward (negative notches)
 * brings the camera closer, rolling it back moves it away, within fixed limits. Each notch
 * changes the distance by a ratio, so one notch is a small step up close and a large one far out.
 */
export function applyZoom(
  distance: number,
  notches: number,
  factor: number = CAMERA_ZOOM_FACTOR,
  min: number = CAMERA_ZOOM_MIN,
  max: number = CAMERA_ZOOM_MAX,
): number {
  return clamp(distance * factor ** notches, min, max);
}
