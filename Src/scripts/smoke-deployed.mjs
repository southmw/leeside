// Smoke test of the game as visitors get it (plan step 2.27): the production build, either
// already online or served here from dist/.
//
//   npm run smoke:deployed -- https://southmw.github.io/leeside/    the address given
//   npm run smoke:deployed                                          dist/, after a build
//
// The production build has no debug object, so unlike scripts/smoke.mjs this one can only go
// by what is on screen: the title and START, the game after START with its clock running,
// the pause screen, the error screen, that the development tools are left out, and that no
// error was logged and no file failed to arrive. As there, the browser is one installed on
// this machine and draws in software: this says the game runs, not how fast.
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { preview } from "vite";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "test-results");
const screenshotPath = join(outDir, "smoke-deployed.png");
const errorScreenshotPath = join(outDir, "smoke-deployed-error.png");

const browserArgs = ["--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"];
/** Nothing is cached and the graphics run in software: the first load is the slow part. */
const START_TIMEOUT_MS = 180_000;
/** The message of the error raised on purpose at the end; it is not counted as a fault. */
const RAISED = "Raised by the deployed smoke test";
/** The forms for feedback are Google Forms (src/app/links.ts). */
const FEEDBACK_FORM = /^https:\/\/docs\.google\.com\/forms\/d\/e\/[\w-]+\/viewform\?usp=pp_url&entry\.\d+=([0-9a-f]{12})$/;
/** Where the play record is sent (src/app/recordUpload.ts): the address a form submits to. */
const RECORD_FORM = /^https:\/\/docs\.google\.com\/forms\/d\/e\/[\w-]+\/formResponse$/;

