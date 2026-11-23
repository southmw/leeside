import { describe, expect, it } from "vitest";
import {
  createIntro,
  INTRO_HEALTH_FLOOR,
  INTRO_LOOK_METRES,
  INTRO_LOOK_SECONDS,
  INTRO_PROTECTION_SECONDS,
  INTRO_TIP_SECONDS,
  type IntroFacts,
  introGuide,
  introProtects,
  protectedHealth,
  stepIntro,
} from "../../src/gameplay/intro";

const TICK = 1 / 60;
const nothing: IntroFacts = { movedNow: 0, trunkSearched: false, stormApproach: 0, stormHere: false, indoors: false, inShelter: false, couldUseQuickSlot: false };
const run = (intro: ReturnType<typeof createIntro>, seconds: number, facts: Partial<IntroFacts> = {}): void => {
  for (let time = 0; time < seconds; time += TICK) {
    stepIntro(intro, { ...nothing, ...facts }, TICK);
  }
};

describe("the introduction's steps", () => {
  it("begins by telling the player to look round and move", () => {
    const intro = createIntro();
    expect(intro.step).toBe("look");
    expect(introGuide(intro)).toBe("look");
  });

  it("goes on to the search once the player has moved a little", () => {
    const intro = createIntro();
    stepIntro(intro, { ...nothing, movedNow: INTRO_LOOK_METRES - 1 }, TICK);
    expect(intro.step).toBe("look");
    stepIntro(intro, { ...nothing, movedNow: 1 }, TICK);
    expect(intro.step).toBe("search");
  });

  it("goes on to the search after a while, also for someone who only looks", () => {
    const intro = createIntro();
    run(intro, INTRO_LOOK_SECONDS - 1);
    expect(intro.step).toBe("look");
    run(intro, 1.1);
    expect(intro.step).toBe("search");
  });

  it("sends the player to shelter once the trunk has been searched", () => {
    const intro = createIntro();
    run(intro, INTRO_LOOK_SECONDS + 1);
    stepIntro(intro, { ...nothing, trunkSearched: true }, TICK);
    expect(intro.step).toBe("shelter");
    expect(introGuide(intro)).toBe("shelter");
  });

  it("sends the player to shelter when the storm is near, searched or not", () => {
    const intro = createIntro();
    run(intro, INTRO_LOOK_SECONDS + 1, { stormApproach: 0.3 });
    expect(intro.step).toBe("search");
    stepIntro(intro, { ...nothing, stormApproach: 0.6 }, TICK);
    expect(intro.step).toBe("shelter");
  });

  it("points out the hatch to someone who is indoors, from whichever step", () => {
    for (const before of [0, INTRO_LOOK_SECONDS + 1]) {
      const intro = createIntro();
      run(intro, before);
      stepIntro(intro, { ...nothing, indoors: true }, TICK);
      expect(intro.step).toBe("hatch");
    }
  });

  it("does not go back a step when the player walks out of the house again", () => {
    const intro = createIntro();
    stepIntro(intro, { ...nothing, indoors: true }, TICK);
    run(intro, 5);
    expect(intro.step).toBe("hatch");
  });

  it("is over once the player is down in the shelter, and says nothing more", () => {
    const intro = createIntro();
    stepIntro(intro, { ...nothing, inShelter: true }, TICK);
    expect(intro.step).toBe("done");
    expect(introGuide(intro)).toBeNull();
    const seconds = intro.seconds;
    run(intro, 5, { movedNow: 1 });
    expect(intro.seconds).toBe(seconds);
  });

  it("is over from the start when it is skipped", () => {
    const intro = createIntro(true);
    expect(intro.step).toBe("done");
    expect(introGuide(intro)).toBeNull();
    expect(introProtects(intro)).toBe(false);
  });
});

describe("the tip about quick slots", () => {
  it("shows once, for a while, when the player first has something to put on one", () => {
    const intro = createIntro();
    run(intro, INTRO_LOOK_SECONDS + 1);
    stepIntro(intro, { ...nothing, couldUseQuickSlot: true }, TICK);
    expect(introGuide(intro)).toBe("quick");
    run(intro, INTRO_TIP_SECONDS + 0.5, { couldUseQuickSlot: true });
    expect(introGuide(intro)).toBe("search");
    run(intro, 2, { couldUseQuickSlot: true });
    expect(introGuide(intro)).toBe("search");
  });

  it("does not hide the call to take shelter", () => {
    const intro = createIntro();
    run(intro, INTRO_LOOK_SECONDS + 1);
    stepIntro(intro, { ...nothing, couldUseQuickSlot: true, trunkSearched: true }, TICK);
    expect(intro.step).toBe("shelter");
    expect(introGuide(intro)).toBe("shelter");
  });
});

describe("the introduction's protection", () => {
  it("lasts two minutes, and ends early with the introduction", () => {
    const intro = createIntro();
    expect(introProtects(intro)).toBe(true);
    run(intro, INTRO_PROTECTION_SECONDS - 1);
    expect(introProtects(intro)).toBe(true);
    run(intro, 1.1);
    expect(introProtects(intro)).toBe(false);
    const early = createIntro();
    stepIntro(early, { ...nothing, inShelter: true }, TICK);
    expect(introProtects(early)).toBe(false);
  });

  it("keeps health from falling below 30", () => {
    expect(INTRO_HEALTH_FLOOR).toBe(30);
    expect(protectedHealth(29.5, 30.2, true)).toBe(30);
    expect(protectedHealth(0, 31, true)).toBe(30);
    expect(protectedHealth(55, 56, true)).toBe(55);
  });

  it("does not raise health that was below the floor already", () => {
    expect(protectedHealth(9, 10, true)).toBe(10);
    expect(protectedHealth(12, 10, true)).toBe(12);
  });

  it("does nothing once it is over", () => {
    expect(protectedHealth(0, 31, false)).toBe(0);
  });

  it("carries a player through a whole storm out of doors", () => {
    // Four health a second, as the storm takes at full strength.
    let health = 100;
    const intro = createIntro();
    for (let time = 0; time < 60; time += TICK) {
      stepIntro(intro, { ...nothing, stormHere: true }, TICK);
      health = protectedHealth(health - 4 * TICK, health, introProtects(intro));
    }
    expect(health).toBe(INTRO_HEALTH_FLOOR);
  });
});
