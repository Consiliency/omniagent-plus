import { randomUUID } from "node:crypto";
import {
  open,
  readFile,
  rm,
  truncate,
  unlink,
  writeFile,
} from "node:fs/promises";

import {
  stateLedgerRecordSchema,
  type StateLedgerEntry,
  type StateLedgerRecordKind,
} from "@omniagent-plus/core-contracts";

import {
  assertBoundedPayload,
  CURRENT_STATE_LEDGER_SCHEMA_VERSION,
  DEFAULT_MAX_PAYLOAD_BYTES,
  ensureParentDirectory,
  ensureStateLedgerDirectories,
  getStateLedgerPaths,
  nowIsoString,
  type StateLedgerIndexSnapshot,
  type StateLedgerPaths,
  type StoreManifest,
  writeJsonAtomic,
} from "./schema.js";
import { migrateStoreManifest, writeStoreManifest } from "./migrations.js";

export interface AppendOnlyStoreOptions {
  readonly rootDir: string;
  readonly maxPayloadBytes?: number;
  readonly lockRetryMs?: number;
  readonly lockTimeoutMs?: number;
}

type StateLedgerPayloadForKind<TKind extends StateLedgerRecordKind> = Extract<
  StateLedgerEntry,
  { kind: TKind }
>["payload"];

export interface AppendRecordInput<TKind extends StateLedgerRecordKind> {
  readonly kind: TKind;
  readonly payload: StateLedgerPayloadForKind<TKind>;
  readonly sessionId?: string;
  readonly turnId?: string;
  readonly taskId?: string;
  readonly recordedAt?: string;
  readonly recordId?: string;
  readonly schemaVersion?: number;
}

export interface RecordQuery {
  readonly kind?: StateLedgerRecordKind | StateLedgerRecordKind[];
  readonly sessionId?: string;
  readonly turnId?: string;
  readonly taskId?: string;
}

interface LedgerScanResult {
  readonly records: StateLedgerEntry[];
  readonly truncateOffset: number | null;
}

export interface LedgerCompactionResult {
  readonly keptRecords: StateLedgerEntry[];
  readonly prunedRecords: StateLedgerEntry[];
  readonly manifest: StoreManifest;
}

async function sleep(milliseconds: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

export async function withFilesystemLock<T>(
  lockPath: string,
  callback: () => Promise<T>,
  options: {
    readonly retryMs?: number;
    readonly timeoutMs?: number;
  } = {},
): Promise<T> {
  const retryMs = options.retryMs ?? 25;
  const timeoutMs = options.timeoutMs ?? 2_000;
  const deadline = Date.now() + timeoutMs;

  while (true) {
    try {
      await ensureParentDirectory(lockPath);
      const handle = await open(lockPath, "wx");
      try {
        return await callback();
      } finally {
        await handle.close();
        await unlink(lockPath).catch(() => undefined);
      }
    } catch (error) {
      const lockBusy =
        error instanceof Error && "code" in error && error.code === "EEXIST";
      if (!lockBusy) {
        throw error;
      }
      if (Date.now() >= deadline) {
        throw new Error(`Timed out waiting for state-ledger lock ${lockPath}.`);
      }
      await sleep(retryMs);
    }
  }
}

async function scanLedgerFile(ledgerPath: string): Promise<LedgerScanResult> {
  try {
    const raw = await readFile(ledgerPath, "utf8");
    if (raw.length === 0) {
      return { records: [], truncateOffset: null };
    }

    const endedWithNewline = raw.endsWith("\n");
    const lines = raw.split("\n");
    if (endedWithNewline && lines.at(-1) === "") {
      lines.pop();
    }

    const records: StateLedgerEntry[] = [];
    let offset = 0;
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (line === undefined) {
        continue;
      }
      const lineStart = offset;
      const isLastLine = index === lines.length - 1;
      offset += Buffer.byteLength(line, "utf8");
      if (index < lines.length - 1 || endedWithNewline) {
        offset += 1;
      }

      if (line.trim().length === 0) {
        continue;
      }

      try {
        const parsed = stateLedgerRecordSchema.parse(
          JSON.parse(line),
        ) as StateLedgerEntry;
        records.push(parsed);
      } catch (error) {
        if (isLastLine) {
          return {
            records,
            truncateOffset: lineStart,
          };
        }
        throw error;
      }
    }

    return { records, truncateOffset: null };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return { records: [], truncateOffset: null };
    }
    throw error;
  }
}

