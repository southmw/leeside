import type { Mouse } from "../input/mouse";
import type { I18n } from "../locales/i18n";

const css = `
#look-hint {
  position: fixed; left: 50%; bottom: 12%; transform: translateX(-50%); z-index: 10;
  padding: 8px 14px; border-radius: 4px; pointer-events: none;
  background: rgba(20, 19, 16, 0.75); color: #e8dcc0; font-size: 15px; white-space: nowrap;
}
#look-hint[hidden] { display: none; }
`;

/**
 * Tells the player to click before the mouse can turn the view. A stopgap: the title screen
 * (step 1.14) and the pause screen (step 2.21) take this role later.
 */
export function createLookHint(mouse: Mouse, i18n: I18n): void {
  const style = document.createElement("style");
  style.textContent = css;
  document.head.append(style);

  const hint = document.createElement("div");
  hint.id = "look-hint";
  document.body.append(hint);

  const refresh = (): void => {
    hint.textContent = i18n.t("hint.click_to_look");
    hint.hidden = mouse.locked;
  };
  mouse.onLockChange(refresh);
  i18n.onChange(refresh);
  refresh();
}
