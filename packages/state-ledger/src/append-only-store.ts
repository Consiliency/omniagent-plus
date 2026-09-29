import { randomUUID } from "node:crypto";
import {
  open,
  chmod,
  mkdir,
  stat,
  rm,
} from "node:fs/promises";
import { join } from "node:path";

import {
  stateLedgerRecordSchema,
  type StateLedgerEntry,
  type StateLedgerRecordKind,
} from "@consiliency/runtime-provider";

import {
  assertBoundedPayload,
  CURRENT_STATE_LEDGER_SCHEMA_VERSION,
  DEFAULT_MAX_PAYLOAD_BYTES,
  isMissingFileError,
  syncDirectory,
  writeFileAtomic,
  ensureStateLedgerDirectories,
  getStateLedgerPaths,
  nowIsoString,
  type StateLedgerIndexSnapshot,
  type StateLedgerPaths,
  type StoreManifest,
  writeJsonAtomic,
} from "./schema.js";
import { createEmptyManifest, migrateStoreManifest, readStoreManifest, writeStoreManifest } from "./migrations.js";
import { completeSnapshotRecords, DEFAULT_MAX_SNAPSHOT_BYTES, LedgerReadError, readLedgerSnapshot, type LedgerSnapshotOptions } from "./ledger-snapshot.js";
import { withFilesystemLock } from "./filesystem-lock.js";
export { withFilesystemLock } from "./filesystem-lock.js";

export interface AppendOnlyStoreOptions {
  readonly rootDir: string;
  readonly maxPayloadBytes?: number;
  readonly lockRetryMs?: number;
  readonly lockTimeoutMs?: number;
  readonly readOnly?: boolean;
  readonly maxSnapshotBytes?: number;
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

export interface LedgerCompactionResult {
  readonly keptRecords: StateLedgerEntry[];
  readonly prunedRecords: StateLedgerEntry[];
  readonly manifest: StoreManifest;
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

export class AppendOnlyStore {
  readonly paths: StateLedgerPaths;

  readonly maxPayloadBytes: number;
  readonly maxSnapshotBytes: number;

  private readonly lockRetryMs: number;

  private readonly lockTimeoutMs: number;
  private readonly readOnly: boolean;
  private cache?: { identity: string; count: number; lastSequence: number; ids: Set<string> };

  private constructor(options: AppendOnlyStoreOptions) {
    this.paths = getStateLedgerPaths(options.rootDir);
    this.maxPayloadBytes =
      options.maxPayloadBytes ?? DEFAULT_MAX_PAYLOAD_BYTES;
    this.maxSnapshotBytes = options.maxSnapshotBytes ?? DEFAULT_MAX_SNAPSHOT_BYTES;
    if (!Number.isSafeInteger(this.maxSnapshotBytes) || this.maxSnapshotBytes <= 0) {
      throw new Error("Snapshot limits must be positive safe integers.");
    }
    this.lockRetryMs = options.lockRetryMs ?? 25;
    this.lockTimeoutMs = options.lockTimeoutMs ?? 2_000;
    this.readOnly = options.readOnly ?? false;
  }

  static async open(options: AppendOnlyStoreOptions): Promise<AppendOnlyStore> {
    const store = new AppendOnlyStore(options);
    if (!store.readOnly) await store.initialize();
    return store;
  }

  async initialize(): Promise<void> {
    this.assertWritable();
    await ensureStateLedgerDirectories(this.paths.rootDir);
    await this.withStoreLock(async () => {
      const existing = await readStoreManifest(this.paths.rootDir);
      if (!existing && await this.ledgerIdentity() !== "absent") throw new LedgerReadError("ledger_corruption");
      const repaired = await this.writableRecords();
      const migration = await migrateStoreManifest(this.paths.rootDir);
      const manifest = {
        ...migration.manifest,
        recordCount: repaired.records.length,
        lastSequence: Math.max(migration.manifest.lastSequence, repaired.records.at(-1)?.sequence ?? 0),
        updatedAt: nowIsoString(),
        recoveredTailTruncations: migration.manifest.recoveredTailTruncations + repaired.truncations,
      };
      await this.writeIndexes(repaired.records, manifest.updatedAt);
      await writeStoreManifest(this.paths.rootDir, manifest);
      await this.cacheRecords(repaired.records);
    });
  }

