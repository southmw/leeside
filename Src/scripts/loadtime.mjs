// Measures how long a visitor waits before they can play (plan step 2.26): from opening the
// page of the built game to the START button, with nothing cached, at several line speeds.
// Run after a build: `npm run build && npm run loadtime`.
//
// The page is served from dist/ by Vite's preview server, which compresses text the way a
// static host does; "downloaded by then" is what had actually come over the line when START
// appeared (the wind's recording may still be on its way: it does not hold up the start).
// The browser is the one installed on this machine, without a window, so its graphics run in
// software: the part of the wait that is the machine's own work (starting the engine,
// building the zone) is longer here than on a screen. The part that is downloading is what
// this is for. Read the two apart with the line "unthrottled".
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { preview } from "vite";

/** The wait the design allows, on an ordinary broadband line (technical design 1). */
const TARGET_SECONDS = 10;
const START_TIMEOUT_MS = 180_000;

/** Line speeds to try: megabits a second down, and the delay of each request in milliseconds. */
const LINES = [
  { name: "unthrottled", mbps: 0, latencyMs: 0 },
  { name: "100 Mbps (fibre)", mbps: 100, latencyMs: 10 },
  { name: "20 Mbps (ordinary broadband)", mbps: 20, latencyMs: 30, judged: true },
  { name: "5 Mbps (slow line)", mbps: 5, latencyMs: 60 },
];

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const browserArgs = ["--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--ignore-gpu-blocklist"];

async function launchBrowser() {
  const wanted = process.env.SMOKE_BROWSER_CHANNEL;
  const channels = wanted ? [wanted] : ["msedge", "chrome"];
  for (const channel of channels) {
    try {
      return await chromium.launch({ channel, args: browserArgs });
    } catch {
      // Try the next one.
    }
  }
  throw new Error(`No installed browser found (tried ${channels.join(", ")}).`);
}

let server;
let browser;
let exitCode = 0;
try {
  server = await preview({ root, logLevel: "error", preview: { host: "127.0.0.1", port: 4173 } });
  const url = server.resolvedUrls?.local[0];
  if (!url) {
    throw new Error("The preview server did not report a local URL (is there a build in dist/?)");
  }
  browser = await launchBrowser();
  console.log(`\nTime to the START button (${url}, nothing cached)\n`);
  for (const line of LINES) {
    // A fresh context each time: nothing is cached from the run before.
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: "en-US" });
    const page = await context.newPage();
    const session = await context.newCDPSession(page);
    await session.send("Network.enable");
    await session.send("Network.setCacheDisabled", { cacheDisabled: true });
    if (line.mbps > 0) {
      const bytesPerSecond = (line.mbps * 1024 * 1024) / 8;
      await session.send("Network.emulateNetworkConditions", { offline: false, latency: line.latencyMs, downloadThroughput: bytesPerSecond, uploadThroughput: bytesPerSecond / 4 });
    }
    let bytes = 0;
    session.on("Network.loadingFinished", (event) => {
      bytes += event.encodedDataLength;
    });
    const began = Date.now();
    await page.goto(url, { waitUntil: "commit" });
    await page.locator("#title-start").waitFor({ state: "visible", timeout: START_TIMEOUT_MS });
    const seconds = (Date.now() - began) / 1000;
    const verdict = line.judged ? (seconds <= TARGET_SECONDS ? `  within ${TARGET_SECONDS} s` : `  OVER ${TARGET_SECONDS} s`) : "";
    console.log(`  ${line.name.padEnd(30)} ${seconds.toFixed(1).padStart(6)} s   ${(bytes / 1024 / 1024).toFixed(2)} MB downloaded by then${verdict}`);
    if (line.judged && seconds > TARGET_SECONDS) {
      exitCode = 1;
    }
    await context.close();
  }
  console.log(
    exitCode === 0
      ? `\nLoad time check passed (judged on the ordinary broadband line: ${TARGET_SECONDS} s).\n`
      : `\nLoad time check FAILED: longer than ${TARGET_SECONDS} s on the ordinary broadband line.\n`,
  );
} catch (error) {
  console.error(String(error?.stack ?? error));
  exitCode = 1;
} finally {
  await browser?.close();
  await new Promise((resolve) => (server ? server.httpServer.close(resolve) : resolve()));
}
process.exit(exitCode);
