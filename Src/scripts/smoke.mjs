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
    check("physics world has the floor, the props and the player", first.bodyCount === 8, `${first.bodyCount} bodies`);
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

    // The character walks: forward is -Z, right is +X. Speed is not judged here, because a
    // headless browser may run the simulation slower than real time.
    const readPlayer = () => page.evaluate(() => ({ ...window.__game.player }));
    const startedAt = await readPlayer();
    await settle();
    const stoodStill = await readPlayer();
    check("the character stands still without input", Math.abs(stoodStill.x - startedAt.x) < 0.001 && Math.abs(stoodStill.z - startedAt.z) < 0.001);

    await page.keyboard.down("KeyS");
    await page.waitForTimeout(400);
    await page.keyboard.up("KeyS");
    const movedBack = await readPlayer();
    check("S walks the character back", movedBack.z > startedAt.z + 0.5 && Math.abs(movedBack.x - startedAt.x) < 0.01, `z ${startedAt.z.toFixed(2)} -> ${movedBack.z.toFixed(2)}`);

    await page.keyboard.down("KeyD");
    await page.waitForTimeout(400);
    await page.keyboard.up("KeyD");
    const movedRight = await readPlayer();
    check("D walks the character right", movedRight.x > movedBack.x + 0.5, `x ${movedBack.x.toFixed(2)} -> ${movedRight.x.toFixed(2)}`);
    check("the character stays on the ground", Math.abs(movedRight.y - startedAt.y) < 0.03, `y ${movedRight.y.toFixed(3)}`);

    // Jumping: the character leaves the ground, rises close to the jump height (1.1 m) and
    // lands where it started.
    const grounded = () => page.waitForFunction(() => window.__game.player.grounded, undefined, { timeout: 10_000 });
    await grounded();
    const groundY = await page.evaluate(() => window.__game.player.y);
    await page.evaluate(() => {
      window.__smokePeak = 0;
      window.__smokeTimer = setInterval(() => {
        window.__smokePeak = Math.max(window.__smokePeak, window.__game.player.y);
      }, 4);
    });
    await page.keyboard.down("Space");
    await settle();
    check("Space jumps", (await readInput()).jump === true);
    const airborne = await page.evaluate(() => !window.__game.player.grounded);
    await page.keyboard.up("Space");
    await page.waitForTimeout(300);
    await grounded();
    const jump = await page.evaluate((ground) => {
      clearInterval(window.__smokeTimer);
      return { peak: window.__smokePeak - ground, landedAt: window.__game.player.y - ground };
    }, groundY);
    check("the character leaves the ground when jumping", airborne);
    check("the jump rises about 1.1 m", jump.peak > 0.8 && jump.peak < 1.15, `peak ${jump.peak.toFixed(2)} m`);
    check("the character lands again", Math.abs(jump.landedAt) < 0.03, `${jump.landedAt.toFixed(3)} m above the start`);

    // Performance figures must be populated. Their values are not judged here: a headless
    // browser renders in software, so the numbers say nothing about real performance.
    const stats = await page.evaluate(() => ({ ...window.__game.stats }));
    check(
      "performance stats are populated",
      stats.samples > 0 && stats.fps > 0 && stats.frameMs > 0 && stats.drawCalls > 0 && stats.triangles > 0,
      `${stats.drawCalls} draw calls, ${stats.triangles} triangles, ${stats.samples} samples`,
    );

    const { sim, render } = stats.sections ?? {};
    check(
      "section timings are populated",
      sim?.avgMs >= 0 && sim?.maxMs > 0 && render?.avgMs > 0 && render?.maxMs >= render?.avgMs,
      `sim ${sim?.avgMs.toFixed(3)} ms, render ${render?.avgMs.toFixed(2)} ms per frame`,
    );
    // Edge and Chrome both report heap size; other browsers would leave it undefined.
    check("memory use is reported", stats.heapMb > 0, `${stats.heapMb?.toFixed(1)} MB`);

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

    // The frame graph must have something drawn on it.
    const paintedPixels = await page.evaluate(() => {
      const graph = document.querySelector("#debug-frame-graph");
      const data = graph?.getContext("2d")?.getImageData(0, 0, graph.width, graph.height).data ?? [];
      let painted = 0;
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] > 0) painted += 1;
      }
      return painted;
    });
    check("frame graph is drawn", paintedPixels > 0, `${paintedPixels} pixels`);
  }

  await mkdir(outDir, { recursive: true });
  await page.screenshot({ path: screenshotPath });
  check("screenshot saved", true, screenshotPath);

  // Camera: clicking locks the pointer, mouse movement turns the view, and walking follows it.
  {
    await page.goto(url, { waitUntil: "load" });
    await page.waitForFunction(() => window.__game?.ready === true, undefined, { timeout: 15_000 });
    const viewNow = () => page.evaluate(() => ({ ...window.__game.view }));
    const hint = page.locator("#look-hint");
    check("the click hint is shown before mouse look", await hint.isVisible());

    await page.mouse.click(640, 360);
    let locked = true;
    try {
      await page.waitForFunction(() => window.__game.view.locked, undefined, { timeout: 5_000 });
    } catch {
      locked = false;
    }
    check("clicking the game starts mouse look", locked && (await hint.isHidden()));

    if (locked) {
      // 400 px to the right at the default sensitivity is 1 radian: a turn to the right.
      await page.mouse.move(640, 360);
      await page.mouse.move(1040, 360, { steps: 8 });
      await page.waitForTimeout(200);
      const turned = await viewNow();
      check("moving the mouse right turns the view right", turned.yaw < -0.5 && turned.yaw > -1.5, `yaw ${turned.yaw.toFixed(2)} rad`);

      await page.mouse.move(1040, 3000, { steps: 8 });
      await page.waitForTimeout(200);
      const lookedDown = await viewNow();
      check(
        "looking down stops at the limit",
        Math.abs(lookedDown.pitch + Math.PI / 3) < 0.01,
        `pitch ${((lookedDown.pitch * 180) / Math.PI).toFixed(1)} degrees`,
      );

      // Facing right of -Z, forward must now carry the character towards +X as well.
      const before = await page.evaluate(() => ({ ...window.__game.player }));
      await page.keyboard.down("KeyW");
      await page.waitForTimeout(400);
      await page.keyboard.up("KeyW");
      const after = await page.evaluate(() => ({ ...window.__game.player }));
      check(
        "W walks where the view faces",
        after.x > before.x + 0.3 && after.z < before.z - 0.1,
        `moved ${(after.x - before.x).toFixed(2)}, ${(after.z - before.z).toFixed(2)}`,
      );
    }
  }

  // Obstacles: from a fresh start, walking forward runs into the box, and pushing into it at
  // an angle slides past it. The box's near face is at z = -3.25 and the capsule's radius is
  // 0.35, so a blocked character stops with its centre near z = -2.9.
  {
    await page.goto(url, { waitUntil: "load" });
    await page.waitForFunction(() => window.__game?.ready === true, undefined, { timeout: 15_000 });
    const playerNow = () => page.evaluate(() => ({ ...window.__game.player }));
    // Let the box land first.
    await page.waitForFunction(() => window.__game.simSeconds > 2, undefined, { timeout: 15_000 });

    await page.keyboard.down("KeyW");
    await page.waitForFunction(() => window.__game.simSeconds > 5, undefined, { timeout: 30_000 });
    const blocked = await playerNow();
    check(
      "the box blocks the character",
      blocked.z < -2.7 && blocked.z > -3.0 && Math.abs(blocked.x) < 0.05,
      `stopped at x ${blocked.x.toFixed(2)}, z ${blocked.z.toFixed(2)}`,
    );

    await page.keyboard.down("KeyD");
    await page.waitForFunction(() => window.__game.simSeconds > 6.5, undefined, { timeout: 30_000 });
    await page.keyboard.up("KeyD");
    await page.keyboard.up("KeyW");
    const slid = await playerNow();
    check(
      "pushing at an angle slides past the box",
      slid.x > 1.1 && slid.z < -3.5,
      `reached x ${slid.x.toFixed(2)}, z ${slid.z.toFixed(2)}`,
    );

    // Opening the context menu swallows the key-up, which would leave the key stuck down.
    await page.waitForTimeout(200);
    // dispatchEvent returns false when a listener cancelled the event.
    const menuShown = await page.evaluate(() =>
      document.querySelector("canvas#game").dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })),
    );
    check("the context menu is suppressed over the game", !menuShown);
  }

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
