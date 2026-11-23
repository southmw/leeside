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
// The last one lets sound start without a click, so the test can tell that it really plays.
const browserArgs = ["--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"];

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

// Loading takes a while in software rendering, longest in a fresh browser context with nothing cached.
const READY_TIMEOUT_MS = 60_000;

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
    await page.waitForFunction(() => window.__game?.ready === true, undefined, { timeout: READY_TIMEOUT_MS });
  } catch {
    ready = false;
  }
  check("debug object exists and game is ready", ready);

  const hasCanvas = (await page.locator("canvas#game").count()) === 1;
  check("canvas exists", hasCanvas);

  if (ready) {
    const first = await page.evaluate(() => ({ ...window.__game, canvas: { ...window.__game.canvas } }));
    // Software rendering draws only a few frames a second, fewer still while the scene is
    // new; this checks that the loop is alive, not how fast it is.
    await page
      .waitForFunction((from) => window.__game.frame > from.frame && window.__game.tick > from.tick, { frame: first.frame, tick: first.tick }, { timeout: 10_000 })
      .catch(() => {});
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
    // The default set of models: four cars and the two blocked exits, and the rocks.
    check(
      "props and rocks are drawn with models",
      zoneInfo.propSet === "quaternius" && zoneInfo.propModels === 6 && zoneInfo.rockModels === true,
      `${zoneInfo.propSet}: ${zoneInfo.propModels} of ${zoneInfo.props} props, rocks ${zoneInfo.rockModels}`,
    );
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
      // The animation follows the movement one drawn frame later, and software rendering
      // draws only a few frames a second: wait for the change instead of a fixed time.
      const waitForAnimation = (name) =>
        page.waitForFunction((want) => window.__game.player.animation === want, name, { timeout: 5_000 }).catch(() => {});
      await waitForAnimation("idle");
      const standing = await animationNow();
      await page.keyboard.down("KeyA");
      await waitForAnimation("run");
      const running = await animationNow();
      await page.keyboard.up("KeyA");
      await waitForAnimation("idle");
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
      window.__smokeJumpSeen = false;
      window.__smokeTimer = setInterval(() => {
        window.__smokePeak = Math.max(window.__smokePeak, window.__game.player.y);
        window.__smokeJumpSeen ||= window.__game.player.animation === "jump";
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
      return { peak: window.__smokePeak - ground, landedAt: window.__game.player.y - ground, jumpSeen: window.__smokeJumpSeen };
    }, groundY);
    check("the character leaves the ground when jumping", airborne);
    if (modelLoaded) {
      // The animation is sampled throughout the jump: with only a few frames drawn per
      // second, any single moment may miss it.
      await page.waitForFunction(() => window.__game.player.animation === "idle", undefined, { timeout: 5_000 }).catch(() => {});
      const landedAnimation = await animationNow();
      check(
        "the model plays the jump animation in the air and stops on landing",
        jump.jumpSeen && landedAnimation === "idle",
        `jump seen: ${jump.jumpSeen} -> ${landedAnimation}`,
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
    await page.waitForFunction(() => window.__game?.ready === true, undefined, { timeout: READY_TIMEOUT_MS });
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
    await page.waitForFunction(() => window.__game?.ready === true, undefined, { timeout: READY_TIMEOUT_MS });

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
      await page.waitForFunction(() => window.__game?.ready === true, undefined, { timeout: READY_TIMEOUT_MS });
      await page.waitForFunction(() => window.__game.player.grounded, undefined, { timeout: 10_000 });
      const sign = page.locator("#hud-shelter");
      const before = await page.evaluate(() => ({ ...window.__game.player, sim: window.__game.simSeconds }));
      const signBefore = await sign.isVisible();
      await page.keyboard.down("KeyW");
      await page.waitForFunction((sim) => window.__game.simSeconds > sim + 2.5, before.sim, { timeout: 60_000 });
      await page.keyboard.up("KeyW");
      const after = await page.evaluate(() => ({ ...window.__game.player }));
      return { before, after, signBefore, signAfter: await sign.isVisible(), signText: await sign.innerText().catch(() => "") };
    };

    const throughDoor = await walkFrom("293,281");
    check("the start position can be set with ?at", Math.abs(throughDoor.before.x - 293) < 0.5 && Math.abs(throughDoor.before.z - 281) < 0.5);
    check(
      "walking through the doorway enters the house",
      throughDoor.before.inside === null && throughDoor.after.inside === "house_a",
      `inside: ${throughDoor.after.inside}, x ${throughDoor.after.x.toFixed(2)}`,
    );

    // Shelter: inside the house the player is in its shelter zone and the HUD says so.
    check(
      "walking into a house takes shelter and the HUD shows it",
      throughDoor.before.shelter === null && !throughDoor.signBefore && throughDoor.after.shelter === "house_a" && throughDoor.signAfter,
      `shelter: ${throughDoor.before.shelter} -> ${throughDoor.after.shelter}, sign "${throughDoor.signText}"`,
    );

    // The zone cannot be left: walking at its southern edge ends against the invisible wall.
    await page.goto(gameUrl("at=360,705&face=180"), { waitUntil: "load" });
    await page.waitForFunction(() => window.__game?.ready === true, undefined, { timeout: READY_TIMEOUT_MS });
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
      intoWall.after.inside === null && intoWall.after.shelter === null && !intoWall.signAfter && intoWall.after.x > 286.3 && intoWall.after.x < 286.6,
      `inside: ${intoWall.after.inside}, x ${intoWall.after.x.toFixed(2)}`,
    );
  }

  // Terrain: walking down the bank into the riverbed and back up the other side, the
  // character stays on the surface the whole way. Start on the west bank, heading east.
  {
    await page.goto(gameUrl(), { waitUntil: "load" });
    await page.waitForFunction(() => window.__game?.ready === true, undefined, { timeout: READY_TIMEOUT_MS });
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
    await page.locator("#title-start").waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
    const atTitle = await page.evaluate(() => ({ phase: window.__game.phase, x: window.__game.player.x, z: window.__game.player.z }));
    check("the HUD is hidden behind the title", !(await page.locator("#hud").isVisible()));
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
    await page.locator("#title-start").waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => window.__game.phase === "playing", undefined, { timeout: 5_000 }).catch(() => {});
    check("Enter starts the game from the title", (await page.evaluate(() => window.__game.phase)) === "playing");
    check("the chosen character is remembered on the next visit", (await characterNow()) === "sam", await characterNow());
    await page.goto(gameUrl("character=shaun"), { waitUntil: "load" });
    await page.waitForFunction(() => window.__game?.ready === true, undefined, { timeout: READY_TIMEOUT_MS });
    check("?character picks a character for one visit", (await characterNow()) === "shaun", await characterNow());
    await page.evaluate(() => window.localStorage.removeItem("leeside.character"));

    // The development panel does on screen what the start conditions do in the address.
    await page.goto(gameUrl(), { waitUntil: "load" });
    await page.waitForFunction(() => window.__game?.ready === true, undefined, { timeout: READY_TIMEOUT_MS });
    await page.locator("#dev-open").waitFor({ state: "visible", timeout: 10_000 });
    await page.keyboard.press("F2");
    await page.locator("#dev-panel").waitFor({ state: "visible", timeout: 5_000 });
    await page.locator("#dev-place-abandoned_car").click();
    await page.waitForFunction(() => Math.abs(window.__game.player.x - 469) < 1, undefined, { timeout: 5_000 }).catch(() => {});
    const moved = await page.evaluate(() => ({ x: window.__game.player.x, z: window.__game.player.z }));
    check("the panel moves the player to a place", Math.abs(moved.x - 469) < 1 && Math.abs(moved.z - 366) < 1, `at ${moved.x.toFixed(1)}, ${moved.z.toFixed(1)}`);
    await page.locator("#dev-shelter-show").click();
    const zonesShown = await page.evaluate(() => ({ shown: window.__game.shelterZonesShown, zones: window.__game.zone.shelterZones }));
    await page.locator("#dev-shelter-hide").click();
    const zonesHidden = await page.evaluate(() => window.__game.shelterZonesShown);
    check("the panel shows and hides the shelter zones", zonesShown.shown && zonesShown.zones === 3 && !zonesHidden, `${zonesShown.zones} zones`);
    await page.locator("#dev-health-low").click();
    const lowHealth = await page.evaluate(() => window.__game.player.health);
    await page.locator("#dev-health-full").click();
    const fullHealth = await page.evaluate(() => window.__game.player.health);
    check("the panel sets the health", lowHealth === 10 && fullHealth === 100, `${lowHealth} -> ${fullHealth}`);
    await page.locator("#dev-temperature-50").click();
    const setCold = await page.evaluate(() => window.__game.player.temperature);
    await page.locator("#dev-temperature-0").click();
    const setWarm = await page.evaluate(() => window.__game.player.temperature);
    await page.locator("#dev-thirst-20").click();
    const setThirsty = await page.evaluate(() => window.__game.player.thirst);
    await page.locator("#dev-thirst-100").click();
    const setQuenched = await page.evaluate(() => window.__game.player.thirst);
    check("the panel sets the thirst", setThirsty <= 20 && setThirsty > 19 && setQuenched > 99, `${setThirsty.toFixed(1)} -> ${setQuenched.toFixed(1)}`);
    check("the panel sets the body temperature", setCold <= -49 && setCold >= -50 && setWarm === 0, `${setCold.toFixed(1)} -> ${setWarm}`);
    await page.locator("#dev-speed-up").click();
    const fasterSpeed = await page.evaluate(() => window.__game.moveSpeed);
    await page.locator("#dev-speed-reset").click();
    const resetSpeed = await page.evaluate(() => window.__game.moveSpeed);
    check("the panel changes the walking speed", fasterSpeed === 13 && resetSpeed === 12, `${fasterSpeed} -> ${resetSpeed}`);
    await page.locator("#dev-character-lis").click();
    await waitForCharacter("lis");
    check("the panel changes the character", (await characterNow()) === "lis", await characterNow());
    const propsNow = () => page.evaluate(() => ({ set: window.__game.zone.propSet, models: window.__game.zone.propModels, rocks: window.__game.zone.rockModels }));
    const waitForSet = (id) => page.waitForFunction((want) => window.__game.zone.propSet === want, id, { timeout: 15_000 }).catch(() => {});
    await page.locator("#dev-props-boxes").click();
    await waitForSet("boxes");
    const boxes = await propsNow();
    await page.locator("#dev-props-quaternius").click();
    await waitForSet("quaternius");
    const quaternius = await propsNow();
    check(
      "the panel switches the props between models and boxes",
      boxes.models === 0 && !boxes.rocks && quaternius.models === 6 && quaternius.rocks,
      `boxes ${boxes.models}, quaternius ${quaternius.models}`,
    );
    await page.locator("#dev-time-19").click();
    const nightfall = await page.evaluate(() => ({ ...window.__game.clock }));
    await page.waitForFunction(() => document.querySelector("#dev-time-19")?.classList.contains("selected"), undefined, { timeout: 3_000 }).catch(() => {});
    const panelClock = await page.evaluate(() => ({
      now: document.querySelector("#dev-time-now")?.textContent ?? "",
      marked: document.querySelector("#dev-time-19")?.classList.contains("selected") === true,
    }));
    check("the panel shows the time now and marks the hour last passed", panelClock.now.includes("19:00") && panelClock.marked, `"${panelClock.now}", marked ${panelClock.marked}`);
    await page.locator("#dev-timescale-0").click();
    const stoppedScale = await page.evaluate(() => window.__game.clock.scale);
    check(
      "the panel sets the time of day and the clock's speed",
      Math.abs(nightfall.hour - 19) < 0.2 && nightfall.phase === "night" && stoppedScale === 0,
      `${nightfall.hour.toFixed(2)} ${nightfall.phase}, scale ${stoppedScale}`,
    );
    const weatherNow = () => page.evaluate(() => ({ ...window.__game.weather }));
    await page.locator("#dev-timescale-1").click();
    await page.locator("#dev-storm-now").click();
    const calledStorm = await weatherNow();
    await page.locator("#dev-storm-calm").click();
    const calmed = await weatherNow();
    await page.locator("#dev-storm-warning").click();
    const announced = await weatherNow();
    const panelWeather = await page.locator("#dev-weather-now").innerText();
    await page.locator("#dev-storm-calm").click();
    check(
      "the panel calls a storm, with or without warning, and calms it",
      calledStorm.phase === "storm" && calmed.phase === "clear" && announced.phase === "warning" && announced.secondsLeft > 25,
      `${calledStorm.phase} -> ${calmed.phase} -> ${announced.phase} (${announced.secondsLeft.toFixed(0)} s), panel "${panelWeather}"`,
    );
    await page.keyboard.press("F2");
    check("F2 closes the panel again", !(await page.locator("#dev-panel").isVisible()));

    // The clock: day 1 from 06:00, shown top right. `?time` and `?timescale` change where it
    // starts and how fast it runs.
    await page.goto(gameUrl("lang=en"), { waitUntil: "load" });
    await page.waitForFunction(() => window.__game?.ready === true, undefined, { timeout: READY_TIMEOUT_MS });
    const morning = await page.evaluate(() => ({ ...window.__game.clock }));
    const hudClock = await page.locator("#hud-clock").innerText();
    const morningSky = await page.evaluate(() => ({ ...window.__game.sky }));
    check(
      "the sun is up and shining when the day starts",
      morningSky.sunElevation > 5 && morningSky.sunIntensity > 0.8,
      `sun at ${morningSky.sunElevation.toFixed(1)} degrees, strength ${morningSky.sunIntensity.toFixed(2)}`,
    );
    check(
      "the day starts at 06:00 and the HUD shows it",
      morning.day === 1 && morning.hour >= 6 && morning.hour < 6.5 && morning.phase === "day" && hudClock.includes("Day 1") && hudClock.includes("06:00"),
      `day ${morning.day}, ${morning.hour.toFixed(2)}, "${hudClock.replace(/\s+/g, " ")}"`,
    );
    await page.goto(gameUrl("lang=en&time=18:00&timescale=60"), { waitUntil: "load" });
    await page.waitForFunction(() => window.__game?.ready === true, undefined, { timeout: READY_TIMEOUT_MS });
    const dusk = await page.evaluate(() => ({ ...window.__game.clock }));
    await page.waitForFunction(() => window.__game.clock.phase === "night", undefined, { timeout: 15_000 }).catch(() => {});
    const night = await page.evaluate(() => ({ ...window.__game.clock }));
    const nightSky = await page.evaluate(() => ({ ...window.__game.sky }));
    check(
      "at night the sun is down and gives no light, but it is not pitch dark",
      nightSky.sunElevation < 0 && nightSky.sunIntensity === 0 && nightSky.ambientIntensity > 0.15,
      `sun at ${nightSky.sunElevation.toFixed(1)} degrees, ambient ${nightSky.ambientIntensity.toFixed(2)}`,
    );
    check(
      "?time starts at that hour and ?timescale runs the clock faster",
      dusk.hour >= 18 && dusk.hour < 19 && dusk.phase === "dusk" && dusk.scale === 60 && night.phase === "night",
      `${dusk.hour.toFixed(2)} ${dusk.phase} -> ${night.hour.toFixed(2)} ${night.phase}`,
    );
    const nightHud = await page.locator("#hud-clock").innerText();
    check(
      "the HUD clock says that it is night, in colour and in a word",
      (await page.locator("#hud-clock").getAttribute("class")) === "night" && nightHud.includes("Night"),
      `"${nightHud.replace(/\s+/g, " ")}"`,
    );

    // The weather: one storm a day, at a time the seed decides. `?storm` starts in one.
    await page.goto(gameUrl("seed=1"), { waitUntil: "load" });
    await page.waitForFunction(() => window.__game?.ready === true, undefined, { timeout: READY_TIMEOUT_MS });
    const calm = await page.evaluate(() => ({ ...window.__game.weather }));
    check(
      "the day starts clear, with the storm 90 to 180 seconds off",
      calm.seed === 1 && calm.phase === "clear" && calm.intensity === 0 && calm.secondsLeft > 80 && calm.secondsLeft <= 180,
      `seed ${calm.seed}, ${calm.phase}, storm in ${calm.secondsLeft.toFixed(0)} s`,
    );
    await page.goto(gameUrl("seed=1&storm=warning&timescale=10"), { waitUntil: "load" });
    await page.waitForFunction(() => window.__game?.ready === true, undefined, { timeout: READY_TIMEOUT_MS });
    const warned = await page.evaluate(() => ({ ...window.__game.weather }));
    // The wall of the storm takes shape in the south and comes nearer through the warning.
    await page.waitForFunction(() => window.__game.weather.wallOpacity === 1, undefined, { timeout: 10_000 }).catch(() => {});
    const wallFar = await page.evaluate(() => ({ ...window.__game.weather }));
    await page.waitForFunction((from) => window.__game.weather.wallDistance < from - 300 || window.__game.weather.phase !== "warning", wallFar.wallDistance, { timeout: 10_000 }).catch(() => {});
    const wallNear = await page.evaluate(() => ({ ...window.__game.weather }));
    check(
      "the storm wall comes nearer during the warning",
      wallFar.wallOpacity === 1 && wallFar.wallDistance > 300 && wallNear.wallDistance < wallFar.wallDistance - 300,
      `${wallFar.wallDistance.toFixed(0)} m -> ${wallNear.wallDistance.toFixed(0)} m`,
    );
    await page.waitForFunction(() => window.__game.weather.intensity === 1, undefined, { timeout: 20_000 }).catch(() => {});
    const raging = await page.evaluate(() => ({ ...window.__game.weather }));
    await page.waitForFunction(() => window.__game.weather.phase === "clear", undefined, { timeout: 30_000 }).catch(() => {});
    const passed = await page.evaluate(() => ({ ...window.__game.weather }));
    check(
      "a storm is announced, arrives at full strength and passes",
      warned.phase === "warning" && warned.intensity === 0 && raging.phase === "storm" && raging.approach === 1 && passed.phase === "clear" && passed.intensity === 0,
      `${warned.phase} -> ${raging.phase} ${raging.intensity} -> ${passed.phase}`,
    );
    check("the wall is gone once the storm has passed", passed.wallOpacity === 0, `opacity ${passed.wallOpacity}`);
    await page.goto(gameUrl("storm=now"), { waitUntil: "load" });
    await page.waitForFunction(() => window.__game?.ready === true, undefined, { timeout: READY_TIMEOUT_MS });
    check("?storm=now starts in the storm", (await page.evaluate(() => window.__game.weather.phase)) === "storm");

    // The storm closes the view in to 25 m; pictures of clear weather and of the storm are
    // kept for looking at (test-results/weather-clear.png and weather-storm.png).
    await page.waitForFunction(() => window.__game.weather.intensity === 1, undefined, { timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(600);
    const stormView = await page.evaluate(() => window.__game.sky.visibility);
    await page.screenshot({ path: join(outDir, "weather-storm.png") });
    await page.goto(gameUrl("seed=1&timescale=0"), { waitUntil: "load" });
    await page.waitForFunction(() => window.__game?.ready === true, undefined, { timeout: READY_TIMEOUT_MS });
    await page.waitForTimeout(600);
    const clearView = await page.evaluate(() => window.__game.sky.visibility);
    await page.screenshot({ path: join(outDir, "weather-clear.png") });
    check(
      "the storm closes the view in to 25 m",
      Math.abs(stormView - 25) < 0.5 && clearView > 1000,
      `${clearView.toFixed(0)} m in clear weather, ${stormView.toFixed(1)} m in the storm`,
    );

    // Sound: the wind plays from the start, louder in a storm, quieter and muffled indoors.
    // (280,282 is inside house A.)
    const audioAt = async (query) => {
      await page.goto(gameUrl(query), { waitUntil: "load" });
      await page.waitForFunction(() => window.__game?.ready === true, undefined, { timeout: READY_TIMEOUT_MS });
      await page.waitForFunction(() => window.__game.audio.state === "playing" && window.__game.weather.intensity % 1 === 0, undefined, { timeout: 20_000 }).catch(() => {});
      const signClass = (await page.locator("#hud-shelter").getAttribute("class")) ?? "";
      return page.evaluate((sign) => ({ ...window.__game.audio, inside: window.__game.player.inside, shelter: window.__game.player.shelter, signClass: sign }), signClass);
    };
    const calmSound = await audioAt("seed=1&timescale=0");
    const stormSound = await audioAt("storm=now");
    const shelteredSound = await audioAt("storm=now&at=280,282");
    check("the wind plays once the game has started", calmSound.state === "playing" && !calmSound.muted, calmSound.state);
    check(
      "the wind is light in clear weather and loud in a storm",
      Math.abs(calmSound.windVolume - 0.55) < 0.001 && stormSound.windVolume === 2 && !stormSound.indoors,
      `${calmSound.windVolume.toFixed(2)} clear, ${stormSound.windVolume.toFixed(2)} in the storm`,
    );
    check(
      "indoors the storm is quieter and muffled",
      shelteredSound.indoors && Math.abs(shelteredSound.windVolume - 0.7) < 0.001 && shelteredSound.windCutoffHz === 500 && stormSound.windCutoffHz === 20000,
      `inside ${shelteredSound.inside}: volume ${shelteredSound.windVolume.toFixed(2)}, below ${shelteredSound.windCutoffHz} Hz`,
    );
    // The "sheltered" sign stands out while a storm blows. (Calm weather, same spot, for comparison.)
    const shelteredCalm = await audioAt("seed=1&timescale=0&at=280,282");
    check(
      "the sheltered sign is marked out during a storm",
      shelteredSound.shelter === "house_a" && shelteredSound.signClass === "storm" && shelteredCalm.shelter === "house_a" && shelteredCalm.signClass === "",
      `storm: "${shelteredSound.signClass}", calm: "${shelteredCalm.signClass}"`,
    );
    // Health: out in the storm it drains, in a house it does not.
    const stormAt = async (query, until) => {
      await page.goto(gameUrl(`storm=now&${query}`), { waitUntil: "load" });
      await page.waitForFunction(() => window.__game?.ready === true, undefined, { timeout: READY_TIMEOUT_MS });
      await page.waitForFunction(until, undefined, { timeout: 90_000 }).catch(() => {});
      const bar = await page.locator("#hud-health-value").innerText();
      return page.evaluate((shown) => ({ ...window.__game.player, day: window.__game.clock.day, sim: window.__game.simSeconds, bar: shown }), bar);
    };
    const exposed = await stormAt("at=360,600", () => window.__game.player.health < 90);
    const safe = await stormAt("at=280,282", () => window.__game.simSeconds > 8);
    check(
      "the storm drains health in the open and not in a house",
      exposed.health < 90 && exposed.health > 0 && exposed.bar === String(Math.ceil(exposed.health)) && safe.health === 100 && safe.sim > 8,
      `${exposed.health.toFixed(1)} in the open (bar "${exposed.bar}"), ${safe.health} in ${safe.shelter} after ${safe.sim.toFixed(0)} s`,
    );
    // Death: at zero the character collapses where it is, however hard the player pushes on,
    // and a window asks whether to go on or to stop.
    const deathState = () =>
      page.evaluate(() => ({
        ...window.__game.player,
        day: window.__game.clock.day,
        phase: window.__game.phase,
        window: window.__game.ui.window,
        veil: document.querySelector("#death-veil")?.classList.contains("shown") ?? false,
      }));
    await page.goto(gameUrl("storm=now&at=360,600&face=0&health=10"), { waitUntil: "load" });
    await page.waitForFunction(() => window.__game?.ready === true, undefined, { timeout: READY_TIMEOUT_MS });
    await page.keyboard.down("KeyW");
    await page.waitForFunction(() => window.__game.player.dead, undefined, { timeout: 90_000 }).catch(() => {});
    const fell = await deathState();
    await page.waitForFunction(() => window.__game.ui.window === "death", undefined, { timeout: 30_000 }).catch(() => {});
    const asked = await deathState();
    await page.keyboard.up("KeyW");
    // Once the window has faded in and the camera has drawn back.
    await page.waitForTimeout(1500);
    await page.screenshot({ path: join(outDir, "death.png") });
    const askedText = await page.locator('[data-window="death"]').innerText().catch(() => "");
    check(
      "at zero health the character collapses and stays where it fell",
      fell.dead && fell.health === 0 && fell.deaths === 1 && asked.animation === "death" && Math.hypot(asked.x - fell.x, asked.z - fell.z) < 0.5 && asked.day === 1,
      `health ${fell.health}, animation ${asked.animation}, moved ${Math.hypot(asked.x - fell.x, asked.z - fell.z).toFixed(2)} m after falling`,
    );
    check(
      "the picture darkens and a window offers to continue or to quit",
      asked.window === "death" && asked.veil && askedText.includes("Continue") && askedText.includes("Quit to title"),
      askedText.replace(/\s+/g, " "),
    );
    // Continue (the button chosen at first): the next morning at the shelter's entrance in
    // house A, in full health.
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => !window.__game.player.dead, undefined, { timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(300);
    const went = await deathState();
    check(
      "continuing starts again at the shelter's entrance the next morning",
      !went.dead && went.deaths === 1 && went.health === 100 && went.day === 2 && went.shelter === "house_a" &&
        Math.abs(went.x - 281) < 1 && Math.abs(went.z - 281) < 1 && went.window === null && !went.veil && went.animation !== "death" && went.phase === "playing",
      `died ${went.deaths}, health ${went.health}, day ${went.day}, in ${went.shelter} at ${went.x.toFixed(0)}, ${went.z.toFixed(0)}, ${went.animation}`,
    );
    // Quit (the second button): the title comes back over a game put back to its beginning,
    // and START plays again.
    await page.locator("#dev-open").waitFor({ state: "visible", timeout: 10_000 });
    await page.keyboard.press("F2");
    await page.locator("#dev-health-zero").click();
    await page.keyboard.press("F2");
    await page.waitForFunction(() => window.__game.ui.window === "death", undefined, { timeout: 30_000 }).catch(() => {});
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => window.__game.phase === "title", undefined, { timeout: 10_000 }).catch(() => {});
    await page.locator("#title-start").waitFor({ state: "visible", timeout: 10_000 }).catch(() => {});
    const quit = await deathState();
    const quitHud = await page.locator("#hud").isVisible();
    check(
      "quitting goes to the title screen with the game back at its beginning",
      quit.phase === "title" && (await page.locator("#title-start").count()) === 1 && !quitHud && !quit.dead && quit.deaths === 0 && quit.health === 100 &&
        quit.day === 1 && Math.abs(quit.x - 360) < 1 && Math.abs(quit.z - 600) < 1 && quit.window === null && !quit.veil,
      `${quit.phase}, day ${quit.day}, health ${quit.health}, at ${quit.x.toFixed(0)}, ${quit.z.toFixed(0)}`,
    );
    await page.locator("#title-start").click();
    await page.waitForFunction(() => window.__game.phase === "playing", undefined, { timeout: 5_000 }).catch(() => {});
    await page.keyboard.down("KeyW");
    await page.waitForFunction((z) => window.__game.player.z < z - 0.5, quit.z, { timeout: 10_000 }).catch(() => {});
    await page.keyboard.up("KeyW");
    const again = await deathState();
    check(
      "the game can be played again after quitting to the title",
      again.phase === "playing" && again.z < quit.z - 0.5 && (await page.locator("#hud").isVisible()) && (await page.locator("#title-screen").count()) <= 1,
      `${again.phase}, z ${quit.z.toFixed(1)} -> ${again.z.toFixed(1)}`,
    );
    // Body temperature: out at night it falls and the HUD says "Cold"; in a house it stays
    // comfortable; by day it comes back; and hypothermia takes health until the player dies of it.
    const coldAt = async (query, until) => {
      await page.goto(gameUrl(query), { waitUntil: "load" });
      await page.waitForFunction(() => window.__game?.ready === true, undefined, { timeout: READY_TIMEOUT_MS });
      await page.waitForFunction(until, undefined, { timeout: 90_000 }).catch(() => {});
      const shown = await page.locator("#hud-temperature-stage").innerText();
      const fill = await page.locator("#hud-temperature .ui-bar-fill").evaluate((element) => element.style.width);
      return page.evaluate(([text, width]) => ({ ...window.__game.player, sim: window.__game.simSeconds, phase: window.__game.clock.phase, shown: text, fill: width }), [shown, fill]);
    };
    const chilled = await coldAt("time=22:00&timescale=20&at=360,600", () => window.__game.player.temperatureStage === "cold");
    await page.screenshot({ path: join(outDir, "cold.png") });
    const warmInside = await coldAt("time=22:00&timescale=20&at=280,282", () => window.__game.simSeconds > 4);
    check(
      "at night the body cools in the open and not in a house",
      chilled.phase === "night" && chilled.temperature <= -50 && chilled.temperatureStage === "cold" && chilled.shown === "Cold" && parseFloat(chilled.fill) >= 25 &&
        chilled.health === 100 && warmInside.temperature === 0 && warmInside.shown === "Comfortable" && warmInside.sim > 4,
      `${chilled.temperature.toFixed(0)} in the open ("${chilled.shown}", bar ${chilled.fill}), ${warmInside.temperature} in ${warmInside.shelter} after ${warmInside.sim.toFixed(0)} s`,
    );
    const thawed = await coldAt("time=12:00&temperature=-80&at=360,600", () => window.__game.player.temperature > -40);
    check("?temperature starts chilled, and by day the body warms up again", thawed.temperature > -40 && thawed.temperature <= 0, thawed.temperature.toFixed(0));
    const frozen = await coldAt("time=22:00&temperature=-100&health=5&at=360,600", () => window.__game.ui.window === "death");
    const frozenText = await page.locator('[data-window="death"]').innerText().catch(() => "");
    check(
      "hypothermia takes health, and the death window names the cold",
      frozen.dead && frozen.health === 0 && frozen.temperatureStage === "hypothermia" && frozen.shown === "Hypothermia" && frozenText.includes("cold"),
      frozenText.replace(/\s+/g, " "),
    );
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => !window.__game.player.dead, undefined, { timeout: 10_000 }).catch(() => {});
    const rewarmed = await page.evaluate(() => window.__game.player);
    check("starting again is warm as well as whole", rewarmed.temperature === 0 && rewarmed.health === 100, `${rewarmed.temperature}, health ${rewarmed.health}`);
    // Thirst: it runs down with the clock, indoors too; with none left it takes health until the
    // player dies of it, and whoever starts again has had a drink.
    const thirstAt = async (query, until) => {
      await page.goto(gameUrl(query), { waitUntil: "load" });
      await page.waitForFunction(() => window.__game?.ready === true, undefined, { timeout: READY_TIMEOUT_MS });
      await page.waitForFunction(until, undefined, { timeout: 90_000 }).catch(() => {});
      const shown = await page.locator("#hud-thirst-value").innerText();
      return page.evaluate((text) => ({ ...window.__game.player, shown: text }), shown);
    };
    const thirsty = await thirstAt("timescale=60&at=280,282", () => window.__game.player.thirst < 80);
    await page.screenshot({ path: join(outDir, "thirst.png") });
    check(
      "thirst runs down with the clock, in a house as well, and the HUD shows it",
      thirsty.thirst < 80 && thirsty.thirst > 40 && thirsty.shown === String(Math.ceil(thirsty.thirst)) && thirsty.shelter === "house_a" && thirsty.health === 100,
      `${thirsty.thirst.toFixed(1)} (bar "${thirsty.shown}") in ${thirsty.shelter}`,
    );
    const parched = await thirstAt("thirst=0&health=3&at=280,282", () => window.__game.ui.window === "death");
    const parchedText = await page.locator('[data-window="death"]').innerText().catch(() => "");
    check(
      "with no water left health drains, and the death window names thirst",
      parched.dead && parched.health === 0 && parched.thirst === 0 && parched.shown === "0" && parchedText.includes("water"),
      parchedText.replace(/\s+/g, " "),
    );
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => !window.__game.player.dead, undefined, { timeout: 10_000 }).catch(() => {});
    const watered = await page.evaluate(() => window.__game.player);
    check("starting again begins with thirst quenched", watered.thirst > 99 && watered.health === 100, `${watered.thirst.toFixed(1)}, health ${watered.health}`);
    // HUD: the compass turns with the view and points at the shelter; the storm is announced
    // with a bar that runs down; edges and blinking bars follow the player's situation.
    const hudAt = async (query, until = () => true) => {
      await page.goto(gameUrl(query), { waitUntil: "load" });
      await page.waitForFunction(() => window.__game?.ready === true, undefined, { timeout: READY_TIMEOUT_MS });
      await page.waitForFunction(until, undefined, { timeout: 60_000 }).catch(() => {});
      await page.waitForTimeout(300);
      return page.evaluate(() => {
        const visible = (selector) => {
          const node = document.querySelector(selector);
          return node !== null && !node.hidden;
        };
        const has = (selector, name) => document.querySelector(selector)?.classList.contains(name) ?? false;
        return {
          ...window.__game.hud,
          stormShown: visible("#hud-storm"),
          stormRed: has("#hud-storm", "storm"),
          stormText: document.querySelector("#hud-storm .hud-storm-text")?.textContent ?? "",
          stormFill: parseFloat(document.querySelector("#hud-storm .hud-storm-fill")?.style.width || "0"),
          north: document.querySelector("#hud-compass .hud-point")?.textContent ?? "",
          northLeft: parseFloat(document.querySelector("#hud-compass .hud-point")?.style.left || "0"),
          northHidden: document.querySelector("#hud-compass .hud-point")?.hidden ?? true,
          markLeft: parseFloat(document.querySelector("#hud-compass-shelter")?.style.left || "0"),
          markArrowLeft: visible("#hud-compass-shelter .hud-arrow:first-child"),
          marked: has("#hud-compass-shelter", "marked"),
          edgeStorm: has("#hud-edge-storm", "shown"),
          edgeCold: has("#hud-edge-cold", "shown"),
          edgeDanger: has("#hud-edge-danger", "shown"),
          blinkHealth: has("#hud-health", "blink"),
          blinkTemperature: has("#hud-temperature", "blink"),
          blinkThirst: has("#hud-thirst", "blink"),
          damageShown: visible("#hud-damage"),
          damageText: document.querySelector("#hud-damage span:last-child")?.textContent ?? "",
          icons: document.querySelectorAll("#hud .ui-icon svg").length,
        };
      });
    };
    const hudCalm = await hudAt("seed=1&timescale=0&at=360,600&face=0");
    const hudEast = await hudAt("seed=1&timescale=0&at=360,600&face=90");
    check(
      "the compass shows north ahead when facing north, and the shelter a little to the left",
      hudCalm.north === "N" && !hudCalm.northHidden && Math.abs(hudCalm.northLeft - 50) < 0.5 && hudCalm.compass.shelterBeyond === 0 &&
        hudCalm.compass.shelterOffset < -0.05 && hudCalm.compass.shelterOffset > -0.3 && hudCalm.markLeft < 50 && !hudCalm.markArrowLeft,
      `north at ${hudCalm.northLeft}%, shelter at ${hudCalm.compass.shelterOffset.toFixed(2)} (${hudCalm.markLeft}%)`,
    );
    check(
      "facing east, north is at the left end and the shelter, behind, is held there with an arrow",
      Math.abs(hudEast.compass.heading - 90) < 0.5 && Math.abs(hudEast.northLeft - 5) < 0.5 && hudEast.compass.shelterBeyond === -1 && hudEast.markArrowLeft,
      `heading ${hudEast.compass.heading.toFixed(0)}, north at ${hudEast.northLeft}%, beyond ${hudEast.compass.shelterBeyond}`,
    );
    check(
      "in calm weather and good shape the HUD shows no warning, edge or blinking bar",
      hudCalm.storm === "none" && !hudCalm.stormShown && hudCalm.edges.length === 0 && hudCalm.blinking.length === 0 && !hudCalm.damageShown && !hudCalm.marked && hudCalm.icons >= 5,
      `${hudCalm.icons} icons`,
    );
    const hudWarned = await hudAt("seed=1&storm=warning&at=360,600", () => window.__game.hud.stormRemaining > 0 && window.__game.hud.stormRemaining < 0.9);
    await page.screenshot({ path: join(outDir, "hud-warning.png") });
    check(
      "a coming storm is announced with a bar that runs down, and the shelter is marked on the compass",
      hudWarned.storm === "warning" && hudWarned.stormShown && !hudWarned.stormRed && hudWarned.stormText === "Storm approaching" &&
        hudWarned.stormFill > 0 && hudWarned.stormFill < 90 && hudWarned.marked && !hudWarned.edgeStorm,
      `"${hudWarned.stormText}", bar ${hudWarned.stormFill}%`,
    );
    const hudStorm = await hudAt("seed=1&storm=now&at=360,600&health=40", () => window.__game.player.health <= 30);
    await page.screenshot({ path: join(outDir, "hud-storm.png") });
    const hudStormInside = await hudAt("seed=1&storm=now&at=280,282", () => window.__game.weather.intensity >= 1);
    check(
      "in the storm the warning turns red, the edges cloud, and the health bar names the storm and blinks",
      hudStorm.storm === "storm" && hudStorm.stormRed && hudStorm.stormText === "Storm" && hudStorm.edgeStorm && hudStorm.edgeDanger &&
        hudStorm.blinkHealth && hudStorm.damageShown && hudStorm.damageText === "Storm",
      `"${hudStorm.stormText}", edges ${hudStorm.edges.join("+")}, damage "${hudStorm.damageText}"`,
    );
    check(
      "indoors the storm clouds no edges and hurts nobody",
      hudStormInside.storm === "storm" && !hudStormInside.edgeStorm && !hudStormInside.damageShown && !hudStormInside.blinkHealth,
      `edges ${hudStormInside.edges.join("+") || "none"}`,
    );
    const hudCold = await hudAt("seed=1&time=22:00&timescale=0&temperature=-60&thirst=10&at=360,600");
    await page.screenshot({ path: join(outDir, "hud-cold.png") });
    check(
      "cold turns the edges blue and blinks the temperature bar; low thirst blinks the thirst bar",
      hudCold.edgeCold && hudCold.blinkTemperature && hudCold.blinkThirst && !hudCold.edgeDanger && !hudCold.blinkHealth && !hudCold.edgeStorm,
      `edges ${hudCold.edges.join("+")}, blinking ${hudCold.blinking.join("+")}`,
    );
    const hudKorean = await hudAt("seed=1&storm=warning&lang=ko&at=360,600&face=0");
    check("the HUD's warning and compass are in Korean too", hudKorean.stormText === "폭풍이 다가옵니다" && hudKorean.north === "북", `"${hudKorean.stormText}", "${hudKorean.north}"`);
    // Footsteps: about one every 2.6 m while walking (12 m/s), none while standing.
    await page.goto(gameUrl("at=360,600&face=0"), { waitUntil: "load" });
    await page.waitForFunction(() => window.__game?.ready === true && window.__game.player.grounded, undefined, { timeout: READY_TIMEOUT_MS });
    await page.waitForTimeout(500);
    const stepsStanding = await page.evaluate(() => ({ steps: window.__game.audio.footsteps, sim: window.__game.simSeconds }));
    await page.keyboard.down("KeyW");
    await page.waitForFunction((sim) => window.__game.simSeconds > sim + 2, stepsStanding.sim, { timeout: 60_000 });
    await page.keyboard.up("KeyW");
    const stepsWalked = await page.evaluate(() => window.__game.audio.footsteps);
    await page.waitForTimeout(500);
    const stepsAfter = await page.evaluate(() => window.__game.audio.footsteps);
    check(
      "footsteps sound while walking and not while standing",
      stepsStanding.steps === 0 && stepsWalked >= 6 && stepsWalked <= 14 && stepsAfter - stepsWalked <= 1,
      `${stepsStanding.steps} standing, ${stepsWalked} in 2 s of walking, ${stepsAfter - stepsWalked} after stopping`,
    );

    // `?mute` starts without sound, and the development panel switches it back on.
    const mutedSound = await audioAt("mute");
    await page.locator("#dev-open").waitFor({ state: "visible", timeout: 10_000 });
    await page.keyboard.press("F2");
    await page.locator("#dev-audio-on").click();
    const unmuted = await page.evaluate(() => window.__game.audio.muted);
    const panelAudio = await page.locator("#dev-audio-now").innerText();
    await page.locator("#dev-audio-off").click();
    const mutedAgain = await page.evaluate(() => window.__game.audio.muted);
    await page.keyboard.press("F2");
    check("?mute starts without sound and the panel switches it on and off", mutedSound.muted && !unmuted && mutedAgain, `panel "${panelAudio}"`);

    // `?props=` picks the set from the address as well.
    await page.goto(gameUrl("props=boxes"), { waitUntil: "load" });
    await page.waitForFunction(() => window.__game?.ready === true, undefined, { timeout: READY_TIMEOUT_MS });
    const boxed = await page.evaluate(() => ({ ...window.__game.zone }));
    check("?props=boxes draws props and rocks as plain shapes", boxed.propModels === 0 && boxed.rockModels === false, `${boxed.propModels} models`);

    // Interaction: standing by a container and looking its way makes it the target, and the
    // middle of the screen says what E would do. The spot is in front of the crate by the well.
    const interactionNow = () =>
      page.evaluate(() => ({
        target: window.__game.player.interaction,
        crosshair: window.__game.hud.crosshair,
        prompt: window.__game.hud.prompt,
        inside: window.__game.player.inside,
        containers: window.__game.zone.containers,
        interactables: window.__game.zone.interactables,
        promptShown: !document.querySelector("#hud-prompt").hidden && !document.querySelector("#hud-aim").hidden,
        promptText: document.querySelector("#hud-prompt").textContent,
        keyText: document.querySelector("#hud-prompt .ui-key")?.textContent ?? "",
        ringShown: !document.querySelector("#hud-aim .ui-ring").hidden,
      }));
    const settle = async () => {
      const tick = await page.evaluate(() => window.__game.tick);
      await page.waitForFunction((from) => window.__game.tick > from + 3, tick, { timeout: 10_000 });
    };
    const interactionAt = async (query) => {
      await page.goto(gameUrl(query), { waitUntil: "load" });
      await page.waitForFunction(() => window.__game?.ready === true && window.__game.player.grounded, undefined, { timeout: READY_TIMEOUT_MS });
      await settle();
      return interactionNow();
    };
    const facingCrate = await interactionAt("lang=en&at=406.26,115.48&face=350");
    check("the zone has its 14 containers and the hatch to the shelter, each something to interact with", facingCrate.containers === 14 && facingCrate.interactables === 15, `${facingCrate.containers} containers, ${facingCrate.interactables} targets`);
    check(
      "standing by a crate and looking at it makes it the target",
      facingCrate.target === "well_crate" && facingCrate.crosshair === "target" && facingCrate.prompt === "search",
      `target ${facingCrate.target}, crosshair ${facingCrate.crosshair}`,
    );
    check(
      "the prompt under the dot names the key and what it does",
      facingCrate.promptShown && facingCrate.keyText === "E" && facingCrate.promptText === "E Search (hold)" && !facingCrate.ringShown,
      `"${facingCrate.promptText}", key "${facingCrate.keyText}"`,
    );
    await page.screenshot({ path: join(outDir, "interaction.png") });
    // A window takes the keys, so the dot and the prompt go.
    await page.keyboard.press("F4");
    await page.waitForFunction(() => window.__game.ui.window === "sample", undefined, { timeout: 5_000 }).catch(() => {});
    await settle();
    const behindWindow = await interactionNow();
    await page.keyboard.press("F4");
    check("the dot and the prompt are hidden while a window is open", behindWindow.crosshair === "hidden" && !behindWindow.promptShown, `crosshair ${behindWindow.crosshair}`);
    // Walking away loses the target.
    await page.keyboard.down("KeyS");
    await page.waitForFunction(() => window.__game.player.interaction === null, undefined, { timeout: 20_000 }).catch(() => {});
    await page.keyboard.up("KeyS");
    const walkedAway = await interactionNow();
    check("walking away loses the target and the prompt", walkedAway.target === null && walkedAway.crosshair === "idle" && !walkedAway.promptShown, `target ${walkedAway.target}`);
    const backToCrate = await interactionAt("at=406.26,115.48&face=170");
    check("with the back turned to the crate there is no target", backToCrate.target === null && backToCrate.crosshair === "idle" && !backToCrate.promptShown, `target ${backToCrate.target}`);
    // Outside house A's west wall, a step from the cabinet that stands against its inside.
    const throughWall = await interactionAt("at=275.4,279&face=90");
    check("a cabinet is not reached through the wall from outside", throughWall.target === null && throughWall.inside === null && !throughWall.promptShown, `target ${throughWall.target}`);
    const promptKorean = await interactionAt("lang=ko&at=406.26,115.48&face=350");
    check("the prompt is in Korean too", promptKorean.promptText === "E 수색 (누르고 있기)" && promptKorean.keyText === "E", `"${promptKorean.promptText}"`);
    // The development panel goes to a spot in front of any container: a trunk and a cabinet.
    await page.locator("#dev-open").waitFor({ state: "visible", timeout: 10_000 });
    await page.keyboard.press("F2");
    await page.locator("#dev-place-car_line_trunk").click();
    await settle();
    const atTrunk = await interactionNow();
    await page.locator("#dev-place-house_a_cabinet_back").click();
    await settle();
    const atCabinet = await interactionNow();
    await page.keyboard.press("F2");
    check("the panel goes to a car's trunk, which is then the target", atTrunk.target === "car_line_trunk", `target ${atTrunk.target}`);
    check(
      "the panel goes to a cabinet inside house A, which is then the target",
      atCabinet.target === "house_a_cabinet_back" && atCabinet.inside === "house_a",
      `target ${atCabinet.target}, inside ${atCabinet.inside}`,
    );
    await page.screenshot({ path: join(outDir, "interaction-cabinet.png") });

    // The bag: `?bag` fills it, the HUD says how full it is, Tab opens the window that shows
    // what is in it, and the window and the panel change it through commands.
    const bagNow = () =>
      page.evaluate(() => ({
        bag: window.__game.player.bag.map((slot) => (slot ? `${slot.item} ${slot.count}` : "-")),
        full: window.__game.player.bagFull,
        commands: { ...window.__game.commands },
        window: window.__game.ui.window,
        sign: document.querySelector("#hud-bag > span:not(.ui-icon)").textContent,
        signFull: document.querySelector("#hud-bag").classList.contains("full"),
        oldSlots: document.querySelectorAll("#hud-bag .hud-slot").length,
        slots: [...document.querySelectorAll("#bag-window .bag-slot")].map((slot) =>
          slot.classList.contains("empty") ? "-" : `${slot.dataset.item} ${slot.querySelector(".bag-slot-count").textContent}`,
        ),
        selected: [...document.querySelectorAll("#bag-window .bag-slot")].findIndex((slot) => slot.classList.contains("selected")),
        names: [...document.querySelectorAll("#bag-window .bag-slot:not(.empty) .bag-slot-name")].map((name) => name.textContent),
        icons: [...document.querySelectorAll("#bag-window .bag-slot:not(.empty) .ui-icon")].map((icon) => icon.dataset.icon),
        overflow: [...document.querySelectorAll("#bag-window .bag-slot-name")].some((name) => name.scrollWidth > name.parentElement.clientWidth),
        count: document.querySelector("#bag-window .bag-count")?.textContent ?? "",
        name: document.querySelector("#bag-window .bag-name")?.textContent ?? "",
        description: document.querySelector("#bag-window .bag-description")?.textContent ?? "",
        discardDisabled: document.querySelector("#bag-discard")?.disabled ?? null,
      }));
    const bagAt = async (query) => {
      await page.goto(gameUrl(query), { waitUntil: "load" });
      await page.waitForFunction(() => window.__game?.ready === true && window.__game.player.grounded, undefined, { timeout: READY_TIMEOUT_MS });
      await settle();
      return bagNow();
    };
    const toggleBag = async (shouldOpen) => {
      await page.keyboard.press("Tab");
      await page.waitForFunction((open) => (window.__game.ui.window === "bag") === open, shouldOpen, { timeout: 5_000 }).catch(() => {});
      await settle();
    };
    const emptyBag = await bagAt("lang=en");
    check("the bag starts empty and the HUD says so, without showing its slots", emptyBag.bag.length === 8 && emptyBag.sign === "Tab Bag 0 / 8" && emptyBag.oldSlots === 0 && !emptyBag.signFull && emptyBag.window === null, `"${emptyBag.sign}"`);
    await toggleBag(true);
    const emptyWindow = await bagNow();
    check("Tab opens the bag window, which says an empty bag is empty", emptyWindow.window === "bag" && emptyWindow.slots.length === 8 && emptyWindow.slots.every((slot) => slot === "-") && emptyWindow.name === "The bag is empty." && emptyWindow.discardDisabled === true, `"${emptyWindow.name}"`);
    await toggleBag(false);
    check("Tab closes it again", (await bagNow()).window === null);

    const startBag = await bagAt("lang=en&bag=scrap:7,water_bottle:2,bandage");
    const expectedBag = ["scrap 5", "scrap 2", "water_bottle 2", "bandage 1", "-", "-", "-", "-"];
    check("?bag fills the bag, stacking up to each item's limit", startBag.bag.join() === expectedBag.join() && startBag.sign === "Tab Bag 4 / 8", `${startBag.bag.join(" | ")}, "${startBag.sign}"`);
    await toggleBag(true);
    const opened = await bagNow();
    check(
      "the bag window shows what is in the bag: icon, name and count",
      opened.slots.join() === expectedBag.join() && opened.names.join() === "Scrap,Scrap,Water,Bandage" && opened.icons.join() === "scrap,scrap,water-bottle,bandage" && !opened.overflow && opened.count === "4 / 8",
      `${opened.slots.join(" | ")} / ${opened.names.join(",")}`,
    );
    check("the first slot is selected and described", opened.selected === 0 && opened.name === "Scrap" && opened.description.includes("Repair material"), `"${opened.name}": "${opened.description}"`);
    await page.screenshot({ path: join(outDir, "bag.png") });
    // Arrow keys move through the grid: right twice, then down and back up.
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    const onWater = await bagNow();
    await page.keyboard.press("ArrowDown");
    const onEmpty = await bagNow();
    await page.keyboard.press("ArrowUp");
    check("arrow keys move the selection through the grid", onWater.selected === 2 && onWater.name === "Water bottle" && onEmpty.selected === 6 && onEmpty.name === "Empty slot" && onEmpty.discardDisabled === true, `${onWater.selected} "${onWater.name}", ${onEmpty.selected} "${onEmpty.name}"`);
    // The game runs on behind the window, and W still walks.
    const behind = await page.evaluate(() => ({ sim: window.__game.simSeconds, z: window.__game.player.z, hour: window.__game.clock.hour }));
    await page.keyboard.down("KeyW");
    await page.waitForFunction((sim) => window.__game.simSeconds > sim + 0.5, behind.sim, { timeout: 30_000 });
    await page.keyboard.up("KeyW");
    const walked = await page.evaluate(() => ({ z: window.__game.player.z, hour: window.__game.clock.hour, window: window.__game.ui.window }));
    check("the game goes on behind the bag window", walked.window === "bag" && walked.hour > behind.hour && Math.abs(walked.z - behind.z) > 1, `moved ${Math.abs(walked.z - behind.z).toFixed(1)} m`);
    // X throws one out of the selected slot (the water), through a command.
    const before = (await bagNow()).commands.done;
    await page.keyboard.press("KeyX");
    await page.waitForFunction((done) => window.__game.commands.done > done, before, { timeout: 10_000 }).catch(() => {});
    await settle();
    const discarded = await bagNow();
    check("X discards one from the selected slot, and the window follows", discarded.bag[2] === "water_bottle 1" && discarded.slots[2] === "water_bottle 1" && discarded.commands.last?.type === "discardItem", discarded.slots.join(" | "));
    await page.locator("#bag-discard").click();
    await page.waitForFunction((done) => window.__game.commands.done > done + 1, before, { timeout: 10_000 }).catch(() => {});
    await settle();
    const discardedAll = await bagNow();
    check("the Discard button does the same; an emptied slot stays where it is", discardedAll.bag.join() === ["scrap 5", "scrap 2", "-", "bandage 1", "-", "-", "-", "-"].join() && discardedAll.slots[2] === "-" && discardedAll.sign === "Tab Bag 3 / 8" && discardedAll.discardDisabled === true, discardedAll.slots.join(" | "));
    await page.screenshot({ path: join(outDir, "bag-empty-slot.png") });
    const discardLook = await page.evaluate(() => {
      const style = getComputedStyle(document.querySelector("#bag-discard"));
      return { opacity: Number(style.opacity), border: style.borderTopStyle };
    });
    check("the Discard button is plainly dimmed over an empty slot", discardLook.opacity <= 0.3 && discardLook.border === "dashed", `opacity ${discardLook.opacity}, border ${discardLook.border}`);
    // The window stands to the right of the middle, clear of the character.
    const placed = await page.evaluate(() => {
      const box = document.querySelector('[data-window="bag"]').getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, width: window.innerWidth, height: window.innerHeight };
    });
    check("the bag window stands top right, clear of the middle of the screen", placed.left > placed.width * 0.6 && placed.right <= placed.width && placed.top < placed.height * 0.25, `left ${Math.round(placed.left)} of ${placed.width}, top ${Math.round(placed.top)}`);
    // Space still jumps with the bag open; Enter does nothing.
    const groundedBefore = await page.evaluate(() => window.__game.player.y);
    await page.keyboard.press("Enter");
    await page.keyboard.down("Space");
    await page.waitForFunction((y) => window.__game.player.y > y + 0.3, groundedBefore, { timeout: 10_000 }).catch(() => {});
    await page.keyboard.up("Space");
    const afterSpace = await page.evaluate(() => ({ y: window.__game.player.y, window: window.__game.ui.window }));
    await page.waitForFunction(() => window.__game.player.grounded, undefined, { timeout: 10_000 }).catch(() => {});
    check("Space jumps with the bag open, and the bag stays open", afterSpace.window === "bag" && afterSpace.y > groundedBefore + 0.3, `rose ${(afterSpace.y - groundedBefore).toFixed(2)} m`);
    // The panel gives through commands; the open window follows.
    await page.locator("#dev-open").waitFor({ state: "visible", timeout: 10_000 });
    await page.keyboard.press("F2");
    await page.locator("#dev-bag-give-scrap").click();
    await page.locator("#dev-bag-give-tape").click();
    await page.waitForFunction((done) => window.__game.commands.done >= done + 4, before, { timeout: 10_000 }).catch(() => {});
    await settle();
    const given = await bagNow();
    const panelBag = await page.locator("#dev-bag-now").innerText();
    check(
      "the panel gives items: a stack is topped up first, then the first empty slot is used",
      given.bag.join() === ["scrap 5", "scrap 3", "tape 1", "bandage 1", "-", "-", "-", "-"].join() && given.slots.join() === given.bag.join() && panelBag === "4 / 8",
      `${given.bag.join(" | ")}, panel "${panelBag}"`,
    );
    await page.locator("#dev-bag-empty").click();
    await page.waitForFunction(() => window.__game.player.bag.every((slot) => slot === null), undefined, { timeout: 10_000 }).catch(() => {});
    await settle();
    const emptied = await bagNow();
    await page.keyboard.press("F2");
    await page.keyboard.press("Escape");
    await settle();
    check("the panel empties the bag, and Escape closes the window", emptied.slots.every((slot) => slot === "-") && emptied.sign === "Tab Bag 0 / 8" && (await bagNow()).window === null, emptied.slots.join(" | "));

    // Eight slots in use is full: the sign turns orange, and a ninth kind of stack is refused.
    const fullBag = await bagAt("lang=ko&bag=scrap:5,scrap:5,cloth:5,cloth:1,tape:1,water_bottle:3,water_bottle:1,bandage:1");
    check("a bag with no empty slot is marked as full on the HUD", fullBag.full && fullBag.signFull && fullBag.sign === "Tab 가방 8 / 8", `"${fullBag.sign}"`);
    await toggleBag(true);
    const fullWindow = await bagNow();
    check("the names in the window are in Korean too and fit", fullWindow.names.join() === "고철,고철,천,천,테이프,물병,물병,붕대" && !fullWindow.overflow && fullWindow.name === "고철", fullWindow.names.join(","));
    await page.screenshot({ path: join(outDir, "bag-full.png") });
    await toggleBag(false);
    await page.keyboard.press("F2");
    const refusedBefore = fullBag.commands.refused;
    await page.locator("#dev-bag-give-bandage").click();
    await page.locator("#dev-bag-give-tape").click();
    await page.waitForFunction((done) => window.__game.commands.done >= done + 2, fullBag.commands.done, { timeout: 10_000 }).catch(() => {});
    await settle();
    const afterFull = await bagNow();
    check(
      "into a full bag only what tops up a stack goes",
      afterFull.bag[4] === "tape 2" && afterFull.bag[7] === "bandage 2" && afterFull.commands.refused === refusedBefore,
      `${afterFull.bag.join(" | ")}, refused ${afterFull.commands.refused}`,
    );
    await page.locator("#dev-bag-give-scrap").click();
    await page.waitForFunction((done) => window.__game.commands.done > done, afterFull.commands.done, { timeout: 10_000 }).catch(() => {});
    const refused = await bagNow();
    await page.keyboard.press("F2");
    check("an item with no room at all is refused and the bag stays as it was", refused.commands.refused === refusedBefore + 1 && refused.commands.last?.reason === "bag_full" && refused.bag.join() === afterFull.bag.join(), `last ${JSON.stringify(refused.commands.last)}`);
    // Behind the title screen there is no bag to open.
    await page.goto(url, { waitUntil: "load" });
    await page.waitForFunction(() => window.__game?.ready === true, undefined, { timeout: READY_TIMEOUT_MS });
    await page.keyboard.press("Tab");
    await page.waitForTimeout(300);
    check("Tab does not open the bag behind the title screen", (await page.evaluate(() => window.__game.ui.window)) === null);

    {
    // Searching: holding E at a container opens it after a moment, its panel shows what is in
    // it, and E and F take. `?seed=1` fixes the contents; the trunk of the introduction is
    // always the same anyway. The spot is found with the panel's place button.
    const lootNow = () =>
      page.evaluate(() => ({
        target: window.__game.player.interaction,
        search: { ...window.__game.player.search },
        prompt: window.__game.hud.prompt,
        promptText: document.querySelector("#hud-prompt").textContent,
        ringShown: !document.querySelector("#hud-aim .ui-ring").hidden,
        window: window.__game.ui.window,
        panel: window.__game.containers.panel,
        containers: JSON.parse(JSON.stringify(window.__game.containers.byId)),
        bag: window.__game.player.bag.map((slot) => (slot ? `${slot.item} ${slot.count}` : "-")),
        title: document.querySelector('[data-window="container"] .ui-title')?.textContent ?? "",
        rows: [...document.querySelectorAll("#container-panel .container-row")].map(
          (row) => `${row.querySelector(".container-row-name").textContent} ${row.querySelector(".container-row-count").textContent}`,
        ),
        selectedRow: [...document.querySelectorAll("#container-panel .container-row")].findIndex((row) => row.classList.contains("selected")),
        unfit: [...document.querySelectorAll("#container-panel .container-row.unfit")].length,
        note: document.querySelector("#container-panel .container-note")?.textContent ?? "",
        bagLine: document.querySelector("#container-panel .container-bag")?.textContent ?? "",
        last: window.__game.commands.last,
      }));
    const goToContainer = async (id) => {
      await page.locator("#dev-open").waitFor({ state: "visible", timeout: 10_000 });
      await page.keyboard.press("F2");
      await page.locator(`#dev-place-${id}`).click();
      await page.keyboard.press("F2");
      await page.waitForFunction((target) => window.__game.player.interaction === target && window.__game.player.grounded, id, { timeout: 10_000 }).catch(() => {});
      await settle();
    };
    const lootAt = async (query, id) => {
      await page.goto(gameUrl(query), { waitUntil: "load" });
      await page.waitForFunction(() => window.__game?.ready === true && window.__game.player.grounded, undefined, { timeout: READY_TIMEOUT_MS });
      await goToContainer(id);
      return lootNow();
    };
    const INTRO_TRUNK = "car_line_second_trunk";
    const atIntro = await lootAt("lang=en&seed=1", INTRO_TRUNK);
    check("a container not yet searched asks for E to be held", atIntro.target === INTRO_TRUNK && atIntro.prompt === "search" && atIntro.containers[INTRO_TRUNK].opened === false, `prompt ${atIntro.prompt}`);
    check("the trunk the introduction leads to holds two cloth and a water bottle", atIntro.containers[INTRO_TRUNK].items.join() === "cloth 2,water_bottle 1", atIntro.containers[INTRO_TRUNK].items.join());
    const allItems = Object.values(atIntro.containers).flatMap((container) => container.items);
    const totalOf = (item) => allItems.filter((entry) => entry.startsWith(`${item} `)).reduce((sum, entry) => sum + Number(entry.split(" ")[1]), 0);
    check("the containers hold what the repair needs", totalOf("scrap") >= 15 && totalOf("cloth") >= 8 && totalOf("tape") >= 3 && Object.keys(atIntro.containers).length === 14, `scrap ${totalOf("scrap")}, cloth ${totalOf("cloth")}, tape ${totalOf("tape")}`);

    // A short hold is not a search: the ring fills, and letting go starts over.
    const simAtPress = await page.evaluate(() => window.__game.simSeconds);
    await page.keyboard.down("KeyE");
    await page.waitForFunction(() => window.__game.player.search.progress > 0.2, undefined, { timeout: 20_000 }).catch(() => {});
    const midSearch = await lootNow();
    await page.keyboard.up("KeyE");
    await settle();
    const letGo = await lootNow();
    check("holding E fills the ring; letting go early cancels the search", midSearch.search.target === INTRO_TRUNK && midSearch.ringShown && midSearch.window === null && letGo.search.progress === 0 && !letGo.ringShown && letGo.containers[INTRO_TRUNK].opened === false, `progress ${midSearch.search.progress.toFixed(2)}`);
    // Moving cancels it too.
    await page.keyboard.down("KeyE");
    await page.waitForFunction(() => window.__game.player.search.progress > 0.2, undefined, { timeout: 20_000 }).catch(() => {});
    await page.keyboard.down("KeyA");
    await page.waitForFunction(() => window.__game.player.search.progress === 0, undefined, { timeout: 10_000 }).catch(() => {});
    await page.keyboard.up("KeyA");
    await page.keyboard.up("KeyE");
    await settle();
    const moved = await lootNow();
    check("moving cancels the search", moved.search.progress === 0 && moved.containers[INTRO_TRUNK].opened === false && moved.window === null);
    await goToContainer(INTRO_TRUNK);

    // Held for the full time, the container opens and its panel comes up.
    const simBefore = await page.evaluate(() => window.__game.simSeconds);
    await page.keyboard.down("KeyE");
    await page.waitForFunction(() => window.__game.containers.panel !== null, undefined, { timeout: 30_000 }).catch(() => {});
    const simAfter = await page.evaluate(() => window.__game.simSeconds);
    // E is still down: it must not take anything.
    await settle();
    await settle();
    const opened = await lootNow();
    await page.keyboard.up("KeyE");
    check(
      "holding E for 1.5 seconds opens the container and shows its panel",
      opened.panel === INTRO_TRUNK && opened.window === "container" && opened.containers[INTRO_TRUNK].opened === true && simAfter - simBefore >= 1.45 && simAfter - simBefore < 2.5 && simAtPress > 0,
      `${(simAfter - simBefore).toFixed(2)} s`,
    );
    check("the panel names the container and lists what is in it", opened.title === "Car trunk" && opened.rows.join() === "Cloth x2,Water bottle x1" && opened.selectedRow === 0 && opened.bagLine === "Bag 0 / 8", `"${opened.title}": ${opened.rows.join(", ")}`);
    check("the E that searched does not also take", opened.bag.every((slot) => slot === "-") && opened.containers[INTRO_TRUNK].items.length === 2);
    await page.screenshot({ path: join(outDir, "container.png") });
    // Down to the water, take it with E; then F takes the rest and the panel closes.
    await page.keyboard.press("ArrowDown");
    const onWaterRow = await lootNow();
    await page.keyboard.press("KeyE");
    await page.waitForFunction(() => window.__game.player.bag.some((slot) => slot?.item === "water_bottle"), undefined, { timeout: 10_000 }).catch(() => {});
    await settle();
    const tookWater = await lootNow();
    check("the arrow keys select an entry and E takes it", onWaterRow.selectedRow === 1 && tookWater.bag[0] === "water_bottle 1" && tookWater.rows.join() === "Cloth x2" && tookWater.panel === INTRO_TRUNK && tookWater.last?.type === "takeItem", `${tookWater.bag[0]}, left ${tookWater.rows.join()}`);
    await page.keyboard.press("KeyF");
    await page.waitForFunction(() => window.__game.containers.panel === null, undefined, { timeout: 10_000 }).catch(() => {});
    await settle();
    const tookAll = await lootNow();
    check(
      "F takes everything, the panel closes and the container says it is empty",
      tookAll.bag.slice(0, 2).join() === "water_bottle 1,cloth 2" && tookAll.panel === null && tookAll.window === null && tookAll.containers[INTRO_TRUNK].items.length === 0 && tookAll.prompt === "empty" && tookAll.promptText === "Empty",
      `${tookAll.bag.slice(0, 3).join(" | ")}, prompt "${tookAll.promptText}"`,
    );
    // An emptied container cannot be opened again.
    await page.keyboard.down("KeyE");
    await page.waitForTimeout(600);
    await page.keyboard.up("KeyE");
    const emptyAgain = await lootNow();
    check("an emptied container does not open again", emptyAgain.panel === null && emptyAgain.search.progress === 0);
    await page.screenshot({ path: join(outDir, "container-opened.png") });

    // A cabinet indoors: open it, close it with Escape, and open it again with one press.
    const firstCabinet = Object.keys(atIntro.containers).find((id) => id.includes("cabinet") && atIntro.containers[id].items.length > 0);
    await goToContainer(firstCabinet);
    await page.keyboard.down("KeyE");
    await page.waitForFunction(() => window.__game.containers.panel !== null, undefined, { timeout: 30_000 }).catch(() => {});
    await page.keyboard.up("KeyE");
    await settle();
    const cabinetOpen = await lootNow();
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => window.__game.containers.panel === null, undefined, { timeout: 10_000 }).catch(() => {});
    await settle();
    const cabinetClosed = await lootNow();
    check("Escape closes the panel and leaves the contents; the prompt then says Open", cabinetOpen.title === "Cabinet" && cabinetClosed.panel === null && cabinetClosed.prompt === "open" && cabinetClosed.promptText === "E Open" && cabinetClosed.containers[firstCabinet].items.length > 0, `prompt "${cabinetClosed.promptText}"`);
    await page.keyboard.press("KeyE");
    await page.waitForFunction(() => window.__game.containers.panel !== null, undefined, { timeout: 10_000 }).catch(() => {});
    const reopened = await lootNow();
    check("a container searched before opens again with one press", reopened.panel === firstCabinet);
    // Walking away closes the panel.
    await page.keyboard.down("KeyS");
    await page.waitForFunction(() => window.__game.containers.panel === null, undefined, { timeout: 20_000 }).catch(() => {});
    await page.keyboard.up("KeyS");
    const walkedOff = await lootNow();
    check("walking away from the container closes its panel", walkedOff.panel === null && walkedOff.containers[firstCabinet].items.length > 0);

    // The bag and a container's panel stand open side by side: a container can be searched
    // with the bag open, and each keeps its own keys.
    await goToContainer(firstCabinet);
    await page.keyboard.press("Tab");
    await page.waitForFunction(() => window.__game.ui.windows.includes("bag"), undefined, { timeout: 5_000 }).catch(() => {});
    await settle();
    const bagOnly = await page.evaluate(() => ({ windows: window.__game.ui.windows, prompt: window.__game.hud.prompt, crosshair: window.__game.hud.crosshair }));
    check("with only the bag open the prompt at a container still shows", bagOnly.windows.join() === "bag" && bagOnly.prompt === "open" && bagOnly.crosshair === "target", `windows ${bagOnly.windows.join()}, prompt ${bagOnly.prompt}`);
    await page.keyboard.press("KeyE");
    await page.waitForFunction(() => window.__game.containers.panel !== null, undefined, { timeout: 10_000 }).catch(() => {});
    await settle();
    await page.waitForTimeout(300);
    const both = await page.evaluate(() => {
      const box = (id) => document.querySelector(`[data-window="${id}"]`)?.getBoundingClientRect();
      const container = box("container");
      const bag = box("bag");
      return {
        windows: window.__game.ui.windows,
        apart: container && bag ? container.right <= bag.left + 1 : false,
        inView: container && bag ? container.left > window.innerWidth * 0.4 && bag.right <= window.innerWidth : false,
        left: container ? Math.round(container.left) : -1,
      };
    });
    check("a container opens with the bag open, and the two stand side by side", both.windows.join() === "container,bag" && both.apart && both.inView, `windows ${both.windows.join()}, container from x ${both.left}`);
    await page.screenshot({ path: join(outDir, "container-and-bag.png") });
    const sideBySide = () =>
      page.evaluate(() => ({
        row: [...document.querySelectorAll("#container-panel .container-row")].findIndex((row) => row.classList.contains("selected")),
        rows: document.querySelectorAll("#container-panel .container-row").length,
        slot: [...document.querySelectorAll("#bag-window .bag-slot")].findIndex((slot) => slot.classList.contains("selected")),
        bag: window.__game.player.bag.map((slot) => (slot ? `${slot.item} ${slot.count}` : "-")),
        windows: window.__game.ui.windows,
      }));
    const startSide = await sideBySide();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    const movedSlot = await sideBySide();
    check("side by side, left and right walk through the bag's slots and leave the list alone", startSide.slot === 0 && movedSlot.slot === 4 && movedSlot.row === startSide.row, `slot ${startSide.slot} -> ${movedSlot.slot}`);
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    // X discards from the bag (the water bottle taken earlier is in the first slot), E takes from the container.
    const beforeDiscard = await sideBySide();
    await page.keyboard.press("KeyX");
    await page.waitForFunction(() => window.__game.commands.last?.type === "discardItem", undefined, { timeout: 10_000 }).catch(() => {});
    await settle();
    const afterDiscard = await sideBySide();
    await page.keyboard.press("KeyE");
    await page.waitForFunction(() => window.__game.commands.last?.type === "takeItem", undefined, { timeout: 10_000 }).catch(() => {});
    await settle();
    const afterTake = await sideBySide();
    check(
      "side by side, X discards from the bag and E takes from the container",
      beforeDiscard.bag[0] === "water_bottle 1" && afterDiscard.bag[0] === "-" && afterTake.bag.join() !== afterDiscard.bag.join() && afterTake.windows.includes("bag"),
      `${beforeDiscard.bag.slice(0, 3).join(" | ")} -> ${afterDiscard.bag.slice(0, 3).join(" | ")} -> ${afterTake.bag.slice(0, 3).join(" | ")}`,
    );
    // Tab closes the bag and leaves the panel; Tab again opens the bag beside it; Escape closes the panel first.
    const panelLeft = (await sideBySide()).rows > 0;
    if (panelLeft) {
      await page.keyboard.press("Tab");
      await page.waitForFunction(() => !window.__game.ui.windows.includes("bag"), undefined, { timeout: 5_000 }).catch(() => {});
      const bagShut = (await sideBySide()).windows.join();
      await page.keyboard.press("Tab");
      await page.waitForFunction(() => window.__game.ui.windows.includes("bag"), undefined, { timeout: 5_000 }).catch(() => {});
      const bagBack = (await sideBySide()).windows.join();
      await page.keyboard.press("Escape");
      await page.waitForFunction(() => window.__game.containers.panel === null, undefined, { timeout: 5_000 }).catch(() => {});
      const panelShut = (await sideBySide()).windows.join();
      check("Tab opens and closes the bag beside the panel, and Escape closes the panel first", bagShut === "container" && bagBack === "container,bag" && panelShut === "bag", `${bagShut} / ${bagBack} / ${panelShut}`);
    }
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => window.__game.ui.windows.length === 0, undefined, { timeout: 5_000 }).catch(() => {});

    // A full bag: what does not fit stays in the container, and the panel says why.
    const fullAt = await lootAt("lang=ko&seed=1&bag=scrap:5,scrap:5,scrap:5,scrap:5,scrap:5,scrap:5,scrap:5,cloth:4", INTRO_TRUNK);
    await page.keyboard.down("KeyE");
    await page.waitForFunction(() => window.__game.containers.panel !== null, undefined, { timeout: 30_000 }).catch(() => {});
    await page.keyboard.up("KeyE");
    await settle();
    const fullPanel = await lootNow();
    check("with a full bag the entries that do not fit are dimmed and the panel says the bag is full", fullAt.target === INTRO_TRUNK && fullPanel.title === "차량 트렁크" && fullPanel.unfit === 1 && fullPanel.note === "가방이 가득 찼습니다." && fullPanel.rows.join() === "천 x2,물병 x1", `${fullPanel.rows.join()}, unfit ${fullPanel.unfit}, "${fullPanel.note}"`);
    await page.screenshot({ path: join(outDir, "container-full.png") });
    await page.keyboard.press("KeyF");
    await page.waitForFunction(() => window.__game.commands.last?.type === "takeAll", undefined, { timeout: 10_000 }).catch(() => {});
    await settle();
    const partly = await lootNow();
    check(
      "taking all takes what fits and leaves the rest in the container, with the panel still open",
      partly.bag[7] === "cloth 5" && partly.containers[INTRO_TRUNK].items.join() === "cloth 1,water_bottle 1" && partly.panel === INTRO_TRUNK && partly.unfit === 2,
      `${partly.bag[7]}, left ${partly.containers[INTRO_TRUNK].items.join()}`,
    );
    await page.keyboard.press("Escape");
    // The panel's button fills the containers again and closes them all.
    await page.keyboard.press("F2");
    const openedBefore = await page.locator("#dev-containers-now").innerText();
    await page.locator("#dev-containers-refill").click();
    await settle();
    const refilled = await lootNow();
    await page.keyboard.press("F2");
    check("the panel fills the containers again and closes them", openedBefore.includes("1") && Object.values(refilled.containers).every((container) => !container.opened) && refilled.containers[INTRO_TRUNK].items.length === 2 && refilled.prompt === "search", `was "${openedBefore}"`);
    // Another seed puts the materials elsewhere; the same seed puts them in the same places.
    const contentsWith = async (seed) => {
      await page.goto(gameUrl(`seed=${seed}`), { waitUntil: "load" });
      await page.waitForFunction(() => window.__game?.ready === true, undefined, { timeout: READY_TIMEOUT_MS });
      return page.evaluate(() => JSON.stringify(window.__game.containers.byId));
    };
    const seedOne = await contentsWith(1);
    const seedTwo = await contentsWith(2);
    check("the same seed fills the containers the same way, another seed differently", seedOne === JSON.stringify(atIntro.containers) && seedTwo !== seedOne);

    }

    {
    // Using things: the quick slots start empty, the bag window puts an item on one, the
    // number keys then use it, and the window's own Use does the same. `?health` and
    // `?thirst` start with something to restore.
    const useNow = () =>
      page.evaluate(() => ({
        bag: window.__game.player.bag.map((slot) => (slot ? `${slot.item} ${slot.count}` : "-")),
        quick: window.__game.player.quickSlots.map((slot) => (slot ? `${slot.item} ${slot.count}` : "-")),
        urgent: window.__game.player.quickSlots.map((slot) => slot?.urgent ?? false),
        health: window.__game.player.health,
        thirst: window.__game.player.thirst,
        last: window.__game.commands.last,
        done: window.__game.commands.done,
        hudSlots: [...document.querySelectorAll("#hud-quick .hud-quick-slot")].map((slot) =>
          slot.classList.contains("empty") ? "-" : `${slot.querySelector(".hud-quick-name").textContent} ${slot.querySelector(".hud-quick-count").textContent}`,
        ),
        hudKeys: [...document.querySelectorAll("#hud-quick .ui-key")].map((key) => key.textContent).join(""),
        hudUrgent: [...document.querySelectorAll("#hud-quick .hud-quick-slot")].map((slot) => slot.classList.contains("urgent")),
        badges: [...document.querySelectorAll("#bag-window .bag-slot")].map((slot) => slot.querySelector(".bag-slot-quick").textContent || "-"),
        selected: [...document.querySelectorAll("#bag-window .bag-slot")].findIndex((slot) => slot.classList.contains("selected")),
        quickText: document.querySelector("#bag-window .bag-quick")?.textContent ?? "",
        note: document.querySelector("#bag-window .bag-note")?.textContent ?? "",
        useText: document.querySelector("#bag-use")?.textContent ?? "",
        useDisabled: document.querySelector("#bag-use")?.disabled ?? null,
        hint: document.querySelector("#bag-window .bag-hint")?.textContent ?? "",
        window: window.__game.ui.window,
      }));
    /** Presses a key and waits for the command it gives rise to. */
    const pressForCommand = async (key) => {
      const done = await page.evaluate(() => window.__game.commands.done);
      await page.keyboard.press(key);
      await page.waitForFunction((before) => window.__game.commands.done > before, done, { timeout: 10_000 }).catch(() => {});
      await settle();
      return useNow();
    };
    const openPage = async (query) => {
      await page.goto(gameUrl(query), { waitUntil: "load" });
      await page.waitForFunction(() => window.__game?.ready === true && window.__game.player.grounded, undefined, { timeout: READY_TIMEOUT_MS });
      await settle();
    };
    const tab = async (shouldOpen) => {
      await page.keyboard.press("Tab");
      await page.waitForFunction((open) => (window.__game.ui.window === "bag") === open, shouldOpen, { timeout: 5_000 }).catch(() => {});
      await settle();
    };
    await openPage("lang=en&bag=water_bottle:2,bandage,scrap:2&health=50&thirst=50");
    const atFirst = await useNow();
    check(
      "the four quick slots start with nothing on them and show only their keys",
      atFirst.quick.join() === "-,-,-,-" && atFirst.hudSlots.join() === "-,-,-,-" && atFirst.hudKeys === "1234",
      `${atFirst.hudSlots.join()} keys ${atFirst.hudKeys}`,
    );
    const pressedEmpty = await pressForCommand("Digit1");
    check("a key of a slot with nothing on it uses nothing", pressedEmpty.last?.reason === "empty_quick_slot" && pressedEmpty.bag.join() === atFirst.bag.join(), JSON.stringify(pressedEmpty.last));
    // In the bag window a number puts the chosen item on that slot.
    await tab(true);
    const windowOpen = await useNow();
    check("the bag window offers Use on Enter for a thing that can be used", windowOpen.useText === "Enter Use" && windowOpen.useDisabled === false && windowOpen.hint.startsWith("1-4"), `"${windowOpen.useText}", "${windowOpen.hint}"`);
    const waterOnOne = await pressForCommand("Digit1");
    check(
      "a number in the bag window puts the chosen item on that quick slot",
      waterOnOne.quick.join() === "water_bottle 2,-,-,-" && waterOnOne.hudSlots[0] === "Water 2" && waterOnOne.badges[0] === "1" && waterOnOne.quickText === "Quick slot 1" && waterOnOne.bag.join() === atFirst.bag.join(),
      `${waterOnOne.quick.join()} / hud ${waterOnOne.hudSlots.join()} / badge ${waterOnOne.badges[0]}`,
    );
    await page.keyboard.press("ArrowRight");
    await pressForCommand("Digit2");
    const swapped = await pressForCommand("Digit1");
    check("an item put where another is changes places with it", swapped.quick.join() === "bandage 1,water_bottle 2,-,-" && swapped.badges.slice(0, 2).join() === "2,1", swapped.quick.join());
    const cleared = await pressForCommand("Digit1");
    const backOn = await pressForCommand("Digit1");
    check("the same number again takes the item off its slot", cleared.quick.join() === "-,water_bottle 2,-,-" && cleared.quickText === "" && backOn.quick.join() === "bandage 1,water_bottle 2,-,-", cleared.quick.join());
    // A repair material goes on no slot, and cannot be used.
    await page.keyboard.press("ArrowRight");
    const onScrap = await useNow();
    await page.keyboard.press("Digit3");
    await settle();
    const scrapRefused = await useNow();
    check(
      "a repair material cannot be used or put on a quick slot, and the window says so",
      onScrap.selected === 2 && onScrap.useDisabled === true && onScrap.note.includes("shelter") && scrapRefused.note === "Only things you can use go on a quick slot." && scrapRefused.quick.join() === backOn.quick.join() && scrapRefused.done === backOn.done,
      `"${onScrap.note}" -> "${scrapRefused.note}"`,
    );
    await page.screenshot({ path: join(outDir, "bag-quick.png") });
    // Enter uses the chosen thing.
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    const drank = await pressForCommand("Enter");
    check(
      "Enter in the bag window drinks the water: one fewer, thirst up by 40",
      drank.last?.type === "useItem" && drank.last.ok && drank.bag[0] === "water_bottle 1" && drank.thirst > 85 && drank.thirst <= 90 && drank.hudSlots[1] === "Water 1" && drank.window === "bag",
      `thirst ${drank.thirst.toFixed(1)}, ${drank.bag[0]}`,
    );
    await tab(false);
    // In play the number keys use what is on the slots.
    const drankAgain = await pressForCommand("Digit2");
    check(
      "the slot's key uses the item; with the last one used the slot is empty again",
      drankAgain.last?.type === "useQuickSlot" && drankAgain.last.ok && drankAgain.thirst > 99 && drankAgain.bag[0] === "-" && drankAgain.quick[1] === "-" && drankAgain.hudSlots[1] === "-",
      `thirst ${drankAgain.thirst.toFixed(1)}, slot ${drankAgain.hudSlots[1]}`,
    );
    const noneLeft = await pressForCommand("Digit2");
    const bandaged = await pressForCommand("Digit1");
    check("the key of the emptied slot does nothing", noneLeft.last?.reason === "empty_quick_slot" && noneLeft.thirst <= drankAgain.thirst, JSON.stringify(noneLeft.last));
    check("a bandage gives 30 health back, and its slot empties too", bandaged.last?.ok === true && bandaged.health === 80 && bandaged.quick.join() === "-,-,-,-", `health ${bandaged.health}, ${bandaged.quick.join()}`);
    // Found again, things are put on slots again; with nothing to restore one is not wasted.
    await page.locator("#dev-open").waitFor({ state: "visible", timeout: 10_000 });
    await page.keyboard.press("F2");
    await page.locator("#dev-bag-give-bandage").click();
    await page.locator("#dev-bag-give-water_bottle").click();
    await page.locator("#dev-health-full").click();
    await page.locator("#dev-thirst-20").click();
    await page.waitForFunction((before) => window.__game.commands.done >= before + 2, bandaged.done, { timeout: 10_000 }).catch(() => {});
    await page.keyboard.press("F2");
    await settle();
    // The bandage went into the first slot of the bag and the water into the second.
    await tab(true);
    await pressForCommand("Digit1");
    await page.keyboard.press("ArrowRight");
    await pressForCommand("Digit2");
    await tab(false);
    const found = await useNow();
    check(
      "found and put on slots again, they show the count; low on water, the water's slot is marked out",
      found.quick.join() === "bandage 1,water_bottle 1,-,-" && found.hudSlots.slice(0, 2).join() === "Bandage 1,Water 1" && found.urgent[1] === true && found.hudUrgent[1] === true && found.hudUrgent[0] === false,
      `${found.quick.join()}, urgent ${found.urgent.join()}`,
    );
    await page.screenshot({ path: join(outDir, "quick-slots.png") });
    const wasted = await pressForCommand("Digit1");
    check("at full health a bandage is not used up", wasted.last?.reason === "nothing_to_restore" && wasted.quick[0] === "bandage 1" && wasted.health === 100, JSON.stringify(wasted.last));
    // With the bag open the numbers assign; they do not use.
    await tab(true);
    const assignedNotUsed = await pressForCommand("Digit4");
    await tab(false);
    check("with the bag window open a number key does not use anything", assignedNotUsed.last?.type === "assignQuickSlot" && assignedNotUsed.bag.join() === wasted.bag.join(), JSON.stringify(assignedNotUsed.last));
    // Thrown out to the last one, an item leaves its slot just as when it is used up.
    await tab(true);
    const thrownOut = await pressForCommand("KeyX");
    await tab(false);
    check("the last of an item thrown out leaves its quick slot empty too", thrownOut.last?.type === "discardItem" && assignedNotUsed.quick.join() === "-,water_bottle 1,-,bandage 1" && thrownOut.quick.join() === "-,water_bottle 1,-,-", `${assignedNotUsed.quick.join()} -> ${thrownOut.quick.join()}`);

    // Things thrown out lie at the player's feet in one pile and are picked up again with E.
    const pilesNow = () =>
      page.evaluate(() => ({
        bag: window.__game.player.bag.map((slot) => (slot ? `${slot.item} ${slot.count}` : "-")),
        piles: window.__game.piles.map((pile) => ({ ...pile, items: [...pile.items] })),
        target: window.__game.player.interaction,
        prompt: window.__game.hud.prompt,
        promptText: document.querySelector("#hud-prompt").textContent,
        x: window.__game.player.x,
        z: window.__game.player.z,
        ground: window.__game.player.groundHeight,
        entities: window.__game.entityCount,
        last: window.__game.commands.last,
      }));
    await openPage("lang=ko&bag=scrap:2,cloth:1");
    const beforeDrop = await pilesNow();
    await tab(true);
    await pressForCommand("KeyX");
    const dropped = await pilesNow();
    const pile = dropped.piles[0];
    check(
      "a thing thrown out lies in a pile at the player's feet, on the ground",
      dropped.piles.length === 1 && pile.items.join() === "scrap 1" && Math.hypot(pile.x - dropped.x, pile.z - dropped.z) < 0.1 && Math.abs(pile.y - dropped.ground) < 0.15 && dropped.bag[0] === "scrap 1" && dropped.entities === beforeDrop.entities + 1,
      pile ? `${pile.items.join()} at height ${pile.y.toFixed(2)}, ground ${dropped.ground.toFixed(2)}` : "no pile",
    );
    check("the pile is the target, and the prompt offers to pick it up", pile && dropped.target === pile.id && dropped.prompt === "pickup" && dropped.promptText === "E 줍기", `target ${dropped.target}, "${dropped.promptText}"`);
    await pressForCommand("KeyX");
    await page.keyboard.press("ArrowRight");
    await pressForCommand("KeyX");
    const droppedMore = await pilesNow();
    check("more thrown out in the same place joins the same pile", droppedMore.piles.length === 1 && droppedMore.piles[0].items.join() === "scrap 2,cloth 1" && droppedMore.bag.every((slot) => slot === "-"), droppedMore.piles[0]?.items.join());
    await tab(false);
    await page.screenshot({ path: join(outDir, "pile.png") });
    const pickedUp = await pressForCommand("KeyE");
    const afterPickUp = await pilesNow();
    check(
      "E picks the pile up again: everything is back in the bag and the pile is gone",
      afterPickUp.last?.type === "pickUp" && afterPickUp.last.moved === 3 && afterPickUp.piles.length === 0 && pickedUp.bag.slice(0, 2).join() === "scrap 2,cloth 1" && afterPickUp.target === null && afterPickUp.prompt === null && afterPickUp.entities === beforeDrop.entities,
      `${pickedUp.bag.slice(0, 3).join(" | ")}, piles ${afterPickUp.piles.length}`,
    );
    // The development panel's Empty leaves nothing lying about.
    await page.keyboard.press("F2");
    await page.locator("#dev-bag-empty").click();
    await page.waitForFunction(() => window.__game.player.bag.every((slot) => slot === null), undefined, { timeout: 10_000 }).catch(() => {});
    await page.keyboard.press("F2");
    const emptiedOut = await pilesNow();
    check("the panel's Empty leaves no pile behind", emptiedOut.piles.length === 0 && emptiedOut.bag.every((slot) => slot === "-"));
    }

    {
    // Zones: E at the hatch in house A goes down to the shelter behind a dark picture, the
    // ladder there leads back, and each zone is as it was left.
    const zoneNow = () =>
      page.evaluate(() => ({
        zone: window.__game.zone.id,
        travel: { ...window.__game.travel },
        x: window.__game.player.x,
        z: window.__game.player.z,
        inside: window.__game.player.inside,
        shelter: window.__game.player.shelter,
        health: window.__game.player.health,
        target: window.__game.player.interaction,
        prompt: window.__game.hud.prompt,
        promptText: document.querySelector("#hud-prompt").textContent,
        piles: window.__game.piles.map((pile) => `${pile.id} ${pile.items.join("+")}`),
        interactables: window.__game.zone.interactables,
        compassShown: window.__game.hud.compass.shelterShown,
        markHidden: document.querySelector("#hud-compass-shelter").hidden,
        signShown: !document.querySelector("#hud-shelter").hidden,
        weather: window.__game.weather.phase,
        intensity: window.__game.weather.intensity,
        visibility: window.__game.sky.visibility,
        wallOpacity: window.__game.weather.wallOpacity,
        edges: window.__game.hud.edges,
        stormNotice: window.__game.hud.storm,
        veilShown: document.querySelector("#zone-veil").classList.contains("shown"),
        veilName: document.querySelector("#zone-veil .zone-veil-name").textContent,
        windows: window.__game.ui.windows,
        sim: window.__game.simSeconds,
        hour: window.__game.clock.hour,
        day: window.__game.clock.day,
        dead: window.__game.player.dead,
        phase: window.__game.phase,
        counts: { geometries: window.__game.stats.geometries, textures: window.__game.stats.textures, entities: window.__game.entityCount, bodies: window.__game.bodyCount },
      }));
    const openZonePage = async (query) => {
      await page.goto(gameUrl(query), { waitUntil: "load" });
      await page.waitForFunction(() => window.__game?.ready === true && window.__game.player.grounded, undefined, { timeout: READY_TIMEOUT_MS });
      await settle();
    };
    /** Presses E at an exit and waits until the other zone is up and the picture is back. */
    const goThrough = async (zone) => {
      const before = await zoneNow();
      await page.keyboard.press("KeyE");
      await page.waitForFunction(() => window.__game.travel.state !== "none", undefined, { timeout: 10_000 }).catch(() => {});
      const dark = await zoneNow();
      await page.waitForFunction((id) => window.__game.zone.id === id, zone, { timeout: 10_000 }).catch(() => {});
      const switched = await zoneNow();
      await page.waitForFunction(() => window.__game.travel.state === "none", undefined, { timeout: 10_000 }).catch(() => {});
      await settle();
      const after = await zoneNow();
      return { before, dark, switched, after, seconds: after.sim - before.sim };
    };
    // East of the hatch, looking at it; a thing is thrown out here and stays behind.
    await openZonePage("lang=en&seed=1&at=285,281&face=270&bag=scrap:2");
    await page.keyboard.press("Tab");
    await page.waitForFunction(() => window.__game.ui.window === "bag", undefined, { timeout: 5_000 }).catch(() => {});
    await page.keyboard.press("KeyX");
    await page.waitForFunction(() => window.__game.piles.length === 1, undefined, { timeout: 10_000 }).catch(() => {});
    await page.keyboard.down("KeyW");
    await page.waitForFunction(() => window.__game.player.interaction === "to_shelter", undefined, { timeout: 10_000 }).catch(() => {});
    await page.keyboard.up("KeyW");
    await settle();
    const atHatch = await zoneNow();
    check(
      "the hatch in house A is a target, and the prompt offers the way down",
      atHatch.zone === "dry_riverbed" && atHatch.inside === "house_a" && atHatch.target === "to_shelter" && atHatch.prompt === "travel_shelter" && atHatch.promptText === "E Go down to the shelter" && atHatch.compassShown && !atHatch.markHidden,
      `target ${atHatch.target}, "${atHatch.promptText}"`,
    );
    await page.screenshot({ path: join(outDir, "hatch.png") });
    const down = await goThrough("shelter");
    check(
      "E darkens the picture, closes the bag, and puts the shelter up in place of the riverbed",
      down.dark.travel.state === "closing" && down.dark.veilShown && down.dark.windows.length === 0 && down.switched.zone === "shelter" && down.switched.veilName === "Shelter" && down.after.zone === "shelter" && !down.after.veilShown && down.after.travel.count === 1,
      `${down.dark.travel.state}, veil "${down.switched.veilName}", then ${down.after.zone}`,
    );
    check("the change takes less than two seconds", down.seconds < 2, `${down.seconds.toFixed(2)} s`);
    check(
      "one arrives at the shelter's entry with the ladder behind: sheltered, nothing to use, no shelter mark on the compass",
      Math.abs(down.after.x - 8) < 0.2 && Math.abs(down.after.z - 10) < 0.2 && down.after.shelter === "shelter" && down.after.signShown && down.after.target === null && down.after.interactables === 1 && !down.after.compassShown && down.after.markHidden,
      `at ${down.after.x.toFixed(1)}, ${down.after.z.toFixed(1)}, shelter ${down.after.shelter}, target ${down.after.target}`,
    );
    check("what lies on the ground outside is not in the shelter", down.before.piles.length === 1 && down.after.piles.length === 0, `${down.before.piles.join()} -> ${down.after.piles.join()}`);
    // A storm outside: the clock runs on, the warning shows, and nothing of it gets in.
    await page.locator("#dev-open").waitFor({ state: "visible", timeout: 10_000 });
    await page.keyboard.press("F2");
    await page.locator("#dev-storm-now").click();
    await page.keyboard.press("F2");
    await page.waitForFunction(() => window.__game.weather.intensity > 0.9, undefined, { timeout: 60_000 }).catch(() => {});
    const stormStart = await zoneNow();
    await page.waitForFunction((sim) => window.__game.simSeconds > sim + 2, stormStart.sim, { timeout: 60_000 }).catch(() => {});
    const inStorm = await zoneNow();
    check(
      "in the shelter a storm outside does no harm and is not seen, but the warning says it is there",
      inStorm.weather === "storm" && inStorm.intensity > 0.9 && inStorm.health === 100 && inStorm.visibility > 1000 && inStorm.wallOpacity === 0 && !inStorm.edges.includes("storm") && inStorm.stormNotice === "storm" && inStorm.hour > stormStart.hour,
      `health ${inStorm.health}, visibility ${Math.round(inStorm.visibility)} m, edges ${inStorm.edges.join()}`,
    );
    await page.screenshot({ path: join(outDir, "shelter.png") });
    // Back to the ladder (it is behind: standing at it counts whichever way one looks), and out.
    await page.keyboard.down("KeyS");
    await page.waitForFunction(() => window.__game.player.interaction === "to_riverbed", undefined, { timeout: 10_000 }).catch(() => {});
    await page.keyboard.up("KeyS");
    await settle();
    const atLadder = await zoneNow();
    const up = await goThrough("dry_riverbed");
    check("the ladder offers the way out", atLadder.target === "to_riverbed" && atLadder.promptText === "E Go outside", `"${atLadder.promptText}"`);
    check(
      "one comes up beside the hatch in house A, facing away from it, into the storm that is still blowing",
      up.after.zone === "dry_riverbed" && Math.abs(up.after.x - 282.5) < 0.2 && Math.abs(up.after.z - 281) < 0.2 && up.after.inside === "house_a" && up.after.shelter === "house_a" && up.after.target === null && up.after.weather === "storm" && up.after.visibility < 100 && up.switched.veilName === "Dry Riverbed" && up.seconds < 2,
      `at ${up.after.x.toFixed(1)}, ${up.after.z.toFixed(1)}, target ${up.after.target}, visibility ${Math.round(up.after.visibility)} m, ${up.seconds.toFixed(2)} s`,
    );
    check("what was thrown out is still lying where it was left", up.after.piles.join() === atHatch.piles.join() && up.after.piles.length === 1, up.after.piles.join());
    // Five times there and back: nothing piles up in memory or in the world.
    await page.keyboard.press("F2");
    await page.locator("#dev-storm-calm").click();
    const hop = async (zone) => {
      await page.locator(`#dev-zone-${zone}`).click();
      await page.waitForFunction((id) => window.__game.zone.id === id, zone, { timeout: 10_000 }).catch(() => {});
      await settle();
    };
    await hop("shelter");
    await hop("dry_riverbed");
    const baseline = await zoneNow();
    for (let trip = 0; trip < 5; trip += 1) {
      await hop("shelter");
      await hop("dry_riverbed");
    }
    const afterTrips = await zoneNow();
    await page.keyboard.press("F2");
    check(
      "after five trips to the shelter and back the counts of geometries, textures, entities and bodies have not grown",
      JSON.stringify(afterTrips.counts) === JSON.stringify(baseline.counts) && afterTrips.travel.count === baseline.travel.count + 10 && afterTrips.piles.length === 1,
      `${JSON.stringify(baseline.counts)} -> ${JSON.stringify(afterTrips.counts)}`,
    );
    // The panel's places are the riverbed's: from the shelter they lead outside.
    await page.keyboard.press("F2");
    await hop("shelter");
    await page.locator("#dev-place-house_a_cabinet_back").click();
    await page.waitForFunction(() => window.__game.zone.id === "dry_riverbed", undefined, { timeout: 10_000 }).catch(() => {});
    await settle();
    await page.keyboard.press("F2");
    const placed = await zoneNow();
    check("a place of the riverbed chosen from inside the shelter leads outside", placed.zone === "dry_riverbed" && placed.inside === "house_a" && placed.target === "house_a_cabinet_back", `${placed.zone}, target ${placed.target}`);

    // `?zone=shelter` starts in the shelter. Dying of thirst there, one goes on there; quitting
    // goes back to the title in the zone the game starts in.
    await openZonePage("lang=ko&zone=shelter&thirst=0&health=30&timescale=4");
    const startedIn = await zoneNow();
    check("?zone=shelter starts in the shelter", startedIn.zone === "shelter" && startedIn.shelter === "shelter" && Math.abs(startedIn.x - 8) < 0.2, `${startedIn.zone} at ${startedIn.x.toFixed(1)}, ${startedIn.z.toFixed(1)}`);
    await page.keyboard.down("KeyS");
    await page.waitForFunction(() => window.__game.player.interaction === "to_riverbed", undefined, { timeout: 10_000 }).catch(() => {});
    await page.keyboard.up("KeyS");
    await settle();
    const koreanLadder = await zoneNow();
    check("the prompt at the ladder is in Korean too", koreanLadder.promptText === "E 밖으로 나가기", `"${koreanLadder.promptText}"`);
    await page.waitForFunction(() => window.__game.ui.window === "death", undefined, { timeout: 60_000 }).catch(() => {});
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => !window.__game.player.dead, undefined, { timeout: 10_000 }).catch(() => {});
    await settle();
    const wokeIn = await zoneNow();
    check("whoever collapses in the shelter goes on in the shelter", wokeIn.zone === "shelter" && !wokeIn.dead && wokeIn.health === 100 && wokeIn.day === 2 && Math.abs(wokeIn.z - 10) < 0.5, `${wokeIn.zone}, day ${wokeIn.day}, health ${wokeIn.health}`);
    await openZonePage("lang=en&seed=1");
    await page.keyboard.press("F2");
    await hop("shelter");
    await page.locator("#dev-health-zero").click();
    await page.keyboard.press("F2");
    await page.waitForFunction(() => window.__game.ui.window === "death", undefined, { timeout: 30_000 }).catch(() => {});
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => window.__game.phase === "title", undefined, { timeout: 10_000 }).catch(() => {});
    await settle();
    const quitFrom = await zoneNow();
    check("quitting from the shelter goes back to the title in the riverbed, at the start", quitFrom.phase === "title" && quitFrom.zone === "dry_riverbed" && Math.abs(quitFrom.x - 360) < 1 && Math.abs(quitFrom.z - 619) < 1 && quitFrom.day === 1, `${quitFrom.phase}, ${quitFrom.zone} at ${quitFrom.x.toFixed(0)}, ${quitFrom.z.toFixed(0)}`);
    }

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
    await page.waitForFunction(() => window.__game?.ready === true, undefined, { timeout: READY_TIMEOUT_MS });
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
    check("the sample window shows the progress ring", await sampleWindow.locator("#sample-ring svg").isVisible());

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
    await page.waitForFunction(() => window.__game?.ready === true, undefined, { timeout: READY_TIMEOUT_MS });
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
    await targetPage.waitForFunction(() => window.__game?.ready === true, undefined, { timeout: READY_TIMEOUT_MS });
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
