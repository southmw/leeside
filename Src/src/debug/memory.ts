/** `performance.memory` is a Chromium-only, non-standard extension. */
interface PerformanceWithMemory {
  memory?: { usedJSHeapSize?: number };
}

/**
 * JavaScript heap in use, in megabytes, or undefined where the browser does not report it
 * (Firefox, Safari). It covers script memory only, not GPU memory.
 */
export function readHeapMb(source: object = performance): number | undefined {
  const bytes = (source as PerformanceWithMemory).memory?.usedJSHeapSize;
  return typeof bytes === "number" && Number.isFinite(bytes) ? bytes / (1024 * 1024) : undefined;
}
