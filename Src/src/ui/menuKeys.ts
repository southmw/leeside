/**
 * Keyboard handling for windows with buttons (UI design 3.3), as plain logic: which key
 * does what, and how the selection moves.
 */

export type MenuAction = "next" | "previous" | "activate" | "close";

/** What a key press means in a window, or undefined if the window does not use the key. */
export function menuAction(code: string, shiftKey = false): MenuAction | undefined {
  switch (code) {
    case "ArrowDown":
    case "ArrowRight":
      return "next";
    case "ArrowUp":
    case "ArrowLeft":
      return "previous";
    case "Tab":
      return shiftKey ? "previous" : "next";
    case "Enter":
    case "NumpadEnter":
    case "Space":
      return "activate";
    case "Escape":
      return "close";
    default:
      return undefined;
  }
}

/**
 * The selected index after moving one step through `count` items. Moving past the last
 * item comes back to the first, and the other way round.
 */
export function moveSelection(current: number, count: number, action: "next" | "previous"): number {
  if (count <= 0) {
    return 0;
  }
  const step = action === "next" ? 1 : -1;
  return (((current + step) % count) + count) % count;
}
