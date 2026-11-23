import { describe, expect, it } from "vitest";
import { DANGER_HEALTH, LOW_THIRST } from "../../src/data/tuning";
import { addItems, createInventory } from "../../src/gameplay/inventory";
import {
  bagView,
  bearingTo,
  moveGridSelection,
  sameBag,
  compassPosition,
  createDamageCue,
  DAMAGE_CUE_SECONDS,
  headingOf,
  hudAlerts,
  type HudSituation,
  interactionCue,
  keyLabel,
  quickBarView,
  relativeBearing,
  stepDamageCue,
} from "../../src/ui/hudState";
import { moveListSelection } from "../../src/ui/containerPanel";
import { ringFill } from "../../src/ui/progressRing";
import { yawFromDegrees } from "../../src/world/building";

describe("headingOf", () => {
  it("turns a yaw into degrees clockwise from north", () => {
    expect(headingOf(0)).toBeCloseTo(0);
    expect(headingOf(yawFromDegrees(90))).toBeCloseTo(90);
    expect(headingOf(yawFromDegrees(270))).toBeCloseTo(270);
    expect(headingOf(Math.PI / 2)).toBeCloseTo(270);
  });

  it("stays between 0 and 360 however far the view has turned", () => {
    expect(headingOf(yawFromDegrees(450))).toBeCloseTo(90);
    expect(headingOf(yawFromDegrees(-90))).toBeCloseTo(270);
  });
});

describe("bearingTo", () => {
  it("is 0 to the north (-Z), 90 to the east (+X), 180 to the south, 270 to the west", () => {
    expect(bearingTo(100, 100, 100, 50)).toBeCloseTo(0);
    expect(bearingTo(100, 100, 150, 100)).toBeCloseTo(90);
    expect(bearingTo(100, 100, 100, 150)).toBeCloseTo(180);
    expect(bearingTo(100, 100, 50, 100)).toBeCloseTo(270);
    expect(bearingTo(100, 100, 150, 50)).toBeCloseTo(45);
  });
});

describe("relativeBearing", () => {
  it("is positive to the right and negative to the left, the short way round", () => {
    expect(relativeBearing(0, 30)).toBeCloseTo(30);
    expect(relativeBearing(0, 330)).toBeCloseTo(-30);
    expect(relativeBearing(350, 10)).toBeCloseTo(20);
    expect(relativeBearing(10, 350)).toBeCloseTo(-20);
    expect(relativeBearing(90, 270)).toBeCloseTo(-180);
  });
});

describe("compassPosition", () => {
  it("puts what is straight ahead in the middle", () => {
    expect(compassPosition(40, 40)).toEqual({ offset: 0, beyond: 0 });
  });

  it("spreads 90 degrees to either side over the strip", () => {
    expect(compassPosition(0, 45).offset).toBeCloseTo(0.5);
    expect(compassPosition(0, 315).offset).toBeCloseTo(-0.5);
    expect(compassPosition(0, 90)).toEqual({ offset: 1, beyond: 0 });
    expect(compassPosition(0, 270)).toEqual({ offset: -1, beyond: 0 });
  });

  it("holds what is behind at the nearer end, marked as beyond it", () => {
    expect(compassPosition(0, 135)).toEqual({ offset: 1, beyond: 1 });
    expect(compassPosition(0, 225)).toEqual({ offset: -1, beyond: -1 });
    expect(compassPosition(0, 180)).toEqual({ offset: 1, beyond: 1 });
  });

  it("follows the player: the shelter to the north-west of a player looking east is off to the left", () => {
    const heading = headingOf(yawFromDegrees(90));
    const bearing = bearingTo(360, 600, 281, 281);
    expect(bearing).toBeGreaterThan(340);
    expect(compassPosition(heading, bearing)).toEqual({ offset: -1, beyond: -1 });
    // Turned to face it, it is in the middle.
    expect(compassPosition(bearing, bearing).offset).toBeCloseTo(0);
  });
});