  async getManifest(): Promise<StoreManifest> {
    return await readStoreManifest(this.paths.rootDir) ?? createEmptyManifest(nowIsoString());
  }

  async readSnapshot(options: LedgerSnapshotOptions = {}) {
    return readLedgerSnapshot(this.paths.rootDir, { maxBytes: this.maxSnapshotBytes, ...options });
  }

  async listRecords(): Promise<StateLedgerEntry[]> {
    return completeSnapshotRecords(await this.readSnapshot());
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
    this.assertWritable();
    return this.withStoreLock(async () => {
      const manifest = await readStoreManifest(this.paths.rootDir);
      if (!manifest) throw new LedgerReadError("ledger_corruption");
      let truncations = 0;
      if (!this.cache || this.cache.identity !== await this.ledgerIdentity()) {
        const repaired = await this.writableRecords();
        truncations = repaired.truncations;
        await this.cacheRecords(repaired.records);
      }
      const cache = this.cache!;
      const nextSequence = Math.max(manifest.lastSequence, cache.lastSequence) + 1;
      if (!Number.isSafeInteger(nextSequence)) throw new LedgerReadError("ledger_corruption");
      assertBoundedPayload(input.payload, this.maxPayloadBytes);
      if (input.schemaVersion !== undefined && input.schemaVersion !== CURRENT_STATE_LEDGER_SCHEMA_VERSION) throw new LedgerReadError("unsupported_schema");
      const record = stateLedgerRecordSchema.parse({
        schema: "state_ledger_record.v0.1",
        recordId: input.recordId ?? `${input.kind}-${nextSequence}-${randomUUID()}`,
        sequence: nextSequence, kind: input.kind, schemaVersion: CURRENT_STATE_LEDGER_SCHEMA_VERSION,
        recordedAt: nowIsoString(input.recordedAt), sessionId: input.sessionId,
        turnId: input.turnId, taskId: input.taskId, payload: input.payload,
      }) as Extract<StateLedgerEntry, { kind: TKind }>;
      if (cache.ids.has(record.recordId)) throw new LedgerReadError("ledger_corruption");
      const serialized = `${JSON.stringify(record)}\n`;
      const existingBytes = await stat(this.paths.ledgerPath).then((value) => value.size, (error: unknown) => {
        if (isMissingFileError(error)) return 0;
        throw error;
      });
      if (existingBytes + Buffer.byteLength(serialized) > this.maxSnapshotBytes) throw new LedgerReadError("snapshot_limit");
      this.cache = undefined;
      const handle = await open(this.paths.ledgerPath, "a", 0o600);
      try { await handle.writeFile(serialized, "utf8"); await handle.sync(); }
      finally { await handle.close(); }
      await syncDirectory(this.paths.rootDir);
      await writeStoreManifest(this.paths.rootDir, {
        ...manifest, recordCount: cache.count + 1, lastSequence: nextSequence, updatedAt: nowIsoString(),
        recoveredTailTruncations: manifest.recoveredTailTruncations + truncations,
      });
      cache.count += 1;
      cache.lastSequence = nextSequence;
      cache.ids.add(record.recordId);
      cache.identity = await this.ledgerIdentity();
      this.cache = cache;
      return record;
    });
  }

