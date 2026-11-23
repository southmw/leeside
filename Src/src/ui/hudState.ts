import type { DamageCause } from "../core/ecs";
import { type ItemDefinition, type ItemId, ITEMS } from "../data/items";
import { DANGER_HEALTH, LOW_THIRST } from "../data/tuning";
import { countOf, type Inventory, isFull, usedSlots } from "../gameplay/inventory";
import type { TemperatureStage } from "../gameplay/temperature";
import type { WeatherPhase } from "../gameplay/weather";
import type { ZoneId } from "../world/zones";

/**
 * What the HUD shows, as plain logic (UI design 5): where things sit on the compass, and
 * which warnings and effects the player's situation calls for. Drawing is in hud.ts.
 */

/** The compass strip shows this many degrees to either side of where the player looks. */
export const COMPASS_HALF_SPAN = 90;

/** How long the cause of damage stays on screen after the damage has stopped, in seconds. */
export const DAMAGE_CUE_SECONDS = 1;

/** Degrees into the range 0 up to 360. */
function wrapDegrees(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

/** The compass heading (degrees clockwise from north) of a yaw (radians counter-clockwise, 0 facing north). */
export function headingOf(yaw: number): number {
  return wrapDegrees((-yaw * 180) / Math.PI);
}

/**
 * The compass bearing from one place to another, in degrees clockwise from north. North is
 * -Z and east +X, as in the zones. A place bears north of itself.
 */
export function bearingTo(fromX: number, fromZ: number, toX: number, toZ: number): number {
  return wrapDegrees((Math.atan2(toX - fromX, -(toZ - fromZ)) * 180) / Math.PI);
}

/** How far to the right (positive) or left of `heading` a bearing lies: -180 up to 180 degrees. */
export function relativeBearing(heading: number, bearing: number): number {
  const turn = wrapDegrees(bearing - heading);
  return turn >= 180 ? turn - 360 : turn;
}

export interface CompassPosition {
  /** Place along the strip: -1 is its left end, 0 the middle (straight ahead), 1 its right end. */
  offset: number;
  /** 0 when the bearing is on the strip; -1 or 1 when it lies beyond the left or right end. */
  beyond: -1 | 0 | 1;
}

/**
 * Where a bearing sits on the compass of a player heading `heading`. A bearing off the strip
 * is held at the nearer end, so its mark still says which way to turn. Straight behind
 * counts as to the right.
 */
export function compassPosition(heading: number, bearing: number, halfSpan: number = COMPASS_HALF_SPAN): CompassPosition {
  const turn = relativeBearing(heading, bearing);
  if (turn > halfSpan || turn === -180) {
    return { offset: 1, beyond: 1 };
  }
  if (turn < -halfSpan) {
    return { offset: -1, beyond: -1 };
  }
  return { offset: turn / halfSpan, beyond: 0 };
}

/** The player's situation, as far as the HUD cares. */
export interface HudSituation {
  weather: { phase: WeatherPhase; intensity: number; secondsLeft: number; phaseSeconds: number };
  /** Whether the player is in a shelter zone. */
  sheltered: boolean;
  health: number;
  temperatureStage: TemperatureStage;
  thirst: number;
  /** What is taking health now or took it a moment ago, or null. */
  hurtBy: DamageCause | null;
}

export type StormNotice =
  /** A storm is on its way; `remaining` runs from 1 down to 0 as it nears. */
  | { kind: "warning"; remaining: number }
  /** The storm is here. */
  | { kind: "storm" };

export interface HudAlerts {
  /** The storm warning under the compass, or null in clear weather and while a storm dies down. */
  storm: StormNotice | null;
  /** Colours bleeding in from the edges of the screen. Several can show at once. */
  edges: { storm: boolean; cold: boolean; danger: boolean };
  /** Bars that blink. */
  blink: { health: boolean; temperature: boolean; thirst: boolean };
  /** Whether the shelter's mark on the compass stands out. */
  shelterMarked: boolean;
  /** The cause shown beside the health bar, or null. */
  damage: DamageCause | null;
}

export function hudAlerts(situation: HudSituation): HudAlerts {
  const { weather } = situation;
  let storm: StormNotice | null = null;
  if (weather.phase === "warning") {
    const remaining = weather.phaseSeconds > 0 ? weather.secondsLeft / weather.phaseSeconds : 0;
    storm = { kind: "warning", remaining: Math.min(Math.max(remaining, 0), 1) };
  } else if (weather.phase === "storm") {
    storm = { kind: "storm" };
  }
  const chilled = situation.temperatureStage !== "comfortable";
  return {
    storm,
    edges: {
      storm: weather.intensity > 0 && !situation.sheltered,
      cold: chilled,
      danger: situation.health <= DANGER_HEALTH,
    },
    blink: {
      health: situation.hurtBy !== null,
      temperature: chilled,
      thirst: situation.thirst <= LOW_THIRST,
    },
    shelterMarked: storm !== null,
    damage: situation.hurtBy,
  };
}

/**
 * What the prompt under the dot can say: hold to search a container, press to open one
 * already searched, only that it is empty, press to pick up what lies on the ground, or
 * press to leave for another zone (one prompt for each zone to go to).
 */
export type PromptKind = "search" | "open" | "empty" | "pickup" | `travel_${ZoneId}`;

/** What the middle of the screen has to go by. */
export interface InteractionSituation {
  /** What the player's interaction target lets them do, or null without a target. */
  targetKind: PromptKind | null;
  /** Whether a window is open; its keys are not the game's then. */
  windowOpen: boolean;
  /** Whether the character lies collapsed. */
  dead: boolean;
}

export interface InteractionCue {
  /** The dot in the middle of the screen: not shown, shown faintly, or marked out because there is a target. */
  crosshair: "hidden" | "idle" | "target";
  /** Which prompt to show under the dot, or null for none. */
  prompt: PromptKind | null;
}

/** The dot and the prompt in the middle of the screen (UI design 5). */
export function interactionCue(situation: InteractionSituation): InteractionCue {
  if (situation.windowOpen || situation.dead) {
    return { crosshair: "hidden", prompt: null };
  }
  return situation.targetKind
    ? { crosshair: "target", prompt: situation.targetKind }
    : { crosshair: "idle", prompt: null };
}

/** What to call a key on screen, from its `KeyboardEvent.code`: "KeyE" is "E", "Digit1" is "1". */
export function keyLabel(code: string): string {
  return /^(?:Key|Digit)(.)$/.exec(code)?.[1] ?? code;
}

/**
 * The bag as the screen draws it: what is in each slot, in the bag's own order; how many
 * slots are in use, of how many; whether none is empty; and how many things there are in all.
 */
export interface BagView {
  slots: Array<{ item: ItemId; count: number } | null>;
  used: number;
  size: number;
  full: boolean;
  total: number;
}

/** A copy of the bag for drawing, so the HUD can tell what has changed since it last drew. */
export function bagView(inventory: Inventory): BagView {
  return {
    slots: inventory.slots.map((slot) => (slot ? { item: slot.item, count: slot.count } : null)),
    used: usedSlots(inventory),
    size: inventory.slots.length,
    full: isFull(inventory),
    total: inventory.slots.reduce((sum, slot) => sum + (slot?.count ?? 0), 0),
  };
}

/** A quick slot as the screen draws it; null for a slot with nothing on it. */
export type QuickSlotView = {
  item: ItemId;
  /** How many of it the bag holds, all stacks together. Never zero in play: the last one gone frees the slot. */
  count: number;
  /** Whether the slot calls for attention: the player is running low on what it restores, and has some. */
  urgent: boolean;
} | null;

/**
 * The quick slots for drawing (UI design 5). A slot stands out when thirst is low and it
 * holds water, or health is low and it holds bandages.
 */
export function quickBarView(slots: ReadonlyArray<ItemId | null>, inventory: Inventory, vitals: { health: number; thirst: number }): QuickSlotView[] {
  return slots.map((item) => {
    if (!item) {
      return null;
    }
    const definition: ItemDefinition = ITEMS[item];
    const count = countOf(inventory, item);
    const low = definition.use?.restores === "thirst" ? vitals.thirst <= LOW_THIRST : definition.use?.restores === "health" && vitals.health <= DANGER_HEALTH;
    return { item, count, urgent: low && count > 0 };
  });
}

/** Whether two views of the bag show the same thing. */
export function sameBag(one: BagView, other: BagView): boolean {
  return (
    one.slots.length === other.slots.length &&
    one.slots.every((slot, index) => slot?.item === other.slots[index]?.item && slot?.count === other.slots[index]?.count)
  );
}

/**
 * The slot selected after a step through a grid of `count` slots in rows of `columns` (the
 * bag window). A step off the grid's edge goes nowhere.
 */
export function moveGridSelection(index: number, count: number, columns: number, direction: "left" | "right" | "up" | "down"): number {
  const column = index % columns;
  let next = index;
  if (direction === "left" && column > 0) {
    next = index - 1;
  } else if (direction === "right" && column < columns - 1) {
    next = index + 1;
  } else if (direction === "up") {
    next = index - columns;
  } else if (direction === "down") {
    next = index + columns;
  }
  return next >= 0 && next < count ? next : index;
}

/** Remembers health from step to step, to tell when it is being taken. */
export interface DamageCue {
  lastHealth: number;
  /** Seconds the cause still has to show. */
  seconds: number;
}

export function createDamageCue(health: number): DamageCue {
  return { lastHealth: health, seconds: 0 };
}

/**
 * Call every step with the health now. Returns whether the cause of damage should show:
 * while health falls and for a moment after.
 */
export function stepDamageCue(cue: DamageCue, health: number, dt: number): boolean {
  if (health < cue.lastHealth) {
    cue.seconds = DAMAGE_CUE_SECONDS;
  } else {
    cue.seconds = Math.max(cue.seconds - Math.max(dt, 0), 0);
  }
  cue.lastHealth = health;
  return cue.seconds > 0;
}
