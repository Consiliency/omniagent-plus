import { readFileSync } from "node:fs";
import { mkdtemp, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { AuditLedger } from "./audit-ledger.js";
import { AppendOnlyStore } from "./append-only-store.js";
import { migrateStoreManifest, readStoreManifest } from "./migrations.js";
import { getStateLedgerPaths } from "./schema.js";

async function createTempRoot(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

function readFixture(name: string): unknown {
  return JSON.parse(
    readFileSync(
      new URL(`../../../fixtures/state-ledger/migrations/${name}`, import.meta.url),
      "utf8",
    ),
  );
}

describe("migrations", () => {
  it("upgrades a legacy manifest to the current schema version", async () => {
    const rootDir = await createTempRoot("state-ledger-migrate-");
    const paths = getStateLedgerPaths(rootDir);
    await writeFile(
      paths.manifestPath,
      JSON.stringify(readFixture("manifest-v0.json")),
      "utf8",
    );

    const result = await migrateStoreManifest(rootDir);
    const manifest = await readStoreManifest(rootDir);

    expect(result.migrated).toBe(true);
    expect(result.steps).toEqual(["manifest_v0_to_v1"]);
    expect(manifest).toMatchObject(readFixture("manifest-v1.json") as object);
  });

  it("rejects oversized payloads before persistence", async () => {
    const store = await AppendOnlyStore.open({
      rootDir: await createTempRoot("state-ledger-size-"),
      maxPayloadBytes: 128,
    });

    await expect(
      store.appendRecord({
        kind: "evidence_ref",
        payload: {
          kind: "log",
          label: "oversized",
          excerpt: "x".repeat(512),
        },
      }),
    ).rejects.toThrow("State ledger payload exceeds 128 bytes");
  });

  it("repairs an interrupted trailing write during startup", async () => {
    const rootDir = await createTempRoot("state-ledger-recover-");
    const ledger = await AuditLedger.open({ rootDir });
    await ledger.appendSession({
      id: "session-1",
      runtime: "omnigent",
      targetHarness: "codex",
      title: "Recovery test",
      state: "idle",
      createdAt: "2026-06-30T00:00:00.000Z",
      updatedAt: "2026-06-30T00:00:00.000Z",
    });

    const paths = getStateLedgerPaths(rootDir);
    await writeFile(
      paths.ledgerPath,
      "{\"schema\":\"state_ledger_record.v0.1\"",
      { encoding: "utf8", flag: "a" },
    );

    const reopened = await AppendOnlyStore.open({ rootDir });
    const records = await reopened.listRecords();
    const manifest = await reopened.getManifest();

    expect(records).toHaveLength(1);
    expect(manifest.recoveredTailTruncations).toBe(1);
    const recoveryDir = join(rootDir, ".recovery");
    const evidence = await readdir(recoveryDir);
    expect(evidence).toHaveLength(1);
    expect(await readFile(join(recoveryDir, evidence[0]!), "utf8"))
      .toBe('{"schema":"state_ledger_record.v0.1"');
    expect((await stat(recoveryDir)).mode & 0o777).toBe(0o700);
    expect((await stat(join(recoveryDir, evidence[0]!))).mode & 0o777).toBe(0o600);
  });

  it("preserves complete schema-invalid records rather than repairing them", async () => {
    const rootDir = await createTempRoot("state-ledger-corrupt-");
    await AppendOnlyStore.open({ rootDir });
    const path = getStateLedgerPaths(rootDir).ledgerPath;
    for (const suffix of ["\n", ""]) {
      const raw = `{"schema":"state_ledger_record.v0.1","payload":"invalid"}${suffix}`;
      await writeFile(path, raw);
      await expect(AppendOnlyStore.open({ rootDir })).rejects.toThrow(/corruption/i);
      expect(await readFile(path, "utf8")).toBe(raw);
    }
  });

  it("recovers sequence allocation from records when the manifest lags", async () => {
    const rootDir = await createTempRoot("state-ledger-high-water-");
    const store = await AppendOnlyStore.open({ rootDir });
    const empty = await store.getManifest();
    for (let index = 0; index < 2; index += 1) {
      await store.appendRecord({ kind: "evidence_ref", payload: { kind: "log", label: "safe" } });
    }
    await writeFile(store.paths.manifestPath, JSON.stringify(empty));
    const reopened = await AppendOnlyStore.open({ rootDir });
    const next = await reopened.appendRecord({ kind: "evidence_ref", payload: { kind: "log", label: "safe" } });
    expect(next.sequence).toBe(3);
    await reopened.compactRecords(() => false);
    const afterCompaction = await AppendOnlyStore.open({ rootDir });
    expect((await afterCompaction.appendRecord({ kind: "evidence_ref", payload: { kind: "log", label: "safe" } })).sequence).toBe(4);
  });

  it("fails on newer manifests without replacing them", async () => {
    const rootDir = await createTempRoot("state-ledger-future-");
    const store = await AppendOnlyStore.open({ rootDir });
    const manifest = await store.getManifest();
    for (const schema of ["state_ledger_store_manifest.v0.1", "state_ledger_store_manifest.v0.2"]) {
      const raw = JSON.stringify({ ...manifest, schema, schemaVersion: 2 });
      await writeFile(store.paths.manifestPath, raw);
      await expect(AppendOnlyStore.open({ rootDir })).rejects.toMatchObject({ code: "unsupported_schema" });
      await expect(migrateStoreManifest(rootDir)).rejects.toMatchObject({ code: "unsupported_schema" });
      expect(await readFile(store.paths.manifestPath, "utf8")).toBe(raw);
    }
  });
});
