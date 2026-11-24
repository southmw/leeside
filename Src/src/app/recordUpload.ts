import type { PlayRecord } from "./playRecord";

/**
 * Sending the play record (prototype design 2.6, "automatic sending"), as plain logic: where
 * it goes, what is sent, and when it is worth sending again. The sending itself is handed
 * in, so that this runs without a browser.
 *
 * The record goes to a form kept for it (Google Forms), posted to the address the form's own
 * page submits to. There is no server of the game's. Nothing in a record says who played.
 */
export interface RecordForm {
  /** The address the form submits to. */
  url: string;
  /** The names of the form's two fields: the number of the game, and the record. */
  gameField: string;
  recordField: string;
}

export const RECORD_FORM: Readonly<RecordForm> = {
  url: "https://docs.google.com/forms/d/e/1FAIpQLSfTJP8tTnY_ghHZVqjqDIEDJrdKKHKbth7PehFaqUk103UJRA/formResponse",
  gameField: "entry.674908822",
  recordField: "entry.1736314773",
};

/** How many letters a game's number has. */
export const GAME_ID_LENGTH = 12;

/**
 * A number for a game from random bytes (the browser's `crypto.getRandomValues`): twelve
 * letters of hexadecimal. It is made anew for every game, so it stands for the game and not
 * for whoever plays or the machine.
 */
export function gameIdFrom(bytes: ArrayLike<number>): string {
  let id = "";
  for (let index = 0; index < bytes.length && id.length < GAME_ID_LENGTH; index += 1) {
    id += ((bytes[index] ?? 0) & 0xff).toString(16).padStart(2, "0");
  }
  return id.padEnd(GAME_ID_LENGTH, "0").slice(0, GAME_ID_LENGTH);
}

/** The fields posted for a record. */
export function uploadFields(record: PlayRecord, form: RecordForm = RECORD_FORM): Record<string, string> {
  return { [form.gameField]: record.id, [form.recordField]: JSON.stringify(record) };
}

export interface RecordUploader {
  /**
   * Sends the record as it now is, unless sending is off or this is what was sent last.
   * Returns whether it was sent.
   */
  offer(record: PlayRecord): boolean;
}

export interface RecordUploaderOptions {
  /** Whether records are to be sent at all: the player's setting, and where the game runs. */
  enabled(): boolean;
  /** Posts the fields to the address. It may fail silently: the next record sent is the whole record again. */
  send(url: string, fields: Record<string, string>): void;
  form?: RecordForm;
}

export function createRecordUploader(options: RecordUploaderOptions): RecordUploader {
  const form = options.form ?? RECORD_FORM;
  let lastSent = "";
  return {
    offer(record: PlayRecord): boolean {
      if (!options.enabled()) {
        return false;
      }
      const fields = uploadFields(record, form);
      const text = fields[form.recordField] ?? "";
      // The same record again says nothing new (the page being hidden twice, say).
      if (text === lastSent) {
        return false;
      }
      lastSent = text;
      try {
        options.send(form.url, fields);
      } catch {
        // Not being able to send the record is not worth interrupting the player for.
      }
      return true;
    },
  };
}
