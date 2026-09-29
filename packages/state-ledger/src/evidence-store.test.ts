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
  it("includes whitespace padding in default and custom evidence bounds", async () => {
    const ledger = await AuditLedger.open({ rootDir: await mkdtemp(join(tmpdir(), "data-evidence-padding-")) });
    const input = { kind: "log" as const, label: "safe", sourceType: "redacted_excerpt" as const, sourceCategory: "other" as const, excerpt: "ok" };
    await expect(new EvidenceStore(ledger).save({ ...input, excerpt: " ".repeat(3000) + "ok" })).rejects.toThrow(/exceeds/);
    await expect(new EvidenceStore(ledger).save({ ...input, label: " ".repeat(280) + "ok" })).rejects.toThrow(/exceeds/);
    await expect(new EvidenceStore(ledger, 4).save({ ...input, excerpt: "     ok" })).rejects.toThrow(/exceeds/);
    await new EvidenceStore(ledger, 4).save(input);
    expect(await ledger.listRecords()).toHaveLength(1);
  });

  it("checks the shared corpus before durable evidence append", async () => {
    const corpus = JSON.parse(readFileSync(new URL("../../../fixtures/content-policy/corpus.json", import.meta.url), "utf8")) as { allowed: unknown[]; rejected: unknown[]; rejectedExportPaths: string[] };
    const ledger = await AuditLedger.open({ rootDir: await mkdtemp(join(tmpdir(), "data-evidence-corpus-")) });
    const store = new EvidenceStore(ledger);
    for (const value of corpus.allowed) await store.save({ kind: "log", label: "safe", sourceType: "redacted_excerpt", sourceCategory: "other",
      excerpt: typeof value === "string" ? value : JSON.stringify(value) });
    for (const value of corpus.rejected) await expect(store.save({ kind: "log", label: "safe", sourceType: "redacted_excerpt", sourceCategory: "other",
      excerpt: typeof value === "string" ? value : JSON.stringify(value) })).rejects.toThrow();
    for (const path of corpus.rejectedExportPaths) await expect(store.save({ kind: "file", label: "safe", sourceType: "artifact_ref", sourceCategory: "other", path })).rejects.toThrow();
    expect(await ledger.listRecords()).toHaveLength(corpus.allowed.length);
  });
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
