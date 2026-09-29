import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  stateLedgerRecordArraySchema,
  stateLedgerRecordKinds,
  stateLedgerRecordSchema,
  createStateLedgerRecord,
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
  it("preserves concrete effects and array APIs", () => {
    expect(stateLedgerRecordSchema).toBeInstanceOf(z.ZodEffects);
    expect(stateLedgerRecordSchema.innerType()).toBeInstanceOf(z.ZodDiscriminatedUnion);
    expect(stateLedgerRecordSchema.sourceType()).toBeInstanceOf(z.ZodDiscriminatedUnion);
    expect(stateLedgerRecordArraySchema).toBeInstanceOf(z.ZodArray);
    expect(stateLedgerRecordArraySchema.element).toBe(stateLedgerRecordSchema);
    const record = readFixture("ledger-records.json")[0]!;
    expect(stateLedgerRecordArraySchema.min(1).max(1).length(1).nonempty().parse([record])).toHaveLength(1);
    expect(stateLedgerRecordArraySchema.min(1).safeParse([]).success).toBe(false);
    expect(stateLedgerRecordArraySchema.max(0).safeParse([record]).success).toBe(false);
  });

  it("guards the record factory before spreading caller fields", () => {
    let invoked = 0;
    const record = readFixture("ledger-records.json")[0]!;
    const input = Object.defineProperty({ ...record }, "kind", { get() { invoked += 1; return record.kind; } });
    expect(() => createStateLedgerRecord(input)).toThrow(/non json metadata/);
    expect(invoked).toBe(0);
  });

  it("rejects retained nonfinite numbers while stripping ordinary unknown extensions", () => {
    const record = readFixture("ledger-records.json").find((item) => item.kind === "session")!;
    expect(() => stateLedgerRecordSchema.parse({ ...record, discarded: { number: Infinity, array: [undefined] } })).not.toThrow();
    for (const nested of [NaN, Infinity, -Infinity, [undefined]]) {
      expect(() => stateLedgerRecordSchema.parse({ ...record, payload: { ...record.payload, metadata: { nested } } })).toThrow(/non json metadata/);
    }
  });
  it("rejects executable input before reading known schema fields", async () => {
    const record = readFixture("ledger-records.json").find((item) => item.kind === "runtime_event")!;
    let invoked = 0;
    const getter = () => { invoked += 1; return "ordinary"; };
    const values = [Object.defineProperty({ ...record }, "kind", { get: getter }),
      { ...record, payload: Object.defineProperty({ ...record.payload }, "type", { get: getter }) },
      new Proxy(record, { get: getter }), Object.defineProperty({ ...record }, "then", { get: getter }),
      Object.defineProperty({ ...record }, "payload", { value: Object.defineProperty({ ...record.payload }, "type", { get: getter }) }),
      { ...record, payload: { ...record.payload, payload: Object.defineProperty({}, "outputSummary", { get: getter }) } }];
    for (const value of values) {
      expect(() => stateLedgerRecordSchema.parse(value)).toThrow(/non json metadata/);
      expect(stateLedgerRecordSchema.safeParse(value).success).toBe(false);
      expect((await stateLedgerRecordSchema.safeParseAsync(value)).success).toBe(false);
      await expect(stateLedgerRecordSchema.parseAsync(value)).rejects.toThrow(/non json metadata/);
      expect((await stateLedgerRecordSchema.spa(value)).success).toBe(false);
      expect(await stateLedgerRecordSchema["~standard"].validate(value)).toHaveProperty("issues");
      expect(() => stateLedgerRecordArraySchema.parse([value])).toThrow(/non json metadata/);
      expect(() => stateLedgerRecordSchema.array().parse([value])).toThrow(/non json metadata/);
    }
    const array = new Proxy([record], { get: getter });
    expect(() => stateLedgerRecordArraySchema.parse(array)).toThrow(/non json metadata/);
    expect((await stateLedgerRecordArraySchema.safeParseAsync(array)).success).toBe(false);
    expect(invoked).toBe(0);
  });
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
