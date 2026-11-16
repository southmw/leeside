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
 * Tells the player how to turn the view, until they have done it once. A stopgap: the
 * introduction (step 2.23) explains the controls later.
 */
export function createLookHint(mouse: Mouse, i18n: I18n): void {
  const style = document.createElement("style");
  style.textContent = css;
  document.head.append(style);

  const hint = document.createElement("div");
  hint.id = "look-hint";
  document.body.append(hint);

  let learned = false;
  const refresh = (): void => {
    hint.textContent = i18n.t("hint.drag_to_look");
    hint.hidden = learned;
  };
  mouse.onLookChange((looking) => {
    learned ||= looking;
    refresh();
  });
  i18n.onChange(refresh);
  refresh();
}
