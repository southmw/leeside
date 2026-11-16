// Smoke test: starts the dev server, opens the game in a real (headless) browser and checks
// that it runs without errors. It verifies state, not looks or performance — a headless
// browser renders in software, so frame rates and exact colours are not meaningful here.
//
// Uses a browser already installed on the machine (Edge or Chrome) instead of downloading one.
// Override with SMOKE_BROWSER_CHANNEL=chrome (or msedge).

import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { createServer } from "vite";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "test-results");
const screenshotPath = join(outDir, "smoke.png");

// Software WebGL, so the test also works on machines and CI runners without a GPU.
const browserArgs = ["--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--ignore-gpu-blocklist"];

async function launchBrowser() {
  const channels = process.env.SMOKE_BROWSER_CHANNEL
    ? [process.env.SMOKE_BROWSER_CHANNEL]
    : ["msedge", "chrome"];
  const failures = [];
  for (const channel of channels) {
    try {
      const browser = await chromium.launch({ channel, headless: true, args: browserArgs });
      return { browser, channel };
    } catch (error) {
      failures.push(`${channel}: ${String(error.message).split("\n")[0]}`);
    }
  }
  throw new Error(`No usable browser found (tried ${channels.join(", ")}).\n${failures.join("\n")}`);
}

const results = [];
function check(name, passed, detail = "") {
  results.push({ name, passed, detail });
}

let server;
let browser;
let exitCode = 0;

