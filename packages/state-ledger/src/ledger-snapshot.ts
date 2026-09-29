import { open, stat } from "node:fs/promises";
import type { BigIntStats } from "node:fs";
import { stateLedgerRecordSchema, type StateLedgerEntry } from "@consiliency/runtime-provider";
import { readStoreManifest } from "./migrations.js";
import { CURRENT_STATE_LEDGER_SCHEMA_VERSION, getStateLedgerPaths, isMissingFileError } from "./schema.js";

export class LedgerReadError extends Error {
  constructor(
    readonly code: "ledger_corruption" | "unsupported_schema" | "snapshot_limit" | "incomplete_snapshot",
    readonly byteOffset?: number,
    readonly sequence?: number,
  ) {
    super(`State ledger ${code.replaceAll("_", " ")}${byteOffset === undefined ? "" : ` at byte ${byteOffset}`}.`);
    this.name = "LedgerReadError";
  }
}

export interface LedgerSnapshotOptions {
  readonly maxBytes?: number;
  readonly maxAttempts?: number;
}

export type LedgerSnapshot = {
  readonly status: "complete" | "incomplete_tail";
  readonly records: StateLedgerEntry[];
  readonly byteLength: number;
  readonly completeBytes: number;
  readonly lastSequence: number;
  readonly pendingRecord?: StateLedgerEntry;
} | {
  readonly status: "in_progress";
  readonly records: [];
  readonly byteLength: null;
  readonly completeBytes: null;
  readonly lastSequence: null;
};

async function metadata(path: string): Promise<BigIntStats | undefined> {
  try { return await stat(path, { bigint: true }); }
  catch (error) { if (isMissingFileError(error)) return undefined; throw error; }
}

function same(left: BigIntStats | undefined, right: BigIntStats | undefined): boolean {
  if (!left || !right) return left === right;
  return left.dev === right.dev && left.ino === right.ino && left.size === right.size
    && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs;
}

function truncatedJson(text: string, error: unknown, incompleteUtf8 = false): boolean {
  if (!(error instanceof SyntaxError)) return false;
  // Validate the entire prefix: a plausible suffix cannot excuse earlier corruption.
  type Frame = { kind: "root" | "array" | "object"; state: "value" | "valueOrEnd" | "key" | "keyOrEnd" | "colon" | "comma" | "end" };
  const frames: Frame[] = [{ kind: "root", state: "value" }];
  let index = 0;
  const string = (): "complete" | "partial" | "ascii_partial" | "invalid" => {
    index += 1;
    while (index < text.length) {
      const character = text[index++]!;
      if (character === '"') return "complete";
      if (character.charCodeAt(0) < 32) return "invalid";
      if (character !== "\\") continue;
      if (index === text.length) return "ascii_partial";
      const escape = text[index++]!;
      if ('"\\/bfnrt'.includes(escape)) continue;
      if (escape !== "u") return "invalid";
      for (let digit = 0; digit < 4; digit += 1) {
        if (index === text.length) return "ascii_partial";
        if (!/[0-9a-fA-F]/.test(text[index++]!)) return "invalid";
      }
    }
    return "partial";
  };
  while (index < text.length) {
    if (/[\t\n\r ]/.test(text[index]!)) { index += 1; continue; }
    const frame = frames.at(-1)!;
    const character = text[index]!;
    if (frame.state === "end") return false;
    if (frame.state === "colon") {
      if (character !== ":") return false;
      index += 1; frame.state = "value"; continue;
    }
    const closing = frame.kind === "array" ? "]" : "}";
    if (frame.state === "comma") {
      if (character === closing) { index += 1; frames.pop(); continue; }
      if (character !== ",") return false;
      index += 1; frame.state = frame.kind === "array" ? "value" : "key"; continue;
    }
    if ((frame.state === "keyOrEnd" || frame.state === "valueOrEnd") && character === closing) {
      index += 1; frames.pop(); continue;
    }
    if (frame.state === "key" || frame.state === "keyOrEnd") {
      if (character !== '"') return false;
      const result = string();
      if (result !== "complete") return result === "partial" || (result === "ascii_partial" && !incompleteUtf8);
      frame.state = "colon"; continue;
    }
    frame.state = frame.kind === "root" ? "end" : "comma";
    if (character === "{" || character === "[") {
      index += 1;
      frames.push({ kind: character === "{" ? "object" : "array", state: character === "{" ? "keyOrEnd" : "valueOrEnd" });
    } else if (character === '"') {
      const result = string();
      if (result !== "complete") return result === "partial" || (result === "ascii_partial" && !incompleteUtf8);
    } else if ("tfn".includes(character)) {
      const literal = character === "t" ? "true" : character === "f" ? "false" : "null";
      const remaining = text.slice(index, index + literal.length);
      if (!literal.startsWith(remaining)) return false;
      if (remaining.length < literal.length) return !incompleteUtf8;
      index += literal.length;
    } else if (character === "-" || /[0-9]/.test(character)) {
      const start = index++;
      while (index < text.length && /[0-9.eE+-]/.test(text[index]!)) index += 1;
      const number = text.slice(start, index);
      if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(number)) continue;
      return !incompleteUtf8 && index === text.length && /^(?:-|-?(?:0|[1-9]\d*)\.|-?(?:0|[1-9]\d*)(?:\.\d+)?[eE][+-]?)$/.test(number);
    } else return false;
  }
  return !incompleteUtf8 && (frames.length > 1 || frames[0]!.state !== "end");
}

