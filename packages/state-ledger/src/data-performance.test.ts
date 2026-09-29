import { mkdtemp, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { AppendOnlyStore } from "./append-only-store.js";

describe("DATA append work and cache invalidation", () => {
  it.each([0, 100, 1000])("avoids rescans and index rewrites for unchanged %i-record ledgers", async (count) => {
    const rootDir = await mkdtemp(join(tmpdir(), "data-performance-"));
    const seed = await AppendOnlyStore.open({ rootDir });
    const records = Array.from({ length: count }, (_, index) => ({ schema: "state_ledger_record.v0.1", schemaVersion: 1,
      recordId: `fixture-${index}`, sequence: index + 1, kind: "evidence_ref", recordedAt: "2026-06-30T00:00:00Z", payload: { kind: "log", label: "fixture" } }));
    await writeFile(seed.paths.ledgerPath, records.map((record) => `${JSON.stringify(record)}\n`).join(""));
    const store = await AppendOnlyStore.open({ rootDir });
    const scan = vi.spyOn(store, "readSnapshot");
    const indexBefore = await stat(store.paths.kindIndexPath, { bigint: true });
    const started = performance.now();
    for (let index = 0; index < 30; index += 1) await store.appendRecord({ kind: "evidence_ref", payload: { kind: "log", label: "measured append" } });
    const elapsedMs = performance.now() - started;
    expect(scan).not.toHaveBeenCalled();
    const indexAfter = await stat(store.paths.kindIndexPath, { bigint: true });
    expect(indexAfter.mtimeNs).toBe(indexBefore.mtimeNs);
    expect((await store.listRecords()).at(-1)?.sequence).toBe(count + 30);
    console.info(JSON.stringify({ measurement: "DATA_append", initialRecords: count, appends: 30, elapsedMs,
      appendSnapshotReads: 0, appendIndexRewrites: 0 }));
  });

  it("invalidates a warmed cache after foreign writes without losing records", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "data-cache-foreign-"));
    const first = await AppendOnlyStore.open({ rootDir });
    const second = await AppendOnlyStore.open({ rootDir });
    const scan = vi.spyOn(first, "readSnapshot");
    await first.appendRecord({ kind: "evidence_ref", payload: { kind: "log", label: "first" } });
    await second.appendRecord({ kind: "evidence_ref", payload: { kind: "log", label: "foreign" } });
    await first.appendRecord({ kind: "evidence_ref", payload: { kind: "log", label: "after foreign" } });
    expect(scan).toHaveBeenCalledTimes(1);
    expect((await first.listRecords()).map((record) => record.sequence)).toEqual([1, 2, 3]);
  });
});
