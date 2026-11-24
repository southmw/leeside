import { describe, expect, it } from "vitest";
import { createPlayRecord, FrameSummary, keepRecord, MAX_RECORDS, readRecords, recordEvent, RECORDS_STORAGE_KEY } from "../../src/app/playRecord";

const memory = (initial: Record<string, string> = {}) => {
  const kept = new Map(Object.entries(initial));
  return { kept, getItem: (key: string) => kept.get(key) ?? null, setItem: (key: string, value: string) => void kept.set(key, value) };
};
const newRecord = (startedAt = "2026-11-24T09:00:00.000Z") => createPlayRecord("0123456789ab", startedAt, "test browser", "ko");

describe("a play record", () => {
  it("starts with nothing having happened", () => {
    expect(newRecord()).toMatchObject({ version: 1, playSeconds: 0, day: 1, tutorialDone: false, returns: 0, repairDone: false, repairDoneAtSeconds: null, deaths: [] });
  });

  it("notes each death: what of, where, on which day and when", () => {
    const record = newRecord();
    recordEvent(record, { type: "death", cause: "storm", zone: "dry_riverbed", east: 360.4, south: 599.6 }, 95.7, 1);
    recordEvent(record, { type: "death", cause: "thirst", zone: "shelter", east: 8, south: 10 }, 700, 3);
    expect(record.deaths).toEqual([
      { cause: "storm", zone: "dry_riverbed", east: 360, south: 600, day: 1, atSeconds: 96 },
      { cause: "thirst", zone: "shelter", east: 8, south: 10, day: 3, atSeconds: 700 },
    ]);
    expect(record.playSeconds).toBe(700);
    expect(record.day).toBe(3);
  });

  it("counts returns and notes the tutorial", () => {
    const record = newRecord();
    recordEvent(record, { type: "tutorialDone" }, 110, 1);
    recordEvent(record, { type: "return" }, 110, 1);
    recordEvent(record, { type: "return" }, 400, 2);
    expect(record.tutorialDone).toBe(true);
    expect(record.returns).toBe(2);
  });

  it("follows the repair, and notes when it was finished, once", () => {
    const record = newRecord();
    recordEvent(record, { type: "repair", scrap: 6, cloth: 2, tape: 0, done: false }, 200, 1);
    expect(record).toMatchObject({ repair: { scrap: 6, cloth: 2, tape: 0 }, repairDone: false, repairDoneAtSeconds: null });
    recordEvent(record, { type: "repair", scrap: 15, cloth: 8, tape: 3, done: true }, 760.4, 4);
    recordEvent(record, { type: "repair", scrap: 15, cloth: 8, tape: 3, done: true }, 900, 5);
    expect(record).toMatchObject({ repairDone: true, repairDoneAtSeconds: 760, repair: { scrap: 15, cloth: 8, tape: 3 } });
  });
});

describe("the summary of frame times", () => {
  it("is all zero before any frame", () => {
    expect(new FrameSummary().summary()).toEqual({ avgFps: 0, low1Fps: 0, longFrames: 0, veryLongFrames: 0, frames: 0 });
  });

  it("gives 60 for a steady 60 frames a second", () => {
    const frames = new FrameSummary();
    for (let frame = 0; frame < 600; frame += 1) {
      frames.add(1000 / 60);
    }
    expect(frames.summary()).toEqual({ avgFps: 60, low1Fps: 58.8, longFrames: 0, veryLongFrames: 0, frames: 600 });
  });

  it("shows hitches in the lowest 1% and in the counts of long frames, hardly in the average", () => {
    const frames = new FrameSummary();
    for (let frame = 0; frame < 990; frame += 1) {
      frames.add(16.7);
    }
    for (let frame = 0; frame < 6; frame += 1) {
      frames.add(40);
    }
    for (let frame = 0; frame < 4; frame += 1) {
      frames.add(100);
    }
    const summary = frames.summary();
    expect(summary.frames).toBe(1000);
    expect(summary.longFrames).toBe(10);
    expect(summary.veryLongFrames).toBe(4);
    // The slowest hundredth is ten frames: the tenth slowest took 40 ms.
    expect(summary.low1Fps).toBe(25);
    expect(summary.avgFps).toBeGreaterThan(55);
  });

  it("does not count a frame of exactly the limit as long", () => {
    const frames = new FrameSummary();
    frames.add(34);
    frames.add(50);
    expect(frames.summary()).toMatchObject({ longFrames: 1, veryLongFrames: 0 });
  });

  it("leaves out times that are not times, and takes very long ones without breaking", () => {
    const frames = new FrameSummary();
    for (const time of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      frames.add(time);
    }
    expect(frames.summary().frames).toBe(0);
    frames.add(5000);
    // Times are counted up to a quarter of a second; the slowest frames are still never said to be faster than the average.
    expect(frames.summary()).toMatchObject({ frames: 1, veryLongFrames: 1, avgFps: 0.2, low1Fps: 0.2 });
  });
});

describe("the records kept in the browser", () => {
  it("are none where nothing was kept, or what was kept cannot be read", () => {
    expect(readRecords(undefined)).toEqual([]);
    expect(readRecords(memory())).toEqual([]);
    expect(readRecords(memory({ [RECORDS_STORAGE_KEY]: "{not json" }))).toEqual([]);
    expect(readRecords(memory({ [RECORDS_STORAGE_KEY]: '{"version":1}' }))).toEqual([]);
  });

  it("leave out what is not a record and keep the rest", () => {
    const storage = memory({ [RECORDS_STORAGE_KEY]: JSON.stringify([newRecord(), 7, { version: 2, startedAt: "x" }, null]) });
    expect(readRecords(storage)).toHaveLength(1);
  });

  it("keep one entry for a game however often it is written", () => {
    const storage = memory();
    const record = newRecord();
    keepRecord(storage, record);
    record.returns = 3;
    expect(keepRecord(storage, record)).toHaveLength(1);
    expect(readRecords(storage)[0]?.returns).toBe(3);
  });

  it("add a new game as the newest, and keep only the last ten", () => {
    const storage = memory();
    for (let game = 1; game <= MAX_RECORDS + 3; game += 1) {
      keepRecord(storage, newRecord(`2026-11-24T09:00:${String(game).padStart(2, "0")}.000Z`));
    }
    const kept = readRecords(storage);
    expect(kept).toHaveLength(MAX_RECORDS);
    expect(kept[0]?.startedAt).toContain(":04.000Z");
    expect(kept[kept.length - 1]?.startedAt).toContain(":13.000Z");
  });

  it("still say what would be kept when storage is missing or refuses", () => {
    const refusing = {
      getItem: (): string | null => {
        throw new Error("blocked");
      },
      setItem: (): void => {
        throw new Error("blocked");
      },
    };
    expect(keepRecord(undefined, newRecord())).toHaveLength(1);
    expect(keepRecord(refusing, newRecord())).toHaveLength(1);
  });
});