try {
  server = await createServer({ root, logLevel: "error", server: { host: "127.0.0.1" } });
  await server.listen();
  const url = server.resolvedUrls?.local[0];
  if (!url) {
    throw new Error("Dev server did not report a local URL");
  }

  const launched = await launchBrowser();
  browser = launched.browser;
  // A fixed browser language, so the result does not depend on the machine's settings.
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, locale: "en-US" });

  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => consoleErrors.push(String(error)));
  // Name the URL of any failed request; the console message alone does not say which file it was.
  page.on("response", (response) => {
    if (response.status() >= 400) {
      consoleErrors.push(`HTTP ${response.status()} ${response.url()}`);
    }
  });

  await page.goto(url, { waitUntil: "load" });

  // The game sets `ready` after its first rendered frame.
  let ready = true;
  try {
    await page.waitForFunction(() => window.__game?.ready === true, undefined, { timeout: 15_000 });
  } catch {
    ready = false;
  }
  check("debug object exists and game is ready", ready);

  const hasCanvas = (await page.locator("canvas#game").count()) === 1;
  check("canvas exists", hasCanvas);

  if (ready) {
    const first = await page.evaluate(() => ({ ...window.__game, canvas: { ...window.__game.canvas } }));
    await page.waitForTimeout(500);
    const later = await page.evaluate(() => ({ frame: window.__game.frame, tick: window.__game.tick }));

    check("frames keep rendering", later.frame > first.frame, `frame ${first.frame} -> ${later.frame}`);
    check("simulation keeps stepping", later.tick > first.tick, `tick ${first.tick} -> ${later.tick}`);
    check("world has entities", first.entityCount >= 1, `${first.entityCount} entities`);
    check(
      "drawing buffer matches the window",
      first.canvas.width >= 1280 && first.canvas.height >= 720,
      `${first.canvas.width}x${first.canvas.height}`,
    );
  }

  if (ready) {
    // Keyboard input must reach the local player's actions.
    const readInput = () => page.evaluate(() => ({ ...window.__game.input }));
    const settle = () => page.waitForTimeout(150);

    await page.keyboard.down("KeyW");
    await settle();
    const forward = await readInput();
    check("W moves forward", forward.moveY === 1 && forward.moveX === 0, JSON.stringify([forward.moveX, forward.moveY]));

    await page.keyboard.down("KeyD");
    await settle();
    const diagonal = await readInput();
    const diagonalLength = Math.hypot(diagonal.moveX, diagonal.moveY);
    check(
      "W+D is diagonal with length 1",
      diagonal.moveX > 0 && diagonal.moveY > 0 && Math.abs(diagonalLength - 1) < 1e-6,
      `length ${diagonalLength.toFixed(4)}`,
    );

    await page.keyboard.up("KeyW");
    await page.keyboard.up("KeyD");
    await settle();
    const released = await readInput();
    check("releasing keys stops movement", released.moveX === 0 && released.moveY === 0);

    await page.keyboard.down("Space");
    await settle();
    check("Space jumps", (await readInput()).jump === true);
    await page.keyboard.up("Space");

    // Performance figures must be populated. Their values are not judged here: a headless
    // browser renders in software, so the numbers say nothing about real performance.
    const stats = await page.evaluate(() => ({ ...window.__game.stats }));
    check(
      "performance stats are populated",
      stats.samples > 0 && stats.fps > 0 && stats.frameMs > 0 && stats.drawCalls > 0 && stats.triangles > 0,
      `${stats.drawCalls} draw calls, ${stats.triangles} triangles, ${stats.samples} samples`,
    );

    // F3 toggles the debug overlay.
    const overlay = page.locator("#debug-overlay");
    await overlay.waitFor({ state: "attached", timeout: 5_000 });
    const hiddenAtStart = await overlay.isHidden();
    await page.keyboard.press("F3");
    await page.waitForTimeout(600);
    const text = (await overlay.isVisible()) ? await overlay.innerText() : "";
    check(
      "F3 shows the debug overlay",
      hiddenAtStart && text.includes("FPS") && text.includes("Draw calls"),
      text ? `${text.split("\n").length} lines` : "overlay not visible",
    );
  }

  await mkdir(outDir, { recursive: true });
  await page.screenshot({ path: screenshotPath });
  check("screenshot saved", true, screenshotPath);

  // Screen text follows `?lang`, and without it the browser's language.
  const overlayTextFor = async (targetPage, query) => {
    await targetPage.goto(`${url}${query}`, { waitUntil: "load" });
    await targetPage.waitForFunction(() => window.__game?.ready === true, undefined, { timeout: 15_000 });
    const panel = targetPage.locator("#debug-overlay");
    await panel.waitFor({ state: "visible", timeout: 5_000 });
    await targetPage.waitForFunction(() => document.querySelector("#debug-overlay")?.textContent !== "");
    return {
      text: await panel.innerText(),
      language: await targetPage.evaluate(() => window.__game.language),
      htmlLang: await targetPage.evaluate(() => document.documentElement.lang),
    };
  };

  const korean = await overlayTextFor(page, "?debug&lang=ko");
  check(
    "?lang=ko shows Korean text",
    korean.language === "ko" && korean.htmlLang === "ko" && korean.text.includes("드로우콜") && !korean.text.includes("Draw calls"),
    `language ${korean.language}`,
  );

  const english = await overlayTextFor(page, "?debug&lang=en");
  check(
    "?lang=en shows English text",
    english.language === "en" && english.htmlLang === "en" && english.text.includes("Draw calls") && !english.text.includes("드로우콜"),
    `language ${english.language}`,
  );

  const koreanBrowser = await browser.newPage({ locale: "ko-KR" });
  const detected = await overlayTextFor(koreanBrowser, "?debug");
  check("a Korean browser starts in Korean", detected.language === "ko" && detected.text.includes("드로우콜"), `language ${detected.language}`);
  const overridden = await overlayTextFor(koreanBrowser, "?debug&lang=en");
  check("?lang overrides the browser language", overridden.language === "en", `language ${overridden.language}`);
  await koreanBrowser.close();

  check("no console errors", consoleErrors.length === 0, consoleErrors.join(" | "));

  console.log(`\nSmoke test (${launched.channel}, ${url})`);
} catch (error) {
  check("smoke test ran to completion", false, String(error?.stack ?? error));
} finally {
  await browser?.close();
  await server?.close();
}

for (const { name, passed, detail } of results) {
  console.log(`  ${passed ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!passed) {
    exitCode = 1;
  }
}
console.log(exitCode === 0 ? "\nSmoke test passed.\n" : "\nSmoke test FAILED.\n");
process.exit(exitCode);