  async compactRecords(
    keepRecord: (record: StateLedgerEntry, snapshot: readonly StateLedgerEntry[]) => boolean,
  ): Promise<LedgerCompactionResult> {
    this.assertWritable();
    return this.withStoreLock(async () => {
      const existing = await readStoreManifest(this.paths.rootDir);
      if (!existing) throw new LedgerReadError("ledger_corruption");
      const repaired = await this.writableRecords();
      const manifest = {
        ...existing, lastSequence: Math.max(existing.lastSequence, repaired.records.at(-1)?.sequence ?? 0),
        recoveredTailTruncations: existing.recoveredTailTruncations + repaired.truncations,
      };
      const keptRecords: StateLedgerEntry[] = [];
      const prunedRecords: StateLedgerEntry[] = [];
      for (const record of repaired.records) {
        (keepRecord(record, repaired.records) ? keptRecords : prunedRecords).push(record);
      }
      await writeStoreManifest(this.paths.rootDir, manifest);
      this.cache = undefined;
      await writeFileAtomic(this.paths.ledgerPath, keptRecords.map((record) => `${JSON.stringify(record)}\n`).join(""));
      const nextManifest = { ...manifest, recordCount: keptRecords.length, updatedAt: nowIsoString() };
      await this.writeIndexes(keptRecords, nextManifest.updatedAt);
      await writeStoreManifest(this.paths.rootDir, nextManifest);
      await this.cacheRecords(keptRecords);
      return { keptRecords, prunedRecords, manifest: nextManifest };
    });
  }

  async resetForTests(): Promise<void> {
    this.assertWritable();
    await this.withStoreLock(async () => {
      for (const path of [this.paths.ledgerPath, this.paths.manifestPath, this.paths.indexesDir, this.paths.coordinationDir, join(this.paths.rootDir, ".recovery")]) {
        await rm(path, { recursive: true, force: true });
      }
      this.cache = undefined;
      await ensureStateLedgerDirectories(this.paths.rootDir);
      await migrateStoreManifest(this.paths.rootDir);
    });
  }

  private assertWritable(): void {
    if (this.readOnly) throw new Error("State ledger is read-only.");
  }

  private async ledgerIdentity(): Promise<string> {
    try {
      const info = await stat(this.paths.ledgerPath, { bigint: true });
      return `${info.dev}:${info.ino}:${info.size}:${info.mtimeNs}:${info.ctimeNs}`;
    } catch (error) { if (isMissingFileError(error)) return "absent"; throw error; }
  }

  private async cacheRecords(records: StateLedgerEntry[]): Promise<void> {
    this.cache = { identity: await this.ledgerIdentity(), count: records.length,
      lastSequence: records.at(-1)?.sequence ?? 0, ids: new Set(records.map((record) => record.recordId)) };
  }

  private async writableRecords(): Promise<{ records: StateLedgerEntry[]; truncations: number }> {
    const snapshot = await this.readSnapshot();
    if (snapshot.status === "in_progress") throw new LedgerReadError("incomplete_snapshot");
    if (snapshot.status === "complete") return { records: snapshot.records, truncations: 0 };
    const ledger = await open(this.paths.ledgerPath, "r+");
    try {
      if (snapshot.pendingRecord) {
        await ledger.write(Buffer.from("\n"), 0, 1, snapshot.byteLength);
        await ledger.sync();
        return { records: [...snapshot.records, snapshot.pendingRecord], truncations: 0 };
      }
      const recoveryDir = join(this.paths.rootDir, ".recovery");
      await mkdir(recoveryDir, { recursive: true, mode: 0o700 });
      await chmod(recoveryDir, 0o700);
      await syncDirectory(this.paths.rootDir);
      const bytes = Buffer.alloc(snapshot.byteLength - snapshot.completeBytes);
      const read = await ledger.read(bytes, 0, bytes.length, snapshot.completeBytes);
      if (read.bytesRead !== bytes.length) throw new LedgerReadError("incomplete_snapshot");
      const evidence = await open(join(recoveryDir, `${randomUUID()}.tail`), "wx", 0o600);
      try { await evidence.writeFile(bytes); await evidence.sync(); } finally { await evidence.close(); }
      await syncDirectory(recoveryDir);
      await ledger.truncate(snapshot.completeBytes);
      await ledger.sync();
      return { records: snapshot.records, truncations: 1 };
    } finally { await ledger.close(); }
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
