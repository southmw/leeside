/**
 * Text with a key in it, such as "[E] Search": the key is drawn as a small box (`.ui-key`).
 * Where the key goes in the sentence differs from language to language, so the sentence is
 * asked for with a mark in the key's place and the box is put there.
 */

/** Stands for the key in a sentence until the box takes its place. Not a character any text uses. */
export const KEY_MARK = "\uE000";

/** Writes `sentence` into `node`, with a box saying `key` where the sentence has `KEY_MARK`. */
export function setKeyText(node: HTMLElement, sentence: string, key: string): void {
  const [before = "", after = ""] = sentence.split(KEY_MARK);
  const box = document.createElement("span");
  box.className = "ui-key";
  box.textContent = key;
  node.replaceChildren(before, box, after);
}
