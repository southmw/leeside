import type { Ui } from "./uiRoot";

/**
 * What the player sees while the zone changes (UI design 12): the picture goes dark, the
 * name of the zone they arrive in shows for a moment, and the picture comes back.
 */

const css = `
#zone-veil {
  position: fixed; inset: 0; z-index: 5; pointer-events: none; opacity: 0; background: #0d0c0a;
  display: flex; align-items: center; justify-content: center;
  transition: opacity var(--veil-fade, 0.35s) linear;
}
#zone-veil.shown { opacity: 1; }
#zone-veil .zone-veil-name { font-size: 2em; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #e8dcc0; }
`;

export interface ZoneVeil {
  /** Darkens the picture over `seconds`. */
  cover(seconds: number): void;
  /** Writes the name of the zone on the dark picture. */
  name(text: string): void;
  /** Brings the picture back over `seconds`; the name goes with the dark. */
  reveal(seconds: number): void;
}

export function createZoneVeil(ui: Ui): ZoneVeil {
  const style = document.createElement("style");
  style.textContent = css;
  document.head.append(style);

  const veil = document.createElement("div");
  veil.id = "zone-veil";
  const label = document.createElement("div");
  label.className = "zone-veil-name";
  veil.append(label);
  ui.root.append(veil);

  const fade = (seconds: number, shown: boolean): void => {
    veil.style.setProperty("--veil-fade", `${Math.max(seconds, 0)}s`);
    veil.classList.toggle("shown", shown);
  };
  return {
    cover(seconds): void {
      label.textContent = "";
      fade(seconds, true);
    },
    name(text): void {
      label.textContent = text;
    },
    reveal(seconds): void {
      fade(seconds, false);
    },
  };
}