const calm: HudSituation = {
  weather: { phase: "clear", intensity: 0, secondsLeft: 120, phaseSeconds: Number.POSITIVE_INFINITY },
  sheltered: false,
  health: 100,
  temperatureStage: "comfortable",
  thirst: 100,
  hurtBy: null,
};

describe("hudAlerts", () => {
  it("shows nothing out of the ordinary on a calm day in good shape", () => {
    expect(hudAlerts(calm)).toEqual({
      storm: null,
      edges: { storm: false, cold: false, danger: false },
      blink: { health: false, temperature: false, thirst: false },
      shelterMarked: false,
      damage: null,
    });
  });

  it("warns of a coming storm with a bar that runs down, and marks the shelter", () => {
    const warned = (secondsLeft: number) => hudAlerts({ ...calm, weather: { phase: "warning", intensity: 0, secondsLeft, phaseSeconds: 30 } });
    expect(warned(30).storm).toEqual({ kind: "warning", remaining: 1 });
    expect(warned(15).storm).toEqual({ kind: "warning", remaining: 0.5 });
    expect(warned(0).storm).toEqual({ kind: "warning", remaining: 0 });
    expect(warned(15).shelterMarked).toBe(true);
    // The warning alone is no reason for the edges to change.
    expect(warned(15).edges.storm).toBe(false);
  });

  it("says the storm is here, and clouds the edges out of doors only", () => {
    const storm = { phase: "storm" as const, intensity: 1, secondsLeft: 40, phaseSeconds: 60 };
    const outside = hudAlerts({ ...calm, weather: storm });
    const inside = hudAlerts({ ...calm, weather: storm, sheltered: true });
    expect(outside.storm).toEqual({ kind: "storm" });
    expect(outside.edges.storm).toBe(true);
    expect(inside.storm).toEqual({ kind: "storm" });
    expect(inside.edges.storm).toBe(false);
    expect(inside.shelterMarked).toBe(true);
  });

  it("drops the warning as the storm dies down, though the edges stay while it still hurts", () => {
    const fading = hudAlerts({ ...calm, weather: { phase: "fading", intensity: 0.4, secondsLeft: 6, phaseSeconds: 15 } });
    expect(fading.storm).toBeNull();
    expect(fading.edges.storm).toBe(true);
    expect(fading.shelterMarked).toBe(false);
  });

  it("turns the edges blue and blinks the temperature bar from cold on", () => {
    expect(hudAlerts({ ...calm, temperatureStage: "cold" }).edges.cold).toBe(true);
    expect(hudAlerts({ ...calm, temperatureStage: "cold" }).blink.temperature).toBe(true);
    expect(hudAlerts({ ...calm, temperatureStage: "hypothermia" }).edges.cold).toBe(true);
  });

  it("turns the edges red at 30 health or less", () => {
    expect(DANGER_HEALTH).toBe(30);
    expect(hudAlerts({ ...calm, health: 31 }).edges.danger).toBe(false);
    expect(hudAlerts({ ...calm, health: 30 }).edges.danger).toBe(true);
  });

  it("blinks the thirst bar at 20 or less", () => {
    expect(LOW_THIRST).toBe(20);
    expect(hudAlerts({ ...calm, thirst: 20.5 }).blink.thirst).toBe(false);
    expect(hudAlerts({ ...calm, thirst: 20 }).blink.thirst).toBe(true);
  });

  it("names what is hurting the player and blinks the health bar", () => {
    for (const cause of ["storm", "cold", "thirst"] as const) {
      const hurt = hudAlerts({ ...calm, hurtBy: cause });
      expect(hurt.damage).toBe(cause);
      expect(hurt.blink.health).toBe(true);
    }
  });

  it("can show several things at once", () => {
    const worst = hudAlerts({
      weather: { phase: "storm", intensity: 1, secondsLeft: 10, phaseSeconds: 60 },
      sheltered: false,
      health: 12,
      temperatureStage: "hypothermia",
      thirst: 3,
      hurtBy: "cold",
    });
    expect(worst.edges).toEqual({ storm: true, cold: true, danger: true });
    expect(worst.blink).toEqual({ health: true, temperature: true, thirst: true });
  });
});

