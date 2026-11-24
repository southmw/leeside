import { describe, expect, it } from "vitest";
import { createPlayRecord, recordEvent } from "../../src/app/playRecord";
import { createRecordUploader, GAME_ID_LENGTH, gameIdFrom, RECORD_FORM, uploadFields } from "../../src/app/recordUpload";

const newRecord = (id = "0123456789ab") => createPlayRecord(id, "2026-11-24T09:00:00.000Z", "test browser", "ko");
const form = { url: "https://example.com/formResponse", gameField: "entry.1", recordField: "entry.2" };

describe("gameIdFrom", () => {
  it("writes the bytes as twelve letters of hexadecimal", () => {
    expect(gameIdFrom([0, 1, 15, 16, 171, 255])).toBe("00010f10abff");
    expect(gameIdFrom(new Uint8Array([255, 255, 255, 255, 255, 255, 255, 255]))).toBe("ffffffffffff");
  });

  it("is always twelve letters, also from too few bytes", () => {
    expect(gameIdFrom([])).toHaveLength(GAME_ID_LENGTH);
    expect(gameIdFrom([7])).toBe("070000000000");
  });
});

describe("uploadFields", () => {
  it("sends the game's number and the record as JSON", () => {
    const record = newRecord();
    const fields = uploadFields(record, form);
    expect(Object.keys(fields)).toEqual(["entry.1", "entry.2"]);
    expect(fields["entry.1"]).toBe("0123456789ab");
    expect(JSON.parse(fields["entry.2"] ?? "")).toEqual(record);
  });
});

describe("RECORD_FORM", () => {
  it("is a form's submit address with two different fields", () => {
    expect(RECORD_FORM.url).toMatch(/^https:\/\/docs\.google\.com\/forms\/d\/e\/[\w-]+\/formResponse$/);
    expect(RECORD_FORM.gameField).toMatch(/^entry\.\d+$/);
    expect(RECORD_FORM.recordField).toMatch(/^entry\.\d+$/);
    expect(RECORD_FORM.gameField).not.toBe(RECORD_FORM.recordField);
  });
});

describe("the record uploader", () => {
  const setUp = (enabled = () => true) => {
    const sent: { url: string; fields: Record<string, string> }[] = [];
    const uploader = createRecordUploader({ enabled, send: (url, fields) => void sent.push({ url, fields }), form });
    return { sent, uploader };
  };

  it("sends a record to the form", () => {
    const { sent, uploader } = setUp();
    expect(uploader.offer(newRecord())).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.url).toBe("https://example.com/formResponse");
    expect(sent[0]?.fields["entry.1"]).toBe("0123456789ab");
  });

  it("does not send the same record twice, and sends it again once it has changed", () => {
    const { sent, uploader } = setUp();
    const record = newRecord();
    uploader.offer(record);
    expect(uploader.offer(record)).toBe(false);
    recordEvent(record, { type: "return" }, 120, 1);
    expect(uploader.offer(record)).toBe(true);
    expect(sent).toHaveLength(2);
    expect(JSON.parse(sent[1]?.fields["entry.2"] ?? "").returns).toBe(1);
  });

  it("sends nothing while sending is off, and the record as it then is once it is on", () => {
    let on = false;
    const { sent, uploader } = setUp(() => on);
    const record = newRecord();
    expect(uploader.offer(record)).toBe(false);
    expect(sent).toHaveLength(0);
    on = true;
    expect(uploader.offer(record)).toBe(true);
    expect(sent).toHaveLength(1);
  });

  it("is not stopped by sending that fails", () => {
    const uploader = createRecordUploader({
      enabled: () => true,
      send: () => {
        throw new Error("offline");
      },
      form,
    });
    expect(() => uploader.offer(newRecord())).not.toThrow();
  });
});
