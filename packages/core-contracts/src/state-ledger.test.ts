import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  stateLedgerRecordArraySchema,
  stateLedgerRecordKinds,
  stateLedgerRecordSchema,
  type StateLedgerEntry,
  type StateLedgerRecordKind,
} from "./index.js";

function readFixture(name: string): StateLedgerEntry[] {
  return JSON.parse(
    readFileSync(
      new URL(`../../../fixtures/state-ledger/contracts/${name}`, import.meta.url),
      "utf8",
    ),
  ) as StateLedgerEntry[];
}

describe("state ledger contracts", () => {
  it("checks retained nested session metadata while preserving operational roots and unknown-field stripping", () => {
    const record = readFixture("ledger-records.json").find((item) => item.kind === "session")!;
    const corpus = JSON.parse(readFileSync(new URL("../../../fixtures/content-policy/corpus.json", import.meta.url), "utf8")) as { allowed: unknown[]; rejected: unknown[] };
    for (const value of corpus.allowed) expect(() => stateLedgerRecordSchema.parse({ ...record,
      discarded: { password: "discarded extension" }, payload: { ...record.payload, repoRoot: "/home/synthetic/repo", metadata: { nested: value } } })).not.toThrow();
    for (const value of corpus.rejected) expect(() => stateLedgerRecordSchema.parse({ ...record,
      payload: { ...record.payload, metadata: { nested: value } } })).toThrow();
  });
  it("parses the durable state fixtures and covers every required record kind", () => {
    const records = stateLedgerRecordArraySchema.parse(
      readFixture("ledger-records.json"),
    );

    const seenKinds = new Set(records.map((record) => record.kind));
    expect(seenKinds).toEqual(new Set(stateLedgerRecordKinds));
  });

  it("keeps the public record-kind surface assignable", () => {
    const records = readFixture("ledger-records.json");
    const kinds: StateLedgerRecordKind[] = records.map((record) => record.kind);

    expect(kinds).toContain("session");
    expect(kinds).toContain("approval_response");
    expect(kinds).toContain("capability_snapshot");
  });

  it("rejects ordinary runtime content at direct ledger construction", () => {
    const record = readFixture("ledger-records.json").find((item) => item.kind === "runtime_event")!;
    const event = { ...record.payload, type: "runtime.text.delta", terminal: false,
      redaction: "metadata_only", payload: { delta: "Ordinary private conversation content" } };
    expect(() => stateLedgerRecordSchema.parse({ ...record, payload: event })).toThrow(/content must be omitted/);
    expect(() => stateLedgerRecordSchema.parse({ ...record, payload: { ...event, payload: { delta: "[runtime content omitted]" } } })).not.toThrow();
  });
});
