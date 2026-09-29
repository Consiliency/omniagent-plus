import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  redactUntrustedText,
  sanitizeMetadataPath,
  sanitizeMetadataText,
  assertMetadataSafe,
  runtimeEvidenceRefSchema,
  redactedTextSchema,
  projectMetadataExport,
  scanMetadataLeaks,
} from "./redaction.js";

function readFixture<T>(path: string): T {
  return JSON.parse(
    readFileSync(new URL(`../../../fixtures/handoff/redaction/${path}`, import.meta.url), "utf8"),
  ) as T;
}

describe("handoff redaction helpers", () => {
  it("ignores inert array method shadows and safely projects revoked proxies", () => {
    const array = Object.assign([1, null], { some: "ordinary-extra", forEach: "ordinary-extra" });
    expect(scanMetadataLeaks({ choices: array })).toEqual([]);
    expect(projectMetadataExport({ choices: array })).toEqual({ choices: [1, null] });
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();
    expect(() => assertMetadataSafe({ choices: proxy })).toThrow(/non json metadata/);
    expect(projectMetadataExport({ choices: proxy })).toEqual({ choices: "[redacted]" });
    expect(projectMetadataExport({ choices: [proxy] })).toEqual({ choices: ["[redacted]"] });
  });

  it("keeps retained metadata faithful to JSON numeric and undefined semantics", () => {
    for (const value of [NaN, Infinity, -Infinity, [undefined]]) {
      expect(() => assertMetadataSafe(value)).toThrow(/non json metadata/);
      expect(() => assertMetadataSafe(value, { inertOnly: true })).not.toThrow();
      expect(scanMetadataLeaks(projectMetadataExport(value))).toEqual([]);
    }
    const sparse = new Array(2);
    sparse[1] = 1;
    expect(() => assertMetadataSafe({ optional: undefined, finite: 1, sparse })).not.toThrow();
    expect(projectMetadataExport({ optional: undefined, values: [undefined, null, 1] })).toEqual({ values: [null, null, 1] });
    const rawJSON = (JSON as { rawJSON?: (text: string) => unknown }).rawJSON;
    if (rawJSON) {
      expect(() => assertMetadataSafe(rawJSON("1e9999"))).toThrow(/non json metadata/);
      expect(projectMetadataExport(rawJSON("123"))).toBe("[redacted]");
    }
    expect(() => assertMetadataSafe({ rawJSON: "123" })).not.toThrow();
  });

  it("accepts an empty array at the depth boundary", () => {
    let value: unknown = [];
    for (let depth = 0; depth < 64; depth += 1) value = { nested: value };
    expect(() => assertMetadataSafe(value)).not.toThrow();
    expect(() => assertMetadataSafe(value, { inertOnly: true })).not.toThrow();
    expect(() => assertMetadataSafe({ nested: value }, { inertOnly: true })).toThrow(/depth limit/);
  });
  it("rejects executable metadata and projects inert data without invoking hooks", () => {
    let invoked = 0;
    const hook = () => { invoked += 1; return { password: "synthetic-private-value" }; };
    const hiddenHook = Object.defineProperty({}, "toJSON", { value: hook });
    const accessor = Object.defineProperty({}, "text", { enumerable: true, get: hook });
    const arrayAccessor = Object.defineProperty([], "0", { enumerable: true, get: hook });
    const arrayHook = Object.assign([], { toJSON: hook });
    const customPrototype = Object.create({ toJSON: hook }) as unknown;
    const proxy = new Proxy({}, { get: hook, has: () => { invoked += 1; return false; } });
    const arrayMethods = Object.assign([], { map: hook, forEach: hook, some: hook });
    for (const value of [{ toJSON: hook }, hiddenHook, accessor, arrayAccessor, arrayHook, customPrototype, { nested: hook },
      proxy, { choices: [proxy] }, { choices: arrayMethods }, { env: accessor }, { password: accessor },
      { [Symbol("hidden")]: hook }, Object.defineProperty({}, Symbol("hidden"), { get: hook }),
      Object.defineProperty([], Symbol("hidden"), { get: hook })]) {
      expect(() => assertMetadataSafe(value)).toThrow(/non json metadata|sensitive field/);
      expect(scanMetadataLeaks(value).some((leak) => leak.reason === "non_json_metadata")).toBe(true);
      const projected = projectMetadataExport(value);
      expect(scanMetadataLeaks(projected)).toEqual([]);
      expect(JSON.stringify(projected)).not.toContain("synthetic-private-value");
    }
    expect(invoked).toBe(0);
    expect(() => assertMetadataSafe({ toJSON: "ordinary JSON key", nested: [null, true, 1] })).not.toThrow();
    expect(projectMetadataExport({ toJSON: "ordinary JSON key" })).toEqual({ toJSON: "ordinary JSON key" });
  });

  it("bounds original evidence strings including whitespace padding", () => {
    for (const value of [" ".repeat(3000) + "ok", "ok" + " ".repeat(3000)]) {
      expect(() => runtimeEvidenceRefSchema.parse({ kind: "log", label: "safe", excerpt: value })).toThrow(/exceeds/);
      expect(() => redactUntrustedText(value)).toThrow(/exceeds/);
    }
    expect(() => runtimeEvidenceRefSchema.parse({ kind: "log", label: " ".repeat(280) + "ok" })).toThrow(/exceeds/);
    expect(() => runtimeEvidenceRefSchema.parse({ kind: "log", label: " safe ", excerpt: " safe " })).not.toThrow();
  });

  it("rejects boxed primitives despite ordinary prototypes and hidden coercion", () => {
    let invoked = 0;
    for (const primitive of ["safe", 1]) {
      for (const prototype of [Object.prototype, null]) {
        for (const coercion of [Symbol.toPrimitive, Symbol.toStringTag]) {
          const value = Object(primitive) as object;
          Object.setPrototypeOf(value, prototype);
          Object.defineProperty(value, coercion, { value: coercion === Symbol.toPrimitive
            ? () => { invoked += 1; return "synthetic-private-value"; } : "synthetic-private-value" });
          expect(() => assertMetadataSafe(value)).toThrow(/non json metadata/);
          expect(projectMetadataExport(value)).toBe("[redacted]");
        }
      }
    }
    expect(invoked).toBe(0);
  });

  it("copies array entries without invoking constructors or species hooks", () => {
    let invoked = 0;
    const value: unknown[] = new Array(3);
    value[0] = "safe";
    value[2] = "/tmp/project";
    Object.defineProperty(value, "constructor", { value: {
      get [Symbol.species]() {
        invoked += 1;
        return function () {
          invoked += 1;
          return Object.defineProperty([], "toJSON", { value: () => { invoked += 1; return { password: "synthetic-private-value" }; } });
        };
      },
    } });
    expect(() => assertMetadataSafe(value)).not.toThrow();
    const projected = projectMetadataExport(value) as unknown[];
    expect(Object.getPrototypeOf(projected)).toBe(Array.prototype);
    expect(Object.hasOwn(projected, "constructor")).toBe(false);
    expect(Object.hasOwn(projected, 1)).toBe(false);
    expect(projected[0]).toBe("safe");
    expect(projected[2]).toMatch(/^path:sha256:/);
    expect(scanMetadataLeaks(projected)).toEqual([]);
    expect(JSON.stringify(projected)).not.toContain("synthetic-private-value");
    expect(invoked).toBe(0);
  });

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
      expect(scanMetadataLeaks(projectMetadataExport(value))).toEqual([]);
      expect(() => runtimeEvidenceRefSchema.parse({ kind: "log", label: "safe", excerpt: text })).toThrow();
      expect(() => redactedTextSchema.parse({ schema: "redacted_text.v0.1", redaction: "content_redacted",
        reason: "corpus", content: text, byteLength: Buffer.byteLength(text), truncated: false })).toThrow();
    }
    for (const path of corpus.rejectedExportPaths) expect(() => runtimeEvidenceRefSchema.parse({ kind: "file", label: "safe", path })).toThrow();
    for (const path of corpus.allowedEvidencePaths) expect(() => runtimeEvidenceRefSchema.parse({ kind: "file", label: "safe", path })).not.toThrow();
    expect(projectMetadataExport({ path: "state/.recovery/marker.tail" })).toEqual({ path: "[redacted]" });
    expect(projectMetadataExport({ path: "/tmp/state/.recovery/marker.tail" })).toEqual({ path: "[redacted]" });
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
