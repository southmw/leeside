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
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

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

  await mkdir(outDir, { recursive: true });
  await page.screenshot({ path: screenshotPath });
  check("screenshot saved", true, screenshotPath);

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