function parseBytes(raw: Buffer): Exclude<LedgerSnapshot, { status: "in_progress" }> {
  const records: StateLedgerEntry[] = [];
  const ids = new Set<string>();
  let lastSequence = 0;
  let offset = 0;
  const parseRecord = (text: string, start: number): StateLedgerEntry => {
    const json: unknown = JSON.parse(text);
    if (json !== null && typeof json === "object" && "schemaVersion" in json
      && typeof json.schemaVersion === "number" && json.schemaVersion > CURRENT_STATE_LEDGER_SCHEMA_VERSION) {
      throw new LedgerReadError("unsupported_schema", start);
    }
    const result = stateLedgerRecordSchema.safeParse(json);
    if (!result.success || result.data.schemaVersion !== CURRENT_STATE_LEDGER_SCHEMA_VERSION
      || !Number.isSafeInteger(result.data.sequence) || result.data.sequence <= lastSequence || ids.has(result.data.recordId)) {
      throw new LedgerReadError("ledger_corruption", start);
    }
    const record = result.data as StateLedgerEntry;
    lastSequence = record.sequence;
    ids.add(record.recordId);
    return record;
  };
  while (offset < raw.length) {
    const newline = raw.indexOf(10, offset);
    if (newline === -1) break;
    try {
      const line = new TextDecoder("utf-8", { fatal: true }).decode(raw.subarray(offset, newline));
      if (line.trim()) records.push(parseRecord(line, offset));
    } catch (error) {
      if (error instanceof LedgerReadError) throw error;
      throw new LedgerReadError("ledger_corruption", offset);
    }
    offset = newline + 1;
  }
  let pendingRecord: StateLedgerEntry | undefined;
  if (offset < raw.length) {
    const tail = raw.subarray(offset);
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let text: string;
    let incompleteUtf8 = false;
    try {
      text = decoder.decode(tail, { stream: true });
      try { decoder.decode(); } catch { incompleteUtf8 = true; }
    } catch { throw new LedgerReadError("ledger_corruption", offset); }
    try {
      if (incompleteUtf8) {
        try { JSON.parse(text); } catch (error) {
          if (truncatedJson(text, error, true)) return { status: "incomplete_tail", records, byteLength: raw.length, completeBytes: offset, lastSequence };
        }
        throw new LedgerReadError("ledger_corruption", offset);
      }
      pendingRecord = parseRecord(text, offset);
    } catch (error) {
      if (error instanceof LedgerReadError) throw error;
      if (!truncatedJson(text, error)) throw new LedgerReadError("ledger_corruption", offset);
    }
    return { status: "incomplete_tail", records, byteLength: raw.length, completeBytes: offset, lastSequence, pendingRecord };
  }
  return { status: "complete", records, byteLength: raw.length, completeBytes: raw.length, lastSequence };
}

export async function readLedgerSnapshot(rootDir: string, options: LedgerSnapshotOptions = {}): Promise<LedgerSnapshot> {
  const maxBytes = options.maxBytes ?? 64 * 1024 * 1024;
  const maxAttempts = options.maxAttempts ?? 3;
  if (![maxBytes, maxAttempts].every((value) => Number.isSafeInteger(value) && value > 0)) {
    throw new Error("Snapshot limits must be positive safe integers.");
  }
  const paths = getStateLedgerPaths(rootDir);
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const manifestBefore = await metadata(paths.manifestPath);
    if (manifestBefore && manifestBefore.size > BigInt(maxBytes)) throw new LedgerReadError("snapshot_limit");
    let handle;
    try { handle = await open(paths.ledgerPath, "r"); }
    catch (error) { if (!isMissingFileError(error)) throw error; }
    try {
      const before = handle ? await handle.stat({ bigint: true }) : undefined;
      if (before && before.size > BigInt(maxBytes)) throw new LedgerReadError("snapshot_limit");
      const raw = Buffer.alloc(Number(before?.size ?? 0));
      let count = 0;
      while (handle && count < raw.length) {
        const read = await handle.read(raw, count, raw.length - count, count);
        if (!read.bytesRead) break;
        count += read.bytesRead;
      }
      let result: LedgerSnapshot | undefined;
      let failure: unknown;
      try {
        await readStoreManifest(rootDir);
        result = parseBytes(raw);
      } catch (error) { failure = error; }
      if (count !== raw.length || !same(before, handle ? await handle.stat({ bigint: true }) : undefined)
        || !same(before, await metadata(paths.ledgerPath))
        || !same(manifestBefore, await metadata(paths.manifestPath))) continue;
      if (failure) throw failure;
      return result!;
    } finally { await handle?.close(); }
  }
  return { status: "in_progress", records: [], byteLength: null, completeBytes: null, lastSequence: null };
}

export function completeSnapshotRecords(snapshot: LedgerSnapshot): StateLedgerEntry[] {
  if (snapshot.status !== "complete") throw new LedgerReadError("incomplete_snapshot");
  return snapshot.records;
}
