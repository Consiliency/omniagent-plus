import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { createHttpProvider } from "./index.js";

interface LiveSmokeFixture {
  readonly metadataOnlyKeys: string[];
  readonly requiredDocPhrases: string[];
  readonly requiredEnv: string[];
}

function readFixture(): LiveSmokeFixture {
  return JSON.parse(
    readFileSync(
      new URL("../../../fixtures/hardening/live-omnigent/live-smoke-contract.json", import.meta.url),
      "utf8",
    ),
  ) as LiveSmokeFixture;
}

describe("live Omnigent smoke", () => {
  it("documents the opt-in env gate and metadata_only evidence contract", () => {
    const fixture = readFixture();
    const doc = readFileSync(
      new URL("../../../docs/omnigent-live-smoke.md", import.meta.url),
      "utf8",
    );
    const envExample = readFileSync(
      new URL("../../../.env.example", import.meta.url),
      "utf8",
    );

    for (const envVar of fixture.requiredEnv) {
      expect(doc).toContain(envVar);
      expect(envExample).toContain(envVar);
    }

    for (const phrase of fixture.requiredDocPhrases) {
      expect(doc).toContain(phrase);
    }
  });

  const liveBaseUrl = process.env.OMNIAGENT_PLUS_LIVE_OMNIGENT_BASE_URL?.trim();
  const bearerToken =
    process.env.OMNIAGENT_PLUS_LIVE_OMNIGENT_BEARER_TOKEN?.trim();
  const liveGateEnabled =
    process.env.OMNIAGENT_PLUS_LIVE_OMNIGENT === "1"
    && typeof liveBaseUrl === "string"
    && liveBaseUrl.length > 0;
  const liveIt = liveGateEnabled ? it : it.skip;

  liveIt("collects metadata_only live evidence only when explicitly enabled", async () => {
    const fixture = readFixture();
    const provider = createHttpProvider({
      baseUrl: liveBaseUrl!,
      headers:
        bearerToken === undefined || bearerToken.length === 0
          ? undefined
          : {
              authorization: `Bearer ${bearerToken}`,
            },
    });
    let sessionId: string | undefined;

    try {
      const session = await provider.createSession({
        idempotencyKey: "hardening-live-smoke",
        runtime: "omnigent",
        targetHarness: "codex",
        title: "Live smoke",
      });
      sessionId = session.id;
      const info = await provider.getSessionInfo(session.id);
      const health = await provider.health();
      const evidence = {
        backend: health.backend,
        liveEnvVar: "OMNIAGENT_PLUS_LIVE_OMNIGENT",
        notesCount: health.notes?.length ?? 0,
        sessionId: session.id,
        state: info.state,
      };

      expect(Object.keys(evidence).sort()).toEqual(
        fixture.metadataOnlyKeys.slice().sort(),
      );
      expect(JSON.stringify(evidence)).not.toContain("authorization");
      if (bearerToken !== undefined && bearerToken.length > 0) {
        expect(JSON.stringify(evidence)).not.toContain(bearerToken);
      }
    } finally {
      if (sessionId !== undefined) {
        await provider.closeSession(sessionId);
      }
    }
  });
});
