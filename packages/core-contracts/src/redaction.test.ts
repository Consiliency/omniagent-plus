import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  redactUntrustedText,
  sanitizeMetadataPath,
  sanitizeMetadataText,
  assertMetadataSafe,
  runtimeEvidenceRefSchema,
  redactedTextSchema,
} from "./redaction.js";

function readFixture<T>(path: string): T {
  return JSON.parse(
    readFileSync(new URL(`../../../fixtures/handoff/redaction/${path}`, import.meta.url), "utf8"),
  ) as T;
}

describe("handoff redaction helpers", () => {
  it("uses one corpus for scanner, evidence schema and direct redacted text construction", () => {
    const corpus = JSON.parse(readFileSync(new URL("../../../fixtures/content-policy/corpus.json", import.meta.url), "utf8")) as {
      allowed: unknown[]; rejected: unknown[]; rejectedExportPaths: string[]; allowedEvidencePaths: string[];
    };
    for (const value of corpus.allowed) {
      const text = typeof value === "string" ? value : JSON.stringify(value);
      expect(() => assertMetadataSafe(value)).not.toThrow();
      expect(() => sanitizeMetadataText(text, "corpus")).not.toThrow();
      expect(() => runtimeEvidenceRefSchema.parse({ kind: "log", label: "safe", excerpt: text })).not.toThrow();
      expect(() => redactedTextSchema.parse(redactUntrustedText(text))).not.toThrow();
    }
    for (const value of corpus.rejected) {
      const text = typeof value === "string" ? value : JSON.stringify(value);
      expect(() => assertMetadataSafe(value)).toThrow();
      expect(() => runtimeEvidenceRefSchema.parse({ kind: "log", label: "safe", excerpt: text })).toThrow();
      expect(() => redactedTextSchema.parse({ schema: "redacted_text.v0.1", redaction: "content_redacted",
        reason: "corpus", content: text, byteLength: Buffer.byteLength(text), truncated: false })).toThrow();
    }
    for (const path of corpus.rejectedExportPaths) expect(() => runtimeEvidenceRefSchema.parse({ kind: "file", label: "safe", path })).toThrow();
    for (const path of corpus.allowedEvidencePaths) expect(() => runtimeEvidenceRefSchema.parse({ kind: "file", label: "safe", path })).not.toThrow();
    const redacted = redactUntrustedText("multibyte é");
    expect(() => redactedTextSchema.parse({ ...redacted, byteLength: redacted.byteLength + 1 })).toThrow(/byte length/);
    expect(() => redactedTextSchema.parse({ ...redacted, truncated: true })).toThrow();
    expect(() => redactUntrustedText("é".repeat(1025))).toThrow(/exceeds/);
  });
  it("accepts bounded untrusted excerpts and metadata-only summaries", () => {
    const fixture = readFixture<{ excerpt: string; summary: string; path: string }>(
      "safe-untrusted.json",
    );

    const redacted = redactUntrustedText(fixture.excerpt, {
      label: "fixture.excerpt",
      reason: "test_excerpt",
    });

    expect(redacted.content).toContain("Quoted evidence only");
    expect(sanitizeMetadataText(fixture.summary, "fixture.summary")).toBe(
      fixture.summary,
    );
    expect(sanitizeMetadataPath(fixture.path)).toBe(fixture.path);
  });

  it("rejects secret-bearing excerpts, env dumps, provider payloads, and absolute secret paths", () => {
    const secretFixture = readFixture<{ excerpt: string }>("secret-bearing.json");
    const envFixture = readFixture<{ excerpt: string }>("env-dump.json");
    const providerFixture = readFixture<{ excerpt: string }>("provider-payload.json");
    const pathFixture = readFixture<{ path: string }>("absolute-secret-path.json");

    expect(() =>
      redactUntrustedText(secretFixture.excerpt, { label: "secretFixture.excerpt" }),
    ).toThrow(/contains/);
    expect(() =>
      redactUntrustedText(envFixture.excerpt, { label: "envFixture.excerpt" }),
    ).toThrow(/environment dump/);
    expect(() =>
      sanitizeMetadataText(
        "OMNIGENT_ANTHROPIC_API_KEY=[redacted]",
        "omnigentEnv",
      ),
    ).toThrow(/environment dump|secret_env_assignment/);
    expect(() =>
      redactUntrustedText(providerFixture.excerpt, {
        label: "providerFixture.excerpt",
      }),
    ).toThrow(/provider payload/);
    expect(() => sanitizeMetadataPath(pathFixture.path)).toThrow(/absolute paths/);
  });
});