function buildIndexSnapshot(
  records: StateLedgerEntry[],
  updatedAt: string,
): StateLedgerIndexSnapshot {
  const byKind: Record<string, number[]> = {};
  const bySession: Record<string, number[]> = {};
  const byTask: Record<string, number[]> = {};

  for (const record of records) {
    const kindBucket = (byKind[record.kind] ??= []);
    kindBucket.push(record.sequence);

    if (record.sessionId !== undefined) {
      const sessionBucket = (bySession[record.sessionId] ??= []);
      sessionBucket.push(record.sequence);
    }

    if (record.taskId !== undefined) {
      const taskBucket = (byTask[record.taskId] ??= []);
      taskBucket.push(record.sequence);
    }
  }

  return {
    updatedAt,
    byKind,
    bySession,
    byTask,
  };
}

async function writeLedgerFile(
  ledgerPath: string,
  records: StateLedgerEntry[],
): Promise<void> {
  await ensureParentDirectory(ledgerPath);
  const raw =
    records.length === 0
      ? ""
      : `${records.map((record) => JSON.stringify(record)).join("\n")}\n`;
  await writeFile(ledgerPath, raw, "utf8");
}

export class AppendOnlyStore {
  readonly paths: StateLedgerPaths;

  readonly maxPayloadBytes: number;

  private readonly lockRetryMs: number;

  private readonly lockTimeoutMs: number;

  private constructor(options: AppendOnlyStoreOptions) {
    this.paths = getStateLedgerPaths(options.rootDir);
    this.maxPayloadBytes =
      options.maxPayloadBytes ?? DEFAULT_MAX_PAYLOAD_BYTES;
    this.lockRetryMs = options.lockRetryMs ?? 25;
    this.lockTimeoutMs = options.lockTimeoutMs ?? 2_000;
  }

  static async open(options: AppendOnlyStoreOptions): Promise<AppendOnlyStore> {
    const store = new AppendOnlyStore(options);
    await store.initialize();
    return store;
  }

  async initialize(): Promise<void> {
    await ensureStateLedgerDirectories(this.paths.rootDir);
    await this.withStoreLock(async () => {
      const migration = await migrateStoreManifest(this.paths.rootDir);
      const scan = await scanLedgerFile(this.paths.ledgerPath);
      let records = scan.records;
      let recoveredTailTruncations =
        migration.manifest.recoveredTailTruncations;

      if (scan.truncateOffset !== null) {
        await truncate(this.paths.ledgerPath, scan.truncateOffset);
        recoveredTailTruncations += 1;
        records = scan.records;
      }

      const updatedAt = nowIsoString();
      await this.writeIndexes(records, updatedAt);
      await writeStoreManifest(this.paths.rootDir, {
        ...migration.manifest,
        recordCount: records.length,
        updatedAt,
        recoveredTailTruncations,
      });
    });
  }

  async getManifest(): Promise<StoreManifest> {
    const migration = await migrateStoreManifest(this.paths.rootDir);
    return migration.manifest;
  }

  async listRecords(): Promise<StateLedgerEntry[]> {
    const scan = await scanLedgerFile(this.paths.ledgerPath);
    return scan.records;
  }

  async queryRecords(query: RecordQuery = {}): Promise<StateLedgerEntry[]> {
    const kinds =
      query.kind === undefined
        ? undefined
        : new Set(Array.isArray(query.kind) ? query.kind : [query.kind]);
    return (await this.listRecords()).filter((record) => {
      if (kinds !== undefined && !kinds.has(record.kind)) {
        return false;
      }
      if (query.sessionId !== undefined && record.sessionId !== query.sessionId) {
        return false;
      }
      if (query.turnId !== undefined && record.turnId !== query.turnId) {
        return false;
      }
      if (query.taskId !== undefined && record.taskId !== query.taskId) {
        return false;
      }
      return true;
    });
  }

