/**
 * A ring that fills clockwise from the top, for something done by holding a key (UI design 5).
 * Drawn as the stroke of a circle whose circumference is 100 units, so the filled part is
 * simply the fraction times 100.
 */

const SVG = "http://www.w3.org/2000/svg";
/** Radius that makes the circumference 100 in the 36-unit box. */
const RADIUS = 100 / (2 * Math.PI);

export interface ProgressRing {
  readonly element: HTMLElement;
  /** Sets how full the ring is, 0 to 1. At 0 nothing is drawn. */
  set(fraction: number): void;
}

/** The part of the ring to fill for `fraction`, 0 to 100; anything outside 0 to 1 is brought within. */
export function ringFill(fraction: number): number {
  return Number.isFinite(fraction) ? Math.min(Math.max(fraction, 0), 1) * 100 : 0;
}

export function createProgressRing(): ProgressRing {
  const element = document.createElement("span");
  element.className = "ui-ring";
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", "0 0 36 36");
  svg.style.cssText = "display: block; width: 100%; height: 100%;";
  const circle = (opacity: string): SVGCircleElement => {
    const node = document.createElementNS(SVG, "circle");
    node.setAttribute("cx", "18");
    node.setAttribute("cy", "18");
    node.setAttribute("r", String(RADIUS));
    node.setAttribute("fill", "none");
    node.setAttribute("stroke", "currentColor");
    node.setAttribute("stroke-width", "3");
    node.setAttribute("stroke-opacity", opacity);
    // The stroke starts at three o'clock; a quarter turn back puts the start at the top.
    node.setAttribute("transform", "rotate(-90 18 18)");
    return node;
  };
  const track = circle("0.25");
  const fill = circle("1");
  svg.append(track, fill);
  element.append(svg);

  let shown = -1;
  const set = (fraction: number): void => {
    const filled = ringFill(fraction);
    if (filled === shown) {
      return;
    }
    shown = filled;
    element.hidden = filled === 0;
    fill.setAttribute("stroke-dasharray", `${filled.toFixed(1)} 100`);
  };
  set(0);
  return { element, set };
}