async function launchBrowser() {
  const channels = process.env.SMOKE_BROWSER_CHANNEL ? [process.env.SMOKE_BROWSER_CHANNEL] : ["msedge", "chrome"];
  const failures = [];
  for (const channel of channels) {
    try {
      return { browser: await chromium.launch({ channel, headless: true, args: browserArgs }), channel };
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

const given = process.argv[2];
let server;
let browser;
let exitCode = 0;
let target = given ?? "dist/";

try {
  let url = given;
  if (!url) {
    server = await preview({ root, logLevel: "error", preview: { host: "127.0.0.1", port: 4174 } });
    url = server.resolvedUrls?.local[0];
    if (!url) {
      throw new Error("The preview server did not report a local URL (is there a build in dist/?)");
    }
    target = `dist/ at ${url}`;
  }
  // A fixed language, so that the result does not depend on the machine's settings.
  const withQuery = (query) => `${url}${url.includes("?") ? "&" : "?"}${query}`;

  const launched = await launchBrowser();
  browser = launched.browser;
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: "en-US" });
  const page = await context.newPage();
  // The game pauses itself when its page loses the focus, and a test browser's window loses it
  // whenever something else on the machine takes it. This build does not listen to the mark the
  // other smoke test sets, so the browser is told to act as if the page always had the focus.
  const session = await context.newCDPSession(page);
  await session.send("Emulation.setFocusEmulationEnabled", { enabled: true }).catch(() => {});

  // The play record is sent to a form as the game goes. It is caught here and not let through:
  // a test run is not a game anyone played.
  const sentRecords = [];
  await context.route(/docs\.google\.com\/forms\/.*\/formResponse/, async (route) => {
    const fields = new URLSearchParams(route.request().postData() ?? "");
    sentRecords.push({ url: route.request().url(), method: route.request().method(), values: [...fields.values()] });
    await route.fulfill({ status: 200, contentType: "text/html", body: "" });
  });

  const faults = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes(RAISED)) {
      faults.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    if (!String(error).includes(RAISED)) {
      faults.push(String(error));
    }
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      faults.push(`HTTP ${response.status()} ${response.url()}`);
    }
  });
  page.on("requestfailed", (request) => faults.push(`failed ${request.url()} (${request.failure()?.errorText ?? "?"})`));

  const began = Date.now();
  await page.goto(withQuery("lang=en"), { waitUntil: "commit" });
  const startButton = page.locator("#title-start");
  const startShown = await startButton.waitFor({ state: "visible", timeout: START_TIMEOUT_MS }).then(() => true, () => false);
  const titleText = await page.locator("#title-screen").innerText().catch(() => "");
  check("the title comes up and START appears", startShown && titleText.includes("LEESIDE"), `${((Date.now() - began) / 1000).toFixed(1)} s`);

  // What is for development only must not be in this build.
  const devOnly = await page.evaluate(() => ({ debugObject: "__game" in window, devPanel: document.querySelector("#dev-open, #dev-panel") !== null }));
  check("the debug object and the development panel are left out", !devOnly.debugObject && !devOnly.devPanel, JSON.stringify(devOnly));

  if (startShown) {
    await startButton.click();
    const hud = page.locator("#hud");
    const playing = await hud.waitFor({ state: "visible", timeout: 30_000 }).then(() => true, () => false);
    const titleGone = (await page.locator("#title-screen").count()) === 0;
    const canvas = (await page.locator("canvas#game").count()) === 1;
    check("START begins the game", playing && titleGone && canvas, `hud ${playing}, title gone ${titleGone}, canvas ${canvas}`);

    // The clock on screen moves on: the simulation is running, not only the first frame drawn.
    const clockNow = () => page.locator("#hud-clock .hud-time").innerText().catch(() => "");
    const clockBefore = await clockNow();
    const moved = await page
      .waitForFunction((before) => (document.querySelector("#hud-clock .hud-time")?.textContent ?? "") !== before, clockBefore, { timeout: 30_000 })
      .then(() => true, () => false);
    check("the game's clock runs", clockBefore !== "" && moved, `${clockBefore} -> ${await clockNow()}`);

    // Something is drawn: a canvas that stayed blank would be one flat colour.
    await mkdir(outDir, { recursive: true });
    const shot = await page.screenshot({ path: screenshotPath });
    check("a screenshot was taken", shot.length > 20_000, `${(shot.length / 1024).toFixed(0)} KB, ${screenshotPath}`);

    // Escape pauses and offers the way on; the feedback button is there once an address is set.
    await page.keyboard.press("Escape");
    const paused = await page.locator("#pause-veil.shown").waitFor({ state: "attached", timeout: 10_000 }).then(() => true, () => false);
    const pauseButtons = await page.locator("#ui .ui-window .ui-button").allInnerTexts().catch(() => []);
    check("Escape pauses the game", paused && pauseButtons.length >= 4, pauseButtons.join(" / "));
    // The feedback button leads to the form in the game's language (English here), in a new tab.
    // The tab itself is not opened: what would be opened is caught.
    await page.evaluate(() => {
      window.__opened = [];
      window.open = (address) => {
        window.__opened.push(String(address));
        return null;
      };
    });
    await page.locator("#ui .ui-window .ui-button", { hasText: "Leave feedback" }).click({ timeout: 5_000 }).catch(() => {});
    const opened = await page.evaluate(() => window.__opened);
    const numberInForm = opened.length === 1 ? (FEEDBACK_FORM.exec(opened[0])?.[1] ?? "") : "";
    check("the pause screen's feedback button opens the form for feedback, with the game's number filled in", numberInForm !== "", opened.join(", ") || "nothing was opened");

    // The record was sent when the game began: to the form kept for it, under the same number.
    const first = sentRecords[0];
    let firstRecord = null;
    try {
      firstRecord = JSON.parse(first?.values[1] ?? "null");
    } catch {
      firstRecord = null;
    }
    check(
      "the game sends its play record when it begins, under the number the feedback form gets",
      sentRecords.length >= 1 && first.method === "POST" && RECORD_FORM.test(first.url) && first.values[0] === numberInForm && firstRecord?.id === numberInForm && firstRecord.version === 1,
      `${sentRecords.length} sent, game ${first?.values[0] ?? "-"}`,
    );
    await page.keyboard.press("Escape");
    const resumed = await page.locator("#pause-veil.shown").waitFor({ state: "detached", timeout: 10_000 }).then(() => true, () => false);
    check("Escape goes on with the game", resumed);

    // An error nothing handles brings up the error screen, and keys no longer reach the game.
    await page.evaluate((message) => {
      window.setTimeout(() => {
        throw new Error(message);
      });
    }, RAISED);
    const errorShown = await page.locator("#error-screen").waitFor({ state: "visible", timeout: 10_000 }).then(() => true, () => false);
    const errorText = await page.locator("#error-screen").innerText().catch(() => "");
    await page.screenshot({ path: errorScreenshotPath });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
    const pausedBehind = (await page.locator("#pause-veil.shown").count()) > 0;
    check(
      "an unhandled error brings up the error screen, which keeps the keys from the game",
      errorShown && errorText.includes(RAISED) && errorText.includes("Reload") && !pausedBehind,
      `shown ${errorShown}, paused behind ${pausedBehind}`,
    );
  }

  check("no errors were logged and every file arrived", faults.length === 0, faults.join(" | "));
} catch (error) {
  check("the test ran to completion", false, String(error?.stack ?? error));
} finally {
  await browser?.close();
  await new Promise((resolve) => (server ? server.httpServer.close(resolve) : resolve()));
}

console.log(`\nSmoke test of the production build (${target})`);
for (const { name, passed, detail } of results) {
  console.log(`  ${passed ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!passed) {
    exitCode = 1;
  }
}
console.log(exitCode === 0 ? "\nProduction smoke test passed.\n" : "\nProduction smoke test FAILED.\n");
process.exit(exitCode);