  async appendRecord<TKind extends StateLedgerRecordKind>(
    input: AppendRecordInput<TKind>,
  ): Promise<Extract<StateLedgerEntry, { kind: TKind }>> {
    return this.withStoreLock(async () => {
      const manifest = await this.getManifest();
      const scan = await scanLedgerFile(this.paths.ledgerPath);
      if (scan.truncateOffset !== null) {
        await truncate(this.paths.ledgerPath, scan.truncateOffset);
      }

      const nextSequence = manifest.lastSequence + 1;
      assertBoundedPayload(input.payload, this.maxPayloadBytes);
      const record = stateLedgerRecordSchema.parse({
        schema: "state_ledger_record.v0.1",
        recordId: input.recordId ?? `${input.kind}-${nextSequence}-${randomUUID()}`,
        sequence: nextSequence,
        kind: input.kind,
        schemaVersion:
          input.schemaVersion ?? CURRENT_STATE_LEDGER_SCHEMA_VERSION,
        recordedAt: nowIsoString(input.recordedAt),
        sessionId: input.sessionId,
        turnId: input.turnId,
        taskId: input.taskId,
        payload: input.payload,
      }) as Extract<StateLedgerEntry, { kind: TKind }>;

      await ensureParentDirectory(this.paths.ledgerPath);
      await writeFile(
        this.paths.ledgerPath,
        `${JSON.stringify(record)}\n`,
        {
          encoding: "utf8",
          flag: "a",
        },
      );

      const records = [...scan.records, record];
      const updatedAt = nowIsoString();
      await this.writeIndexes(records, updatedAt);
      await writeStoreManifest(this.paths.rootDir, {
        ...manifest,
        recordCount: records.length,
        lastSequence: nextSequence,
        updatedAt,
      });

      return record;
    });
  }

  async compactRecords(
    keepRecord: (record: StateLedgerEntry) => boolean,
  ): Promise<LedgerCompactionResult> {
    return this.withStoreLock(async () => {
      const manifest = await this.getManifest();
      const scan = await scanLedgerFile(this.paths.ledgerPath);
      const keptRecords: StateLedgerEntry[] = [];
      const prunedRecords: StateLedgerEntry[] = [];

      for (const record of scan.records) {
        if (keepRecord(record)) {
          keptRecords.push(record);
        } else {
          prunedRecords.push(record);
        }
      }

      await writeLedgerFile(this.paths.ledgerPath, keptRecords);
      const updatedAt = nowIsoString();
      await this.writeIndexes(keptRecords, updatedAt);
      const nextManifest: StoreManifest = {
        ...manifest,
        recordCount: keptRecords.length,
        updatedAt,
      };
      await writeStoreManifest(this.paths.rootDir, nextManifest);

      return {
        keptRecords,
        prunedRecords,
        manifest: nextManifest,
      };
    });
  }

  async resetForTests(): Promise<void> {
    await this.withStoreLock(async () => {
      await rm(this.paths.rootDir, { recursive: true, force: true });
      await ensureStateLedgerDirectories(this.paths.rootDir);
      await migrateStoreManifest(this.paths.rootDir);
    });
  }

  private async writeIndexes(
    records: StateLedgerEntry[],
    updatedAt: string,
  ): Promise<void> {
    const snapshot = buildIndexSnapshot(records, updatedAt);
    await Promise.all([
      writeJsonAtomic(this.paths.kindIndexPath, {
        updatedAt: snapshot.updatedAt,
        byKind: snapshot.byKind,
      }),
      writeJsonAtomic(this.paths.sessionIndexPath, {
        updatedAt: snapshot.updatedAt,
        bySession: snapshot.bySession,
      }),
      writeJsonAtomic(this.paths.taskIndexPath, {
        updatedAt: snapshot.updatedAt,
        byTask: snapshot.byTask,
      }),
    ]);
  }

  private async withStoreLock<T>(callback: () => Promise<T>): Promise<T> {
    return withFilesystemLock(this.paths.storeLockPath, callback, {
      retryMs: this.lockRetryMs,
      timeoutMs: this.lockTimeoutMs,
    });
  }
}
