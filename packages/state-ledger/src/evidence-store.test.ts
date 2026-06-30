import { readFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { AuditLedger } from "./audit-ledger.js";
import { EvidenceStore, type EvidenceInput } from "./evidence-store.js";

interface EvidenceFixture {
  readonly allowed: EvidenceInput[];
  readonly rejected: EvidenceInput[];
}

function readFixture(): EvidenceFixture {
  return JSON.parse(
    readFileSync(
      new URL("../../../fixtures/state-ledger/evidence/evidence-cases.json", import.meta.url),
      "utf8",
    ),
  ) as EvidenceFixture;
}

describe("evidence store", () => {
  it("persists bounded redacted evidence and rejects raw/secret-bearing inputs", async () => {
    const fixture = readFixture();
    const ledger = await AuditLedger.open({
      rootDir: await mkdtemp(join(tmpdir(), "state-ledger-evidence-")),
    });
    const evidenceStore = new EvidenceStore(ledger);

    for (const allowed of fixture.allowed) {
      await evidenceStore.save(allowed);
    }

    for (const rejected of fixture.rejected) {
      await expect(evidenceStore.save(rejected)).rejects.toThrow();
    }

    const evidenceRecords = await ledger.listRecordsByKind("evidence_ref");
    expect(evidenceRecords).toHaveLength(fixture.allowed.length);
    expect(evidenceRecords[0]?.payload.label).toBe("verification summary");
  });
});