describe("damage cue", () => {
  it("shows while health falls and for a second after, then goes", () => {
    const cue = createDamageCue(100);
    expect(stepDamageCue(cue, 100, 0.1)).toBe(false);
    expect(stepDamageCue(cue, 99, 0.1)).toBe(true);
    expect(stepDamageCue(cue, 98, 0.1)).toBe(true);
    // The damage stops.
    expect(stepDamageCue(cue, 98, DAMAGE_CUE_SECONDS / 2)).toBe(true);
    expect(stepDamageCue(cue, 98, DAMAGE_CUE_SECONDS / 2 + 0.01)).toBe(false);
  });

  it("does not take healing for damage", () => {
    const cue = createDamageCue(40);
    expect(stepDamageCue(cue, 100, 0.1)).toBe(false);
    expect(stepDamageCue(cue, 100, 0.1)).toBe(false);
  });
});

describe("interactionCue", () => {
  const nothing = { targetKind: null, windowOpen: false, dead: false } as const;

  it("shows a faint dot and no prompt without a target", () => {
    expect(interactionCue(nothing)).toEqual({ crosshair: "idle", prompt: null });
  });

  it("marks the dot out and says what can be done when there is a target", () => {
    expect(interactionCue({ ...nothing, targetKind: "search" })).toEqual({ crosshair: "target", prompt: "search" });
  });

  it("says what the container allows: open one searched before, or only that it is empty", () => {
    expect(interactionCue({ ...nothing, targetKind: "open" })).toEqual({ crosshair: "target", prompt: "open" });
    expect(interactionCue({ ...nothing, targetKind: "empty" })).toEqual({ crosshair: "target", prompt: "empty" });
    expect(interactionCue({ ...nothing, targetKind: "pickup" })).toEqual({ crosshair: "target", prompt: "pickup" });
  });

  it("shows neither while a window is open or the character lies collapsed", () => {
    const hidden = { crosshair: "hidden", prompt: null };
    expect(interactionCue({ ...nothing, targetKind: "search", windowOpen: true })).toEqual(hidden);
    expect(interactionCue({ ...nothing, targetKind: "search", dead: true })).toEqual(hidden);
    expect(interactionCue({ ...nothing, windowOpen: true })).toEqual(hidden);
  });
});

describe("keyLabel", () => {
  it("names letter and digit keys by their character", () => {
    expect(keyLabel("KeyE")).toBe("E");
    expect(keyLabel("Digit1")).toBe("1");
  });

  it("leaves other keys as they are", () => {
    expect(keyLabel("Space")).toBe("Space");
    expect(keyLabel("")).toBe("");
  });
});

describe("ringFill", () => {
  it("is the fraction of the ring's hundred units", () => {
    expect(ringFill(0)).toBe(0);
    expect(ringFill(0.5)).toBe(50);
    expect(ringFill(1)).toBe(100);
  });

  it("stays within the ring", () => {
    expect(ringFill(-1)).toBe(0);
    expect(ringFill(3)).toBe(100);
    expect(ringFill(Number.NaN)).toBe(0);
  });
});

describe("bagView", () => {
  it("lists the slots in the bag's own order, empty ones included", () => {
    const bag = createInventory(3);
    addItems(bag, "scrap", 6);
    expect(bagView(bag)).toEqual({
      slots: [{ item: "scrap", count: 5 }, { item: "scrap", count: 1 }, null],
      used: 2,
      size: 3,
      full: false,
      total: 6,
    });
  });

  it("says the bag is full when no slot is empty, even with room left on a stack", () => {
    const bag = createInventory(2);
    addItems(bag, "scrap", 6);
    expect(bagView(bag).full).toBe(true);
  });

  it("is a copy: later changes to the bag do not change what was drawn", () => {
    const bag = createInventory(2);
    addItems(bag, "tape", 1);
    const view = bagView(bag);
    addItems(bag, "tape", 2);
    expect(view.slots[0]).toEqual({ item: "tape", count: 1 });
  });
});

