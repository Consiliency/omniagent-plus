import { readFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { AuditLedger } from "@omniagent-plus/state-ledger";

import { COMMAND_REGISTRY } from "./command-registry.js";
import { executeCli } from "./runtime.js";

function readFixture<T>(): T {
  return JSON.parse(
    readFileSync(
      new URL("../../../fixtures/cli/classify-limit/classification.json", import.meta.url),
      "utf8",
    ),
  ) as T;
}

describe("classify-limit", () => {
  it("persists explicit record-mode classifications without leaking raw secret-like excerpts", async () => {
    const fixture = readFixture<{
      recordMode: string;
      provider: string;
      harness: string;
    }>();
    const stateRoot = await mkdtemp(join(tmpdir(), "cli-classify-limit-"));

    const result = await executeCli(
      [
        "classify-limit",
        "--provider",
        fixture.provider,
        "--harness",
        fixture.harness,
        "--status-code",
        "429",
        "--stderr-text",
        "authorization=sk-secret-12345678 quota exceeded until reset",
        "--task-id",
        "task-limit-1",
        "--record",
        "--state-root",
        stateRoot,
        "--json",
      ],
      COMMAND_REGISTRY,
    );
    const parsed = JSON.parse(result.stdout) as {
      readonly result: {
        readonly recordMode: string;
        readonly classification: {
          readonly provider: string;
          readonly harness: string;
          readonly rawSignal: {
            readonly stderrExcerpt?: string;
          };
          readonly notes?: string[];
        };
        readonly persistedRecord?: {
          readonly recordId: string;
        };
      };
    };
    const ledger = await AuditLedger.open({
      rootDir: stateRoot,
    });
    const taskRecords = await ledger.listTaskRecords("task-limit-1");

    expect(result.exitCode).toBe(0);
    expect(parsed.result.recordMode).toBe(fixture.recordMode);
    expect(parsed.result.classification.provider).toBe(fixture.provider);
    expect(parsed.result.classification.harness).toBe(fixture.harness);
    expect(parsed.result.classification.rawSignal.stderrExcerpt).toBe("[redacted]");
    expect(result.stdout).not.toContain("sk-secret-12345678");
    expect(parsed.result.persistedRecord?.recordId.length).toBeGreaterThan(0);
    expect(taskRecords.filter((record) => record.kind === "limit_classification")).toHaveLength(1);
    expect(JSON.stringify(taskRecords)).not.toContain("sk-secret-12345678");
  });
});
