import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  stateLedgerRecordArraySchema,
  stateLedgerRecordKinds,
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
});
