import { readFileSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
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
  });
});
