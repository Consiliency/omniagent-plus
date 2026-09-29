import { mkdtemp, open, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import type { BigIntStats, PathLike, StatOptions } from "node:fs";
import type * as FsPromises from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", async (original) => {
  const actual = await original<typeof FsPromises>();
  return { ...actual, stat: vi.fn(actual.stat), open: vi.fn(actual.open) };
});

import { AppendOnlyStore } from "./append-only-store.js";
import { readLedgerSnapshot } from "./ledger-snapshot.js";
import { ensureParentDirectory } from "./schema.js";

async function seeded() {
  const rootDir = await mkdtemp(join(tmpdir(), "data-snapshot-"));
  const store = await AppendOnlyStore.open({ rootDir });
  const record = await store.appendRecord({ kind: "evidence_ref", payload: { kind: "log", label: "safe" } });
  return { rootDir, store, record };
}

describe("validated visible ledger snapshots", () => {
  it("syncs existing ancestor entries even when another initializer created them", async () => {
    const directory = await mkdtemp(join(tmpdir(), "data-directory-race-"));
    const { open: actualOpen } = await vi.importActual<typeof FsPromises>("node:fs/promises");
    const sync = vi.fn(async () => undefined);
    const close = vi.fn(async () => undefined);
    vi.mocked(open).mockResolvedValue({ sync, close } as unknown as Awaited<ReturnType<typeof open>>);
    const ancestors: string[] = [];
    for (let current = directory; ; current = dirname(current)) {
      ancestors.push(current);
      if (dirname(current) === current) break;
    }
    try {
      await ensureParentDirectory(join(directory, "entry"));
      expect(vi.mocked(open).mock.calls.map(([path]) => path)).toEqual(ancestors);
      expect(sync).toHaveBeenCalledTimes(ancestors.length);
      expect(close).toHaveBeenCalledTimes(ancestors.length);
    } finally { vi.mocked(open).mockImplementation(actualOpen); }
  });

  it("inspects an absent root without creating it", async () => {
    const parent = await mkdtemp(join(tmpdir(), "data-readonly-"));
    const rootDir = join(parent, "absent");
    const store = await AppendOnlyStore.open({ rootDir, readOnly: true });
    expect(await store.listRecords()).toEqual([]);
    expect((await store.getManifest()).lastSequence).toBe(0);
    expect(await readdir(parent)).toEqual([]);
    await expect(store.appendRecord({ kind: "evidence_ref", payload: { kind: "log", label: "safe" } })).rejects.toThrow(/read.only/i);
    expect(await readdir(parent)).toEqual([]);
  });

  it("reports a partial tail behind a legacy lock without mutation", async () => {
    const { rootDir, store, record } = await seeded();
    const tail = '{"schema":';
    await writeFile(store.paths.ledgerPath, tail, { flag: "a" });
    await writeFile(store.paths.storeLockPath, "legacy");
    const before = await readFile(store.paths.ledgerPath);
    const manifest = await readFile(store.paths.manifestPath);
    const snapshot = await readLedgerSnapshot(rootDir);
    expect(snapshot.status).toBe("incomplete_tail");
    expect(snapshot.records).toEqual([record]);
    expect(snapshot.completeBytes).toBe(before.length - Buffer.byteLength(tail));
    const readonly = await AppendOnlyStore.open({ rootDir, readOnly: true });
    await expect(readonly.listRecords()).rejects.toMatchObject({ code: "incomplete_snapshot" });
    expect(await readFile(store.paths.ledgerPath)).toEqual(before);
    expect(await readFile(store.paths.manifestPath)).toEqual(manifest);
    expect(await readFile(store.paths.storeLockPath, "utf8")).toBe("legacy");
    expect(await readdir(rootDir)).not.toContain(".recovery");
  });

  it("does not lose a valid record whose final newline was interrupted", async () => {
    const { rootDir, store, record } = await seeded();
    await writeFile(store.paths.ledgerPath, JSON.stringify(record));
    const snapshot = await readLedgerSnapshot(rootDir);
    expect(snapshot).toMatchObject({ status: "incomplete_tail", records: [], pendingRecord: JSON.parse(JSON.stringify(record)) });
    const reopened = await AppendOnlyStore.open({ rootDir });
    expect(await reopened.listRecords()).toEqual([record]);
    expect(await readFile(store.paths.ledgerPath, "utf8")).toBe(`${JSON.stringify(record)}\n`);
  });

  it("rejects complete malformed JSON, duplicate identities and nonincreasing sequences", async () => {
    const { rootDir, store, record } = await seeded();
    for (const raw of [
      '{"broken":}\n',
      `${JSON.stringify(record)}\n${JSON.stringify({ ...record, sequence: 2 })}\n`,
      `${JSON.stringify(record)}\n${JSON.stringify({ ...record, recordId: "other" })}\n`,
      `${JSON.stringify({ ...record, sequence: Number.MAX_SAFE_INTEGER + 1 })}\n`,
    ]) {
      await writeFile(store.paths.ledgerPath, raw);
      await expect(readLedgerSnapshot(rootDir)).rejects.toMatchObject({ code: "ledger_corruption" });
      await expect(AppendOnlyStore.open({ rootDir })).rejects.toMatchObject({ code: "ledger_corruption" });
      expect(await readFile(store.paths.ledgerPath, "utf8")).toBe(raw);
    }
  });

  it("bounds reads and rejects unsupported versions without disclosing raw payloads", async () => {
    const { rootDir, store, record } = await seeded();
    await expect(readLedgerSnapshot(rootDir, { maxBytes: 1 })).rejects.toMatchObject({ code: "snapshot_limit" });
    await expect(readLedgerSnapshot(rootDir, { maxAttempts: 0 })).rejects.toThrow(/positive safe integer/);
    await writeFile(store.paths.ledgerPath, `${JSON.stringify({ ...record, schemaVersion: 2 })}\n`);
    await expect(readLedgerSnapshot(rootDir)).rejects.toMatchObject({ code: "unsupported_schema" });
    await writeFile(store.paths.ledgerPath, '{"secret":"synthetic-private-value"}\n');
    try { await readLedgerSnapshot(rootDir); throw new Error("missing rejection"); }
    catch (error) { expect(String(error)).not.toContain("synthetic-private-value"); }
  });

  it("preserves complete historical content records that fail the metadata policy", async () => {
    const { rootDir, store, record } = await seeded();
    const historical = { ...record, kind: "runtime_event", payload: { schema: "runtime_event.v0.1", eventId: "historical",
      sequence: 1, sessionId: "historical", type: "runtime.turn.started", occurredAt: record.recordedAt,
      payload: { message: "Ordinary historical private conversation", state: "running" }, redaction: "metadata_only", terminal: false } };
    for (const newline of ["", "\n"]) {
      const raw = `${JSON.stringify(historical)}${newline}`;
      await writeFile(store.paths.ledgerPath, raw);
      await expect(readLedgerSnapshot(rootDir)).rejects.toMatchObject({ code: "ledger_corruption" });
      await expect(AppendOnlyStore.open({ rootDir })).rejects.toMatchObject({ code: "ledger_corruption" });
      expect(await readFile(store.paths.ledgerPath, "utf8")).toBe(raw);
      expect(await readdir(rootDir)).not.toContain(".recovery");
    }
  });

  it("checks the whole JSON prefix before permitting tail repair", async () => {
    const { rootDir, store } = await seeded();
    for (const raw of ['{"malformed":@,"x":tru', '{"x":truex,"y":tr', '{"x":"\\uZZ', '{"x":1.e', '[1,]']) {
      await writeFile(store.paths.ledgerPath, raw);
      await expect(readLedgerSnapshot(rootDir)).rejects.toMatchObject({ code: "ledger_corruption" });
      await expect(AppendOnlyStore.open({ rootDir })).rejects.toMatchObject({ code: "ledger_corruption" });
      expect(await readFile(store.paths.ledgerPath, "utf8")).toBe(raw);
    }
    for (const raw of ['{"x":tru', '{"x":nul', '{"x":1e+', '{"x":"\\u12', '{"x":[false,']) {
      await writeFile(store.paths.ledgerPath, raw);
      expect((await readLedgerSnapshot(rootDir)).status).toBe("incomplete_tail");
    }
  });

  it("bounds malformed manifest diagnostics on read and write paths", async () => {
    const { rootDir, store } = await seeded();
    const raw = "Bearer synthetic-private-marker malformed JSON";
    await writeFile(store.paths.manifestPath, raw);
    for (const action of [() => readLedgerSnapshot(rootDir), () => AppendOnlyStore.open({ rootDir })]) {
      await expect(action()).rejects.toMatchObject({ code: "ledger_corruption", message: "State ledger ledger corruption." });
      expect(await readFile(store.paths.manifestPath, "utf8")).toBe(raw);
    }
  });

  it("returns no records when every captured snapshot changes during validation", async () => {
    const { rootDir, store } = await seeded();
    const { stat: actualStat } = await vi.importActual<typeof FsPromises>("node:fs/promises");
    let attempts = 0;
    vi.mocked(stat).mockImplementation((async (path: PathLike, options: StatOptions & { bigint: true }) => {
      const result = await actualStat(path, options);
      if (String(path) !== store.paths.ledgerPath) return result;
      attempts += 1;
      return Object.assign(Object.create(Object.getPrototypeOf(result)), result, { mtimeNs: (result as BigIntStats).mtimeNs + 1n });
    }) as typeof stat);
    try {
      expect(await readLedgerSnapshot(rootDir, { maxAttempts: 3 })).toEqual({
        status: "in_progress", records: [], byteLength: null, completeBytes: null, lastSequence: null,
      });
      expect(attempts).toBe(3);
    } finally { vi.mocked(stat).mockImplementation(actualStat); }
    expect((await readLedgerSnapshot(rootDir)).status).toBe("complete");
  });

  it("repairs a split UTF-8 codepoint only inside a valid unfinished string", async () => {
    const { rootDir, store } = await seeded();
    const raw = Buffer.concat([Buffer.from('{"x":"'), Buffer.from([0xc3])]);
    await writeFile(store.paths.ledgerPath, raw);
    expect((await readLedgerSnapshot(rootDir)).status).toBe("incomplete_tail");
    await AppendOnlyStore.open({ rootDir });
    const evidence = await readdir(join(rootDir, ".recovery"));
    expect(await readFile(join(rootDir, ".recovery", evidence[0]!))).toEqual(raw);
    for (const corrupt of [Buffer.from([0xc3]), Buffer.concat([Buffer.from('{"x":'), Buffer.from([0xc3])]),
      Buffer.concat([Buffer.from('{"x":"\\u'), Buffer.from([0xc3])]), Buffer.from([0xff])]) {
      await writeFile(store.paths.ledgerPath, corrupt);
      await expect(readLedgerSnapshot(rootDir)).rejects.toMatchObject({ code: "ledger_corruption" });
      await expect(AppendOnlyStore.open({ rootDir })).rejects.toMatchObject({ code: "ledger_corruption" });
      expect(await readFile(store.paths.ledgerPath)).toEqual(corrupt);
    }
  });

  it("fails closed when a missing ledger contradicts a nonempty manifest", async () => {
    const { rootDir, store } = await seeded();
    const before = await readFile(store.paths.manifestPath);
    await rename(store.paths.ledgerPath, `${store.paths.ledgerPath}.preserved`);
    await expect(readLedgerSnapshot(rootDir)).rejects.toMatchObject({ code: "ledger_corruption" });
    await expect(AppendOnlyStore.open({ rootDir })).rejects.toMatchObject({ code: "ledger_corruption" });
    expect(await readFile(store.paths.manifestPath)).toEqual(before);
  });

  it("bounds acknowledged growth to the configured reopen and compaction capacity", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "data-capacity-"));
    const store = await AppendOnlyStore.open({ rootDir, maxSnapshotBytes: 400 });
    const input = { kind: "evidence_ref" as const, payload: { kind: "log" as const, label: "capacity" } };
    await store.appendRecord(input);
    const before = await readFile(store.paths.ledgerPath);
    await expect(store.appendRecord(input)).rejects.toMatchObject({ code: "snapshot_limit" });
    expect(await readFile(store.paths.ledgerPath)).toEqual(before);
    await expect((await AppendOnlyStore.open({ rootDir, maxSnapshotBytes: 400 })).listRecords()).resolves.toHaveLength(1);
    const enlarged = await AppendOnlyStore.open({ rootDir, maxSnapshotBytes: 1024 });
    expect((await enlarged.appendRecord(input)).sequence).toBe(2);
    await enlarged.compactRecords(() => false);
    expect((await enlarged.appendRecord(input)).sequence).toBe(3);
    await expect(AppendOnlyStore.open({ rootDir, maxSnapshotBytes: 0 })).rejects.toThrow(/positive safe integers/);
  });

  it("checks manifest capacity before creation and numeric high-water growth", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "data-manifest-capacity-"));
    await expect(AppendOnlyStore.open({ rootDir, maxSnapshotBytes: 200 })).rejects.toMatchObject({ code: "snapshot_limit" });
    expect(await readdir(rootDir)).not.toContain("manifest.json");
    expect(await readdir(rootDir)).not.toContain("ledger.jsonl");
    const seed = await AppendOnlyStore.open({ rootDir });
    await writeFile(seed.paths.manifestPath, `${JSON.stringify({ ...await seed.getManifest(), lastSequence: 9 }, null, 2)}\n`);
    const capacity = (await readFile(seed.paths.manifestPath)).length;
    const store = await AppendOnlyStore.open({ rootDir, maxSnapshotBytes: capacity });
    const before = await readFile(store.paths.manifestPath);
    const input = { kind: "evidence_ref" as const, recordId: "x", payload: { kind: "log" as const, label: "x" } };
    await expect(store.appendRecord(input)).rejects.toMatchObject({ code: "snapshot_limit" });
    expect(await readFile(store.paths.manifestPath)).toEqual(before);
    expect(await readdir(rootDir)).not.toContain("ledger.jsonl");
    const enlarged = await AppendOnlyStore.open({ rootDir, maxSnapshotBytes: capacity + 1 });
    expect((await enlarged.appendRecord(input)).sequence).toBe(10);
    expect(await (await AppendOnlyStore.open({ rootDir, maxSnapshotBytes: capacity + 1 })).listRecords()).toHaveLength(1);
  });

  it("rejects compaction recovery-counter growth before publishing oversized checkpoints", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "data-compact-capacity-"));
    const seed = await AppendOnlyStore.open({ rootDir });
    await seed.appendRecord({ kind: "evidence_ref", recordId: "x", payload: { kind: "log", label: "x" } });
    await writeFile(seed.paths.manifestPath, `${JSON.stringify({ ...await seed.getManifest(), recoveredTailTruncations: 9 }, null, 2)}\n`);
    const capacity = (await readFile(seed.paths.manifestPath)).length;
    const store = await AppendOnlyStore.open({ rootDir, maxSnapshotBytes: capacity });
    const before = await readFile(store.paths.manifestPath);
    await writeFile(store.paths.ledgerPath, "{", { flag: "a" });
    await expect(store.compactRecords(() => false)).rejects.toMatchObject({ code: "snapshot_limit" });
    expect(await readFile(store.paths.manifestPath)).toEqual(before);
    expect((await readLedgerSnapshot(rootDir, { maxBytes: capacity })).records).toHaveLength(1);
    const evidence = await readdir(join(rootDir, ".recovery"));
    expect(await readFile(join(rootDir, ".recovery", evidence[0]!), "utf8")).toBe("{");
  });

  it("checks the newline byte before finalizing a valid record at capacity", async () => {
    const { rootDir, store } = await seeded();
    await store.appendRecord({ kind: "evidence_ref", payload: { kind: "log", label: "a".repeat(120) } });
    const raw = (await readFile(store.paths.ledgerPath)).subarray(0, -1);
    await writeFile(store.paths.ledgerPath, raw);
    await expect(AppendOnlyStore.open({ rootDir, maxSnapshotBytes: raw.length })).rejects.toMatchObject({ code: "snapshot_limit" });
    expect(await readFile(store.paths.ledgerPath)).toEqual(raw);
    expect(await readdir(rootDir)).not.toContain(".recovery");
    const reopened = await AppendOnlyStore.open({ rootDir, maxSnapshotBytes: raw.length + 1 });
    expect(await reopened.listRecords()).toHaveLength(2);
  });

  it("bounds compaction serialization after normalizing historical missing scope", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "data-normalized-capacity-"));
    const seed = await AppendOnlyStore.open({ rootDir });
    const timestamp = "2026-06-30T00:00:00Z";
    const record = await seed.appendRecord({ kind: "turn", payload: { sessionId: "session", turnId: "turn", idempotencyKey: "turn",
      state: "completed", createdAt: timestamp, updatedAt: timestamp } });
    const raw = `${JSON.stringify({ ...record, sessionId: undefined, turnId: undefined, taskId: undefined })}\n`;
    await writeFile(seed.paths.ledgerPath, raw);
    const store = await AppendOnlyStore.open({ rootDir, maxSnapshotBytes: Buffer.byteLength(raw) });
    const before = await readFile(store.paths.manifestPath);
    await expect(store.compactRecords(() => true)).rejects.toMatchObject({ code: "snapshot_limit" });
    expect(await readFile(store.paths.ledgerPath, "utf8")).toBe(raw);
    expect(await readFile(store.paths.manifestPath)).toEqual(before);
    expect(await store.listRecords()).toHaveLength(1);
    await writeFile(store.paths.ledgerPath, raw.trimEnd());
    expect(await readLedgerSnapshot(rootDir)).toMatchObject({ status: "incomplete_tail", pendingRecord: { sessionId: "session", turnId: "turn" } });
  });
});
