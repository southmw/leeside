import bag from "./icons/bag.svg?raw";
import bandage from "./icons/bandage.svg?raw";
import cloth from "./icons/cloth.svg?raw";
import cold from "./icons/cold.svg?raw";
import health from "./icons/health.svg?raw";
import markerBag from "./icons/marker-bag.svg?raw";
import scrap from "./icons/scrap.svg?raw";
import shelter from "./icons/shelter.svg?raw";
import storm from "./icons/storm.svg?raw";
import tape from "./icons/tape.svg?raw";
import temperature from "./icons/temperature.svg?raw";
import thirst from "./icons/thirst.svg?raw";
import warning from "./icons/warning.svg?raw";
import waterBottle from "./icons/water-bottle.svg?raw";

/**
 * The game's icons (UI design 3.5), drawn in lines that take the colour of the text around
 * them. They are put into the page as SVG rather than loaded as pictures: a picture could
 * not follow the text colour. The originals are in DOC/icons; keep the two in step.
 */

const ICONS = { bag, bandage, cloth, cold, health, scrap, shelter, storm, tape, temperature, thirst, warning, "water-bottle": waterBottle, "marker-bag": markerBag } as const;

export type IconName = keyof typeof ICONS;

/** An icon as an element the size of the text it stands in (style it with `.ui-icon`). */
export function createIcon(name: IconName): HTMLElement {
  const icon = document.createElement("span");
  icon.className = "ui-icon";
  icon.dataset.icon = name;
  icon.setAttribute("aria-hidden", "true");
  icon.innerHTML = ICONS[name];
  return icon;
}

/** Swaps the picture of an icon element made by `createIcon`. */
export function setIcon(icon: HTMLElement, name: IconName): void {
  if (icon.dataset.icon !== name) {
    icon.dataset.icon = name;
    icon.innerHTML = ICONS[name];
  }
}
