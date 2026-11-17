// Makes an image smaller, using the browser already installed on the machine (the same one
// the smoke test uses), so that no image library has to be installed for it.

import { readFileSync } from "node:fs";
import { chromium } from "playwright-core";

/** The PNG at `file`, scaled to `size` x `size` pixels, as the bytes of a new PNG. */
export async function resizePng(file, size) {
  const channels = process.env.SMOKE_BROWSER_CHANNEL ? [process.env.SMOKE_BROWSER_CHANNEL] : ["msedge", "chrome"];
  let browser;
  for (const channel of channels) {
    try {
      browser = await chromium.launch({ channel, headless: true });
      break;
    } catch {
      // Try the next browser.
    }
  }
  if (!browser) {
    throw new Error(`No usable browser found (tried ${channels.join(", ")}) to resize ${file}`);
  }
  try {
    const page = await browser.newPage();
    const source = `data:image/png;base64,${readFileSync(file).toString("base64")}`;
    const result = await page.evaluate(
      async ({ source, size }) => {
        const image = new Image();
        image.src = source;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext("2d");
        context.imageSmoothingQuality = "high";
        context.drawImage(image, 0, 0, size, size);
        return canvas.toDataURL("image/png");
      },
      { source, size },
    );
    return Buffer.from(result.slice(result.indexOf(",") + 1), "base64");
  } finally {
    await browser.close();
  }
}