describe("quickBarView", () => {
  const well = { health: 100, thirst: 100 };

  it("shows nothing on slots that have nothing on them", () => {
    expect(quickBarView([null, null, null, null], createInventory(), well)).toEqual([null, null, null, null]);
  });

  it("counts an item over all the bag's stacks of it", () => {
    const bag = createInventory();
    addItems(bag, "water_bottle", 3);
    addItems(bag, "scrap", 2);
    addItems(bag, "water_bottle", 2);
    expect(quickBarView(["water_bottle", null, "bandage", null], bag, well)).toEqual([
      { item: "water_bottle", count: 5, urgent: false },
      null,
      { item: "bandage", count: 0, urgent: false },
      null,
    ]);
  });

  it("marks out the water when thirst is low, and the bandages when health is", () => {
    const bag = createInventory();
    addItems(bag, "water_bottle", 1);
    addItems(bag, "bandage", 1);
    const slots = ["water_bottle", "bandage"] as const;
    expect(quickBarView(slots, bag, { health: 100, thirst: LOW_THIRST }).map((slot) => slot?.urgent)).toEqual([true, false]);
    expect(quickBarView(slots, bag, { health: DANGER_HEALTH, thirst: 100 }).map((slot) => slot?.urgent)).toEqual([false, true]);
    expect(quickBarView(slots, bag, { health: DANGER_HEALTH + 1, thirst: LOW_THIRST + 1 }).map((slot) => slot?.urgent)).toEqual([false, false]);
  });

  it("marks out nothing there is none of", () => {
    expect(quickBarView(["water_bottle"], createInventory(), { health: 5, thirst: 0 })).toEqual([{ item: "water_bottle", count: 0, urgent: false }]);
  });
});

describe("sameBag", () => {
  it("tells whether two views show the same slots", () => {
    const bag = createInventory(3);
    addItems(bag, "scrap", 2);
    const before = bagView(bag);
    expect(sameBag(before, bagView(bag))).toBe(true);
    addItems(bag, "scrap", 1);
    expect(sameBag(before, bagView(bag))).toBe(false);
    const other = createInventory(3);
    addItems(other, "cloth", 2);
    expect(sameBag(before, bagView(other))).toBe(false);
    expect(sameBag(bagView(createInventory(2)), bagView(createInventory(3)))).toBe(false);
  });
});

describe("moveGridSelection", () => {
  // Eight slots in two rows of four:  0 1 2 3
  //                                   4 5 6 7
  const move = (from: number, direction: "left" | "right" | "up" | "down"): number => moveGridSelection(from, 8, 4, direction);

  it("steps to the neighbouring slot", () => {
    expect(move(1, "right")).toBe(2);
    expect(move(1, "left")).toBe(0);
    expect(move(1, "down")).toBe(5);
    expect(move(5, "up")).toBe(1);
  });

  it("stays put at the edges", () => {
    expect(move(0, "left")).toBe(0);
    expect(move(3, "right")).toBe(3);
    expect(move(4, "left")).toBe(4);
    expect(move(7, "right")).toBe(7);
    expect(move(2, "up")).toBe(2);
    expect(move(6, "down")).toBe(6);
  });

  it("does not step onto a slot that is not there", () => {
    // Six slots: the second row has only two.
    expect(moveGridSelection(3, 6, 4, "down")).toBe(3);
    expect(moveGridSelection(1, 6, 4, "down")).toBe(5);
    expect(moveGridSelection(5, 6, 4, "right")).toBe(5);
  });
});

describe("moveListSelection", () => {
  it("steps down and up the list and stops at its ends", () => {
    expect(moveListSelection(0, 3, 1)).toBe(1);
    expect(moveListSelection(1, 3, -1)).toBe(0);
    expect(moveListSelection(0, 3, -1)).toBe(0);
    expect(moveListSelection(2, 3, 1)).toBe(2);
  });

  it("comes back within a list that has grown shorter", () => {
    expect(moveListSelection(2, 2, 0)).toBe(1);
    expect(moveListSelection(4, 0, 0)).toBe(0);
  });
});
