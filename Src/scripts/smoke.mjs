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

  // Most checks go straight into the game; the title screen has its own check further down.
  const gameUrl = (query = "") => `${url}?skipTitle${query ? `&${query.replace(/^\?/, "")}` : ""}`;

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

  await page.goto(gameUrl(), { waitUntil: "load" });

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
    // Terrain, 7 boxes for each of the 3 houses, 9 props, 4 boundary walls, the larger rocks and the player.
    check("physics world has the zone's colliders and the player", first.bodyCount > 1 + 21 + 9 + 4 + 1, `${first.bodyCount} bodies`);
    const zoneInfo = await page.evaluate(() => ({ ...window.__game.zone }));
    check(
      "the zone is loaded with its buildings",
      zoneInfo.id === "dry_riverbed" && zoneInfo.buildings === 3 && zoneInfo.props === 9 && zoneInfo.rocks > 1000,
      `${zoneInfo.id}, ${zoneInfo.buildings} buildings, ${zoneInfo.props} props, ${zoneInfo.rocks} rocks`,
    );
    // The four cars are drawn with models; the other props are still boxes.
    check("the cars are drawn with models", zoneInfo.propModels === 4, `${zoneInfo.propModels} of ${zoneInfo.props} props`);
    check(
      "drawing buffer matches the window",
      first.canvas.width >= 1280 && first.canvas.height >= 720,
      `${first.canvas.width}x${first.canvas.height}`,
    );
  }

  if (ready) {
    // Keyboard input must reach the local player's actions.
    const readInput = () => page.evaluate(() => ({ ...window.__game.input }));
    // Waits until the simulation has run a few steps, so a key press has certainly been read.
    // A fixed pause is not enough: a headless browser can take longer than that for one frame.
    const settle = async () => {
      const tick = await page.evaluate(() => window.__game.tick);
      await page.waitForFunction((from) => window.__game.tick >= from + 3, tick, { timeout: 10_000 });
    };

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
    // The capsule's centre rides 0.92 m above the terrain (half its height plus the skin).
    const clearance = movedRight.y - movedRight.groundHeight;
    check(
      "the character follows the terrain",
      movedRight.grounded && Math.abs(clearance - 0.92) < 0.1,
      `${clearance.toFixed(3)} m above terrain at height ${movedRight.groundHeight.toFixed(2)}`,
    );

    // The character model is there from the first frame, and its animation follows the movement.
    const modelAtStart = await page.evaluate(() => window.__game.player.model);
    const modelLoaded = modelAtStart === "model";
    check("the character model is loaded before the game starts", modelLoaded, modelAtStart);
    const animationNow = () => page.evaluate(() => window.__game.player.animation);
    if (modelLoaded) {
      // The keys of the previous check were only just released; give the animation a moment.
      await page.waitForTimeout(400);
      const standing = await animationNow();
      await page.keyboard.down("KeyA");
      await page.waitForTimeout(300);
      const running = await animationNow();
      await page.keyboard.up("KeyA");
      await page.waitForTimeout(300);
      const stopped = await animationNow();
      check(
        "the model idles when standing and runs when moving",
        standing === "idle" && running === "run" && stopped === "idle",
        `${standing} -> ${running} -> ${stopped}`,
      );
    }

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
    const jumpAnimation = await animationNow();
    await page.keyboard.up("Space");
    await page.waitForTimeout(300);
    await grounded();
    const jump = await page.evaluate((ground) => {
      clearInterval(window.__smokeTimer);
      return { peak: window.__smokePeak - ground, landedAt: window.__game.player.y - ground };
    }, groundY);
    check("the character leaves the ground when jumping", airborne);
    if (modelLoaded) {
      const landedAnimation = await animationNow();
      check(
        "the model plays the jump animation in the air and stops on landing",
        jumpAnimation === "jump" && landedAnimation === "idle",
        `${jumpAnimation} -> ${landedAnimation}`,
      );
    }
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

  // Camera: the view turns while a mouse button is held and the mouse moves, and walking follows it.
  {
    await page.goto(gameUrl(), { waitUntil: "load" });
    await page.waitForFunction(() => window.__game?.ready === true, undefined, { timeout: 15_000 });
    const viewNow = () => page.evaluate(() => ({ ...window.__game.view }));
    const hint = page.locator("#look-hint");
    check("the look hint is shown at first", await hint.isVisible());

    // The wheel zooms even before the click, as long as the pointer is over the game.
    await page.mouse.move(640, 360);
    for (let i = 0; i < 30; i += 1) {
      await page.mouse.wheel(0, 100);
    }
    await page.waitForTimeout(1500);
    const farOut = await page.evaluate(() => ({ ...window.__game.camera }));
    check(
      "the wheel zooms without mouse look, out to 20 m",
      farOut.wantedDistance === 20 && Math.abs(farOut.distance - 20) < 0.05,
      `wanted ${farOut.wantedDistance.toFixed(2)} m, now ${farOut.distance.toFixed(2)} m`,
    );
    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() => window.__game?.ready === true, undefined, { timeout: 15_000 });

    // Moving the mouse without a button held must not turn the view.
    const beforeHover = await viewNow();
    await page.mouse.move(640, 360);
    await page.mouse.move(900, 500, { steps: 5 });
    await page.waitForTimeout(200);
    const afterHover = await viewNow();
    check(
      "moving the mouse without a button held does not turn the view",
      afterHover.yaw === beforeHover.yaw && afterHover.pitch === beforeHover.pitch && !afterHover.looking,
    );

    await page.mouse.move(640, 360);
    await page.mouse.down();
    let locked = true;
    try {
      await page.waitForFunction(() => window.__game.view.looking, undefined, { timeout: 5_000 });
    } catch {
      locked = false;
    }
    check("holding a mouse button starts mouse look", locked && (await hint.isHidden()));

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

      // Looking up swings the camera down towards the ground, which must stop it: the camera
      // comes closer instead of going under the floor, and moves back out afterwards.
      const cameraNow = () => page.evaluate(() => ({ ...window.__game.camera }));
      await page.mouse.move(1040, -3000, { steps: 8 });
      await page.waitForTimeout(300);
      const lookingUp = await cameraNow();
      check(
        "the ground stops the camera when looking up",
        lookingUp.distance < 3 && lookingUp.y > (await page.evaluate(() => window.__game.player.groundHeight)) - 0.5,
        `distance ${lookingUp.distance.toFixed(2)} m, height ${lookingUp.y.toFixed(2)} m`,
      );
      await page.mouse.move(1040, 3000, { steps: 8 });
      await page.waitForTimeout(1500);
      const lookingDown = await cameraNow();
      check("the camera moves back out when nothing is in the way", Math.abs(lookingDown.distance - 4.5) < 0.01, `distance ${lookingDown.distance.toFixed(2)} m`);

      // The wheel zooms: back moves the camera away, forward brings it closer, within 2 to 8 m.
      await page.mouse.wheel(0, 100);
      await page.mouse.wheel(0, 100);
      await page.waitForTimeout(600);
      const zoomedOut = await cameraNow();
      check(
        "rolling the wheel back moves the camera away",
        Math.abs(zoomedOut.wantedDistance - 4.5 * 1.15 ** 2) < 0.01 && Math.abs(zoomedOut.distance - zoomedOut.wantedDistance) < 0.05,
        `wanted ${zoomedOut.wantedDistance.toFixed(2)} m, now ${zoomedOut.distance.toFixed(2)} m`,
      );
      for (let i = 0; i < 15; i += 1) {
        await page.mouse.wheel(0, -100);
      }
      await page.waitForTimeout(800);
      const zoomedIn = await cameraNow();
      check(
        "rolling the wheel forward stops at the nearest distance",
        zoomedIn.wantedDistance === 1 && Math.abs(zoomedIn.distance - 1) < 0.05,
        `wanted ${zoomedIn.wantedDistance.toFixed(2)} m, now ${zoomedIn.distance.toFixed(2)} m`,
      );

      // Letting go of the button ends mouse look and frees the cursor.
      await page.mouse.up();
      await page.waitForFunction(() => !window.__game.view.looking, undefined, { timeout: 5_000 }).catch(() => {});
      const released = await viewNow();
      const pointerFree = await page.evaluate(() => document.pointerLockElement === null);
      await page.mouse.move(700, 400, { steps: 4 });
      await page.waitForTimeout(200);
      const afterRelease = await viewNow();
      check(
        "releasing the button ends mouse look",
        !released.looking && pointerFree && afterRelease.yaw === released.yaw,
        `looking ${released.looking}, pointer free ${pointerFree}`,
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

  // Buildings: starting outside house A's door (`?at`, `?face`), walking forward goes in
  // through the doorway; starting beside it, the wall stops the character.
  {
    const walkFrom = async (at) => {
      await page.goto(gameUrl(`at=${at}&face=270`), { waitUntil: "load" });
      await page.waitForFunction(() => window.__game?.ready === true, undefined, { timeout: 15_000 });
      await page.waitForFunction(() => window.__game.player.grounded, undefined, { timeout: 10_000 });
      const before = await page.evaluate(() => ({ ...window.__game.player, sim: window.__game.simSeconds }));
      await page.keyboard.down("KeyW");
      await page.waitForFunction((sim) => window.__game.simSeconds > sim + 2.5, before.sim, { timeout: 60_000 });
      await page.keyboard.up("KeyW");
      return { before, after: await page.evaluate(() => ({ ...window.__game.player })) };
    };

    const throughDoor = await walkFrom("293,281");
    check("the start position can be set with ?at", Math.abs(throughDoor.before.x - 293) < 0.5 && Math.abs(throughDoor.before.z - 281) < 0.5);
    check(
      "walking through the doorway enters the house",
      throughDoor.before.inside === null && throughDoor.after.inside === "house_a",
      `inside: ${throughDoor.after.inside}, x ${throughDoor.after.x.toFixed(2)}`,
    );

    // The zone cannot be left: walking at its southern edge ends against the invisible wall.
    await page.goto(gameUrl("at=360,705&face=180"), { waitUntil: "load" });
    await page.waitForFunction(() => window.__game?.ready === true, undefined, { timeout: 15_000 });
    await page.waitForFunction(() => window.__game.player.grounded, undefined, { timeout: 10_000 });
    const edgeStart = await page.evaluate(() => window.__game.simSeconds);
    await page.keyboard.down("KeyW");
    await page.waitForFunction((sim) => window.__game.simSeconds > sim + 3, edgeStart, { timeout: 60_000 });
    await page.keyboard.up("KeyW");
    const atEdge = await page.evaluate(() => ({ ...window.__game.player }));
    check(
      "the zone's edge stops the character",
      atEdge.z > 716 && atEdge.z < 720 && atEdge.grounded,
      `z ${atEdge.z.toFixed(2)} of 720`,
    );

    const intoWall = await walkFrom("293,283.5");
    check(
      "the wall beside the doorway stops the character",
      intoWall.after.inside === null && intoWall.after.x > 286.3 && intoWall.after.x < 286.6,
      `inside: ${intoWall.after.inside}, x ${intoWall.after.x.toFixed(2)}`,
    );
  }

  // Terrain: walking down the bank into the riverbed and back up the other side, the
  // character stays on the surface the whole way. Start on the west bank, heading east.
  {
    await page.goto(gameUrl(), { waitUntil: "load" });
    await page.waitForFunction(() => window.__game?.ready === true, undefined, { timeout: 15_000 });
    await page.waitForFunction(() => window.__game.player.grounded, undefined, { timeout: 10_000 });
    await page.evaluate(() => {
      window.__smokeTerrain = { worst: 0, lowest: Infinity, highest: -Infinity, airborne: 0, samples: 0 };
      window.__smokeTimer = setInterval(() => {
        const { y, groundHeight, grounded } = window.__game.player;
        const record = window.__smokeTerrain;
        record.worst = Math.max(record.worst, Math.abs(y - groundHeight - 0.92));
        record.lowest = Math.min(record.lowest, groundHeight);
        record.highest = Math.max(record.highest, groundHeight);
        record.airborne += grounded ? 0 : 1;
        record.samples += 1;
      }, 8);
    });
    const startX = await page.evaluate(() => window.__game.player.x);
    await page.keyboard.down("KeyD");
    // East from the middle of the riverbed, up the bank and onto the plain: about 70 m.
    await page.waitForFunction((x) => window.__game.player.x > x + 70, startX, { timeout: 60_000 });
    await page.keyboard.up("KeyD");
    const walk = await page.evaluate(() => {
      clearInterval(window.__smokeTimer);
      return window.__smokeTerrain;
    });
    check(
      "the walk climbs out of the riverbed",
      walk.highest - walk.lowest > 1.5,
      `terrain from ${walk.lowest.toFixed(2)} to ${walk.highest.toFixed(2)} m`,
    );
    check(
      "the character neither sinks into the terrain nor floats above it",
      walk.worst < 0.15 && walk.airborne <= walk.samples * 0.02,
      `off by at most ${walk.worst.toFixed(3)} m, airborne in ${walk.airborne} of ${walk.samples} samples`,
    );

    // Opening the context menu swallows the key-up, which would leave the key stuck down.
    await page.waitForTimeout(200);
    // dispatchEvent returns false when a listener cancelled the event.
    const menuShown = await page.evaluate(() =>
      document.querySelector("canvas#game").dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })),
    );
    check("the context menu is suppressed over the game", !menuShown);
  }

  // Title screen: it is what a visitor sees first. START (button or Enter) hands over control;
  // before that the character does not respond. The language switch works at once.
  {
    await page.goto(url, { waitUntil: "load" });
    const titleScreen = page.locator("#title-screen");
    await titleScreen.waitFor({ state: "visible", timeout: 15_000 });
    await page.locator("#title-start").waitFor({ state: "visible", timeout: 30_000 });
    const atTitle = await page.evaluate(() => ({ phase: window.__game.phase, x: window.__game.player.x, z: window.__game.player.z }));
    check("the title screen comes up with a START button", atTitle.phase === "title" && (await titleScreen.innerText()).includes("LEESIDE"));

    await page.keyboard.down("KeyW");
    await page.waitForTimeout(500);
    await page.keyboard.up("KeyW");
    const stillAtTitle = await page.evaluate(() => ({ x: window.__game.player.x, z: window.__game.player.z }));
    check("the character does not move behind the title", stillAtTitle.x === atTitle.x && stillAtTitle.z === atTitle.z);

    // Choosing a character: a click or the arrow keys swap the model behind the title.
    const characterNow = () => page.evaluate(() => window.__game.player.character);
    const waitForCharacter = (id) =>
      page.waitForFunction((want) => window.__game.player.character === want, id, { timeout: 15_000 }).catch(() => {});
    const firstCharacter = await characterNow();
    await page.locator("#title-character-lis").click();
    await waitForCharacter("lis");
    const clickedCharacter = await characterNow();
    await page.keyboard.press("ArrowRight");
    await waitForCharacter("sam");
    const arrowCharacter = await characterNow();
    check(
      "the title lets the player choose a character, by click and by arrow key",
      firstCharacter === "matt" && clickedCharacter === "lis" && arrowCharacter === "sam",
      `${firstCharacter} -> ${clickedCharacter} -> ${arrowCharacter}`,
    );
    check("choosing a character does not start the game", (await page.evaluate(() => window.__game.phase)) === "title");

    await page.locator("#title-language-ko").click();
    const korean = await titleScreen.innerText();
    await page.locator("#title-language-en").click();
    const english = await titleScreen.innerText();
    check(
      "the language switch changes the title at once",
      korean.includes("바람이 닿지 않는 곳") && korean.includes("시작") && english.includes("START") && !english.includes("시작"),
    );

    await page.locator("#title-settings").click();
    const settingsNotice = page.locator('[data-window="settings-pending"]');
    const noticeShown = await settingsNotice.isVisible();
    // Enter must close the notice here, not start the game underneath it.
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);
    const phaseAfterNotice = await page.evaluate(() => window.__game.phase);
    check("the settings button opens a notice, and Enter closes it without starting", noticeShown && phaseAfterNotice === "title");

    await page.locator("#title-start").click();
    await page.waitForFunction(() => window.__game.phase === "playing", undefined, { timeout: 5_000 }).catch(() => {});
    await page.waitForTimeout(600);
    check(
      "START hands control to the player and the title goes away",
      (await page.evaluate(() => window.__game.phase)) === "playing" && (await titleScreen.count()) === 0,
    );

    await page.keyboard.down("KeyW");
    await page.waitForFunction((z) => window.__game.player.z < z - 0.5, atTitle.z, { timeout: 10_000 }).catch(() => {});
    await page.keyboard.up("KeyW");
    const afterStart = await page.evaluate(() => window.__game.player.z);
    check("after START the character moves", afterStart < atTitle.z - 0.5, `z ${atTitle.z.toFixed(1)} -> ${afterStart.toFixed(1)}`);

    // Enter starts the game as well.
    await page.goto(url, { waitUntil: "load" });
    await page.locator("#title-start").waitFor({ state: "visible", timeout: 30_000 });
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => window.__game.phase === "playing", undefined, { timeout: 5_000 }).catch(() => {});
    check("Enter starts the game from the title", (await page.evaluate(() => window.__game.phase)) === "playing");
    check("the chosen character is remembered on the next visit", (await characterNow()) === "sam", await characterNow());
    await page.goto(gameUrl("character=shaun"), { waitUntil: "load" });
    await page.waitForFunction(() => window.__game?.ready === true, undefined, { timeout: 15_000 });
    check("?character picks a character for one visit", (await characterNow()) === "shaun", await characterNow());
    await page.evaluate(() => window.localStorage.removeItem("leeside.character"));

    // `?props=boxes` draws every prop as its box again; the colliders are the same either way.
    const bodiesWithModels = await page.evaluate(() => window.__game.bodyCount);
    await page.goto(gameUrl("props=boxes"), { waitUntil: "load" });
    await page.waitForFunction(() => window.__game?.ready === true, undefined, { timeout: 15_000 });
    const boxed = await page.evaluate(() => ({ models: window.__game.zone.propModels, bodies: window.__game.bodyCount }));
    check(
      "?props=boxes draws the props as boxes, with the same colliders",
      boxed.models === 0 && boxed.bodies === bodiesWithModels,
      `${boxed.models} models, ${boxed.bodies} bodies (${bodiesWithModels} with models)`,
    );

    // A phone gets an explanation instead of the game, and nothing is loaded for it.
    const phone = await browser.newPage({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      locale: "en-US",
    });
    const phoneErrors = [];
    phone.on("pageerror", (error) => phoneErrors.push(String(error)));
    await phone.goto(url, { waitUntil: "load" });
    await phone.waitForTimeout(1500);
    const phoneText = await phone.locator("#title-screen").innerText().catch(() => "");
    const gameLoadedOnPhone = await phone.evaluate(() => window.__game !== undefined);
    check(
      "a phone gets a notice instead of the game",
      phoneText.includes("desktop browser") && !gameLoadedOnPhone && (await phone.locator("#title-start").count()) === 0 && phoneErrors.length === 0,
      phoneErrors.join(" | "),
    );
    await phone.close();
  }

  // UI frame: the sample window opens and closes, works with keyboard and mouse, keeps its
  // keys from the game, and the UI scales with the window.
  {
    await page.goto(gameUrl(), { waitUntil: "load" });
    await page.waitForFunction(() => window.__game?.ready === true, undefined, { timeout: 15_000 });
    await page.waitForFunction(() => window.__game.player.grounded, undefined, { timeout: 10_000 });
    const uiNow = () => page.evaluate(() => ({ ...window.__game.ui }));
    const sampleWindow = page.locator('[data-window="sample"]');
    const waitForUi = (predicate, argument) => page.waitForFunction(predicate, argument, { timeout: 5_000 }).catch(() => {});

    const atStart = await uiNow();
    check("the UI scale follows the window height", Math.abs(atStart.scale - 720 / 1080) < 0.001, `scale ${atStart.scale.toFixed(3)} at 720 px`);

    await page.keyboard.press("F4");
    await waitForUi(() => window.__game.ui.window === "sample");
    const opened = await uiNow();
    check("F4 opens the sample window", opened.window === "sample" && opened.selectedButton === 0 && (await sampleWindow.isVisible()));

    // Arrow keys move the selection and wrap round; the window has three buttons.
    // Read from the screen itself: the debug object is only refreshed once per frame.
    const selectedOnScreen = () =>
      sampleWindow.locator(".ui-button").evaluateAll((buttons) => buttons.findIndex((button) => button.classList.contains("selected")));
    await page.keyboard.press("ArrowDown");
    const second = await selectedOnScreen();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    const wrapped = await selectedOnScreen();
    await page.keyboard.press("ArrowUp");
    const last = await selectedOnScreen();
    check("arrow keys move the selection and wrap round", second === 1 && wrapped === 0 && last === 2, `${second}, ${wrapped}, ${last}`);

    // Space chooses a button and must not make the character jump at the same time.
    await page.keyboard.press("ArrowDown");
    await page.keyboard.down("Space");
    await page.waitForTimeout(250);
    const whileOpen = await page.evaluate(() => ({ jump: window.__game.input.jump, grounded: window.__game.player.grounded }));
    await page.keyboard.up("Space");
    const firstLabel = await sampleWindow.locator(".ui-button").first().innerText();
    check("Space presses the selected button", firstLabel.includes("1"), firstLabel);
    check("keys the window uses do not reach the game", whileOpen.jump === false && whileOpen.grounded === true);

    // The mouse works too: hovering selects, clicking presses.
    await sampleWindow.locator(".ui-button").nth(1).hover();
    const hovered = await selectedOnScreen();
    await sampleWindow.locator(".ui-button").first().click();
    const clickedLabel = await sampleWindow.locator(".ui-button").first().innerText();
    check("the mouse selects on hover and presses on click", hovered === 1 && clickedLabel.includes("2"), `selected ${hovered}, "${clickedLabel}"`);

    // Clicking in the window must not start mouse look.
    await sampleWindow.locator(".ui-title").hover();
    await page.mouse.down();
    await page.waitForTimeout(150);
    const lookingOverWindow = await page.evaluate(() => window.__game.view.looking);
    await page.mouse.up();
    check("pressing a mouse button over a window does not turn the view", lookingOverWindow === false);

    await page.keyboard.press("Escape");
    await waitForUi(() => window.__game.ui.window === null);
    await page.waitForTimeout(250);
    check("Escape closes the window", (await uiNow()).window === null && (await sampleWindow.count()) === 0);

    // Once the window is closed the keys belong to the game again.
    await page.keyboard.down("Space");
    await waitForUi(() => window.__game.input.jump === true);
    const jumpAfterClose = await page.evaluate(() => window.__game.input.jump);
    await page.keyboard.up("Space");
    check("after closing, the keys reach the game again", jumpAfterClose === true);

    // A window below the supported size gets a notice; a taller one scales the UI up.
    await page.setViewportSize({ width: 1000, height: 600 });
    await waitForUi(() => window.__game.ui.tooSmall === true);
    check("a window that is too small shows a notice", (await uiNow()).tooSmall && (await page.locator("#ui-too-small").isVisible()));
    await page.setViewportSize({ width: 1920, height: 1080 });
    await waitForUi(() => window.__game.ui.scale === 1);
    const large = await uiNow();
    check("at 1920 x 1080 the scale is 1 and the notice is gone", large.scale === 1 && !large.tooSmall && (await page.locator("#ui-too-small").isHidden()));
    await page.setViewportSize({ width: 1280, height: 720 });
  }

  // Performance measurement: `?bench` flies the camera round by itself and ends with a result.
  // A short run is enough here; the numbers themselves mean nothing in a headless browser.
  {
    await page.goto(`${url}?bench=3`, { waitUntil: "load" });
    await page.waitForFunction(() => window.__game?.ready === true, undefined, { timeout: 15_000 });
    const benchStart = await page.evaluate(() => ({ state: window.__game.bench.state, player: { ...window.__game.player } }));
    check("?bench starts a measurement", benchStart.state === "running", benchStart.state);

    let finished = true;
    try {
      await page.waitForFunction(() => window.__game.bench.state === "done", undefined, { timeout: 60_000 });
    } catch {
      finished = false;
    }
    const bench = await page.evaluate(() => ({ ...window.__game.bench, player: { ...window.__game.player } }));
    check(
      "the measurement runs to the end and gives a result",
      finished && bench.summary?.frames > 0 && bench.summary?.maxDrawCalls > 0 && typeof bench.withinBudget === "boolean",
      finished ? `${bench.summary.frames} frames in ${bench.summary.seconds.toFixed(1)} s` : `stopped at ${Math.round(bench.progress * 100)}%`,
    );
    check(
      "the character stays put during a measurement",
      Math.abs(bench.player.x - benchStart.player.x) < 0.01 && Math.abs(bench.player.z - benchStart.player.z) < 0.01,
    );
    const resultText = (await page.locator("#bench-result").isVisible()) ? await page.locator("#bench-result").innerText() : "";
    check(
      "the result is shown with a copy button",
      resultText.includes("FPS") && (await page.locator("#bench-copy").count()) === 1,
      resultText ? `${resultText.split("\n").length} lines` : "panel not visible",
    );
  }

  // Screen text follows `?lang`, and without it the browser's language.
  const overlayTextFor = async (targetPage, query) => {
    await targetPage.goto(gameUrl(query), { waitUntil: "load" });
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
