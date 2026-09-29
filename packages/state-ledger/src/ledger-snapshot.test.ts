import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { AppendOnlyStore } from "./append-only-store.js";
import { readLedgerSnapshot } from "./ledger-snapshot.js";

async function seeded() {
  const rootDir = await mkdtemp(join(tmpdir(), "data-snapshot-"));
  const store = await AppendOnlyStore.open({ rootDir });
  const record = await store.appendRecord({ kind: "evidence_ref", payload: { kind: "log", label: "safe" } });
  return { rootDir, store, record };
}

describe("validated visible ledger snapshots", () => {
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
});
