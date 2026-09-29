import { describe, expect, it } from "vitest";

import {
  createErrorEnvelope,
  createSuccessEnvelope,
  renderEnvelopeText,
  serializeEnvelope,
} from "./output.js";

describe("output envelopes", () => {
  it("projects home paths and credential diagnostics in constructors and direct JSON/text exports", () => {
    const raw = {
      schema: "omniagent_cli_envelope.v0.1" as const, ok: false as const, command: "sessions show",
      stateRoot: "/home/synthetic/state",
      error: { schema: "omniagent_cli_error.v0.1" as const, category: "missing_record" as const, code: 3,
        message: "Cannot read /home/synthetic/state/ledger.jsonl", details: { nested: ["Bearer synthetic-token-123456"] } },
    };
    const constructed = createErrorEnvelope(raw.command, raw.stateRoot, raw.error);
    for (const output of [serializeEnvelope(raw, true), renderEnvelopeText(raw), serializeEnvelope(constructed, true)]) {
      expect(output).not.toContain("/home/synthetic");
      expect(output).not.toContain("synthetic-token-123456");
      expect(output).toContain("path:sha256:");
    }
    expect(raw.stateRoot).toBe("/home/synthetic/state");
  });
  it("renders the JSON/human envelope from the same redacted result", () => {
    const envelope = createSuccessEnvelope("health", "/tmp/state", {
      schema: "cli.health.result.v0.1",
      interfaceFreezeGate: "IF-0-CLI-11",
      redactionPosture: "metadata_only",
      releaseSurfaceDecision: "no_doc_delta",
      defaultProfilesDir: "/tmp/profiles",
      defaultStateRoot: "/tmp/state",
      stateStorePresent: false,
      stateLedgerPaths: {
        rootDir: "/tmp/state",
        ledgerPath: "/tmp/state/ledger.jsonl",
        manifestPath: "/tmp/state/manifest.json",
        coordinationDir: "/tmp/state/coordination",
      },
      commands: ["health"],
    });

    const human = renderEnvelopeText(envelope);

    expect(human).toContain("Command: health");
    expect(human).toContain("redactionPosture: metadata_only");
    expect(human).toContain("commands:");
  });

  it("serializes typed error categories with deterministic human output", () => {
    const envelope = createErrorEnvelope("sessions show", "/tmp/state", {
      schema: "omniagent_cli_error.v0.1",
      category: "missing_record",
      code: 3,
      message: "session-id is required.",
    });

    const human = renderEnvelopeText(envelope);

    expect(human).toContain("Status: error");
    expect(human).toContain("category: missing_record");
    expect(human).toContain("code: 3");
  });
});
