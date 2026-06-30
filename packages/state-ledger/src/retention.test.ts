import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { AuditLedger } from "./audit-ledger.js";
import { getStateLedgerPaths } from "./schema.js";
import { applyRetentionPolicy } from "./retention.js";

async function createLedger() {
  const rootDir = await mkdtemp(join(tmpdir(), "state-ledger-retain-"));
  return {
    rootDir,
    ledger: await AuditLedger.open({ rootDir }),
  };
}

describe("retention", () => {
  it("prunes expired records and refreshes indexes", async () => {
    const { rootDir, ledger } = await createLedger();
    await ledger.appendSession({
      id: "session-1",
      runtime: "omnigent",
      targetHarness: "codex",
      title: "Retention test",
      state: "idle",
      createdAt: "2026-06-30T00:00:00.000Z",
      updatedAt: "2026-06-30T00:00:00.000Z",
    });
    await ledger.store.appendRecord({
      kind: "provider_cooldown",
      payload: {
        schema: "provider_family_cooldown.v0.1",
        provider: "openai",
        scope: "provider_family",
        active: true,
        reason: "old cap",
        observedAt: "2026-06-30T00:00:00.000Z",
        source: "manual",
      },
      recordedAt: "2026-06-30T00:00:00.000Z",
    });
    await ledger.store.appendRecord({
      kind: "provider_cooldown",
      payload: {
        schema: "provider_family_cooldown.v0.1",
        provider: "openai",
        scope: "provider_family",
        active: true,
        reason: "new cap",
        observedAt: "2026-06-30T00:05:00.000Z",
        source: "manual",
      },
      recordedAt: "2026-06-30T00:05:00.000Z",
    });

    const result = await applyRetentionPolicy(
      ledger,
      {
        pruneKinds: ["provider_cooldown"],
        maxAgeMs: 60_000,
        keepLatestPerKind: 1,
      },
      new Date("2026-06-30T00:06:00.000Z"),
    );

    const kindIndex = JSON.parse(
      await readFile(getStateLedgerPaths(rootDir).kindIndexPath, "utf8"),
    ) as { byKind: Record<string, number[]> };

    expect(result.prunedRecords).toHaveLength(1);
    expect(result.keptRecords.map((record) => record.kind)).toContain("session");
    expect(kindIndex.byKind.provider_cooldown).toHaveLength(1);
  });
});
