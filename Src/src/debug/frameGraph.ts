import { LONG_FRAME_MS, VERY_LONG_FRAME_MS } from "./frameStats";

/** Top of the graph's vertical scale. Longer frames are drawn at full height. */
export const GRAPH_SCALE_MS = VERY_LONG_FRAME_MS;
/** Horizontal guides: one frame at 60 fps and one at 30 fps. */
export const GRAPH_GUIDES_MS = [1000 / 60, 1000 / 30] as const;

export type FrameLevel = "ok" | "long" | "veryLong";

export interface GraphBar {
  /** Bar height in pixels, from 0 to the graph height. */
  height: number;
  level: FrameLevel;
}

/** Classifies a frame time with the same thresholds the long-frame counters use. */
export function frameLevel(frameMs: number): FrameLevel {
  if (frameMs > VERY_LONG_FRAME_MS) {
    return "veryLong";
  }
  return frameMs > LONG_FRAME_MS ? "long" : "ok";
}

/** Size and class of the bar for one frame. A frame that took any time is at least 1 px tall. */
export function graphBar(frameMs: number, graphHeight: number, scaleMs: number = GRAPH_SCALE_MS): GraphBar {
  const valid = Number.isFinite(frameMs) && frameMs > 0 && scaleMs > 0 && graphHeight > 0;
  const height = valid ? Math.min(graphHeight, Math.max(1, Math.round((frameMs / scaleMs) * graphHeight))) : 0;
  return { height, level: frameLevel(frameMs) };
}
