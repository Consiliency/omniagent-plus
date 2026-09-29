import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  assertNoSecretLeaks,
  redactSecretLikeRecord,
  scanForSecretLeaks,
} from "./secret-redaction.js";

interface LeakFixture {
  readonly cases: Array<{
    readonly name: string;
    readonly payload: unknown;
  }>;
}

function readFixture(name: string): LeakFixture {
  return JSON.parse(
    readFileSync(
      new URL(`../../../fixtures/identity/leak-cases/${name}`, import.meta.url),
      "utf8",
    ),
  ) as LeakFixture;
}

describe("secret redaction", () => {
  it("consumes the shared corpus and returns no secret samples or unsafe field names", () => {
    const corpus = JSON.parse(readFileSync(new URL("../../../fixtures/content-policy/corpus.json", import.meta.url), "utf8")) as { allowed: unknown[]; rejected: unknown[] };
    for (const value of corpus.allowed) expect(scanForSecretLeaks(value).ok).toBe(true);
    for (const value of corpus.rejected) {
      const result = scanForSecretLeaks(value);
      expect(result.ok).toBe(false);
      expect(result.leaks.every((leak) => leak.sample === "[redacted]")).toBe(true);
      expect(JSON.stringify(result)).not.toContain("synthetic-private-value");
    }
    const diagnostic = scanForSecretLeaks({ "Bearer synthetic-token-123456": "value" });
    expect(JSON.stringify(diagnostic)).not.toContain("synthetic-token-123456");
  });
  it("rejects raw bearer tokens, API keys, env dumps, and secret-bearing payloads", () => {
    const fixture = readFixture("raw-secrets.json");

    for (const testCase of fixture.cases) {
      const result = scanForSecretLeaks(testCase.payload);
      expect(result.ok, testCase.name).toBe(false);
      expect(() => assertNoSecretLeaks(testCase.payload), testCase.name).toThrow(
        /Rejected raw secret material/,
      );
    }
  });

  it("accepts metadata-only fixtures and reduces string records to RedactedConfigValue", () => {
    const fixture = readFixture("metadata-safe.json");

    for (const testCase of fixture.cases) {
      expect(scanForSecretLeaks(testCase.payload).ok, testCase.name).toBe(true);
    }

    expect(
      redactSecretLikeRecord({
        OPENAI_API_KEY: "sk-live-should-redact",
      }).OPENAI_API_KEY,
    ).toEqual({
      schema: "redacted_config_value.v0.1",
      value: "[redacted]",
      reason: "secret_ref",
    });
  });
});
