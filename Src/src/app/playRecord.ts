/**
 * The play record (prototype design 2.6): what happened in a game and how well it ran, kept
 * on the machine so that whoever played can hand it over with their feedback. Nothing is
 * sent anywhere. This is the plain logic: the record, the events that change it, the summary
 * of frame times, and the list kept in the browser.
 */

/** How many games are kept; the oldest goes when another begins. */
export const MAX_RECORDS = 10;
export const RECORDS_STORAGE_KEY = "leeside.playRecords";
/** Frames longer than these count as long and as very long (the same limits as the budgets'). */
export const LONG_FRAME_MS = 34;
export const VERY_LONG_FRAME_MS = 50;
/** Frame times are counted in buckets of one millisecond up to this; anything longer goes into the last. */
const HISTOGRAM_MS = 250;

export interface DeathRecord {
  cause: string;
  zone: string;
  /** Where the character fell, in metres from the zone's north-west corner. */
  east: number;
  south: number;
  day: number;
  /** Seconds of play at which it happened. */
  atSeconds: number;
}

export interface PerformanceRecord {
  avgFps: number;
  low1Fps: number;
  longFrames: number;
  veryLongFrames: number;
  frames: number;
  quality: string;
  gpu: string;
  /** Size of the drawing buffer, as "2880x1546". */
  buffer: string;
}

/** One game, from START until it is quit or the page is closed. Plain data. */
export interface PlayRecord {
  version: 1;
  /** When the game began, as an ISO date. */
  startedAt: string;
  userAgent: string;
  language: string;
  /** Milliseconds from opening the page until the game could be started; 0 if not known. */
  loadMs: number;
  playSeconds: number;
  day: number;
  tutorialDone: boolean;
  returns: number;
  repair: { scrap: number; cloth: number; tape: number };
  repairDone: boolean;
  /** Seconds of play at which the repair was finished; null until then. */
  repairDoneAtSeconds: number | null;
  deaths: DeathRecord[];
  performance: PerformanceRecord;
}

export function createPlayRecord(startedAt: string, userAgent: string, language: string): PlayRecord {
  return {
    version: 1,
    startedAt,
    userAgent,
    language,
    loadMs: 0,
    playSeconds: 0,
    day: 1,
    tutorialDone: false,
    returns: 0,
    repair: { scrap: 0, cloth: 0, tape: 0 },
    repairDone: false,
    repairDoneAtSeconds: null,
    deaths: [],
    performance: { avgFps: 0, low1Fps: 0, longFrames: 0, veryLongFrames: 0, frames: 0, quality: "", gpu: "", buffer: "" },
  };
}

/** What can happen in a game that the record takes note of. */
export type PlayEvent =
  | { type: "death"; cause: string; zone: string; east: number; south: number }
  | { type: "return" }
  | { type: "tutorialDone" }
  /** The repair as it now stands; it is noted as done the first time it is. */
  | { type: "repair"; scrap: number; cloth: number; tape: number; done: boolean };

/** Notes an event in the record. `playSeconds` and `day` are those of the moment. */
export function recordEvent(record: PlayRecord, event: PlayEvent, playSeconds: number, day: number): void {
  record.playSeconds = Math.max(playSeconds, 0);
  record.day = Math.max(Math.floor(day), 1);
  if (event.type === "death") {
    record.deaths.push({
      cause: event.cause,
      zone: event.zone,
      east: Math.round(event.east),
      south: Math.round(event.south),
      day: record.day,
      atSeconds: Math.round(record.playSeconds),
    });
  } else if (event.type === "return") {
    record.returns += 1;
  } else if (event.type === "tutorialDone") {
    record.tutorialDone = true;
  } else {
    record.repair = { scrap: event.scrap, cloth: event.cloth, tape: event.tape };
    if (event.done && !record.repairDone) {
      record.repairDone = true;
      record.repairDoneAtSeconds = Math.round(record.playSeconds);
    }
  }
}

/**
 * Sums up the frame times of a whole game without keeping them: a count per millisecond, so
 * that an hour of play takes no more memory than a minute.
 */
export class FrameSummary {
  private readonly counts = new Uint32Array(HISTOGRAM_MS + 1);
  private frames = 0;
  private totalMs = 0;
  private long = 0;
  private veryLong = 0;

  /** Adds one frame that took `frameMs`. Times that are not numbers, or not above zero, are left out. */
  add(frameMs: number): void {
    if (!(frameMs > 0) || !Number.isFinite(frameMs)) {
      return;
    }
    this.frames += 1;
    this.totalMs += frameMs;
    this.long += frameMs > LONG_FRAME_MS ? 1 : 0;
    this.veryLong += frameMs > VERY_LONG_FRAME_MS ? 1 : 0;
    const bucket = Math.min(Math.round(frameMs), HISTOGRAM_MS);
    this.counts[bucket] = (this.counts[bucket] ?? 0) + 1;
  }

  /**
   * The summary so far. The lowest 1% is the frame rate of the slowest hundredth of the frames:
   * the time that 99 frames in 100 stay under, to the millisecond.
   */
  summary(): Pick<PerformanceRecord, "avgFps" | "low1Fps" | "longFrames" | "veryLongFrames" | "frames"> {
    if (this.frames === 0) {
      return { avgFps: 0, low1Fps: 0, longFrames: 0, veryLongFrames: 0, frames: 0 };
    }
    // From the longest times down, until a hundredth of the frames has been counted.
    const slowest = Math.max(Math.ceil(this.frames / 100), 1);
    let counted = 0;
    let slowMs = 1;
    for (let ms = HISTOGRAM_MS; ms >= 0; ms -= 1) {
      counted += this.counts[ms] ?? 0;
      if (counted >= slowest) {
        slowMs = Math.max(ms, 1);
        break;
      }
    }
    const round = (value: number): number => Math.round(value * 10) / 10;
    return {
      avgFps: round(1000 / (this.totalMs / this.frames)),
      low1Fps: round(1000 / slowMs),
      longFrames: this.long,
      veryLongFrames: this.veryLong,
      frames: this.frames,
    };
  }
}

/** Where the records are kept: the browser's storage, or anything like it (tests). */
export interface RecordStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const isRecord = (value: unknown): value is PlayRecord =>
  typeof value === "object" && value !== null && (value as PlayRecord).version === 1 && typeof (value as PlayRecord).startedAt === "string";

/** The records kept, oldest first. Whatever cannot be read as a record is left out; nothing kept gives an empty list. */
export function readRecords(storage: RecordStorage | undefined): PlayRecord[] {
  try {
    const kept: unknown = JSON.parse(storage?.getItem(RECORDS_STORAGE_KEY) ?? "[]");
    return Array.isArray(kept) ? kept.filter(isRecord) : [];
  } catch {
    return [];
  }
}

/**
 * Keeps a record: in place of the one of the same game (the same start) if it is there
 * already, else as the newest, and only the last `MAX_RECORDS` stay. Returns what is now
 * kept. Storage that is missing or refuses changes nothing but the return value.
 */
export function keepRecord(storage: RecordStorage | undefined, record: PlayRecord): PlayRecord[] {
  const kept = readRecords(storage).filter((other) => other.startedAt !== record.startedAt);
  kept.push(record);
  const latest = kept.slice(-MAX_RECORDS);
  try {
    storage?.setItem(RECORDS_STORAGE_KEY, JSON.stringify(latest));
  } catch {
    // Not being able to keep the record is not worth interrupting the player for.
  }
  return latest;
}
