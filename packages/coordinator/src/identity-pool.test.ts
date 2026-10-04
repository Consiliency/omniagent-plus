import { describe, expect, it } from "vitest";
import { classifyLimitSignal } from "@omniagent-plus/rate-limit-catalog";

import { buildActiveTurnSnapshot, buildIdentityPool } from "./index.js";

describe("identity pool", () => {
  it("uses real model rate evidence conservatively while excluding another route's evidence", () => {
    const profile = { id: "profile", provider: "openai" as const, harness: "codex" as const, authMode: "local_subscription" as const, isolation: "host_env" as const, maxOpenSessions: 2, maxActiveTurns: 3 };
    const classification = classifyLimitSignal({ provider: "openai", harness: "codex", statusCode: 429, bodyText: "tokens per minute limit" });
    expect(classification).toMatchObject({ type: "token_rate_limit", scope: "model" });
    const pool = (evidence: typeof classification) => buildIdentityPool({ profiles: [profile], classificationByProfileId: { profile: evidence } }).candidates[0]!;
    expect(pool(classification).targetActiveTurns).toBe(2);
    for (const patch of [{ provider: "google" }, { harness: "claude-code" }, { identityProfileId: "other" }, { sessionId: "other" }]) {
      expect(pool({ ...classification, ...patch }).targetActiveTurns).toBe(3);
    }
  });
  it("ignores inherited snapshot counts for a legal prototype-named profile", () => {
    const pool = buildIdentityPool({ profiles: [{ id: "constructor", provider: "openai", harness: "codex", authMode: "local_subscription", isolation: "host_env", maxOpenSessions: 2, maxActiveTurns: 3 }],
      activeTurns: { totalActiveTurns: 0, byProfileId: {}, byProvider: {}, bySessionId: {} } });
    expect(pool.candidates[0]?.activeTurns).toBe(0);
    expect(pool.candidates[0]?.availableTurnSlots).toBe(3);
  });
  it("orders available candidates ahead of blocked profiles and carries capacity evidence", () => {
    const pool = buildIdentityPool({
      profiles: [
        {
          id: "profile-openai-primary",
          provider: "openai",
          harness: "codex",
          authMode: "local_subscription",
          isolation: "isolated_home",
          maxOpenSessions: 2,
          maxActiveTurns: 3,
        },
        {
          id: "profile-google-primary",
          provider: "google",
          harness: "codex",
          authMode: "local_subscription",
          isolation: "isolated_home",
          maxOpenSessions: 2,
          maxActiveTurns: 3,
        },
      ],
      statuses: [
        {
          schema: "identity_profile_status.v0.1",
          profileId: "profile-openai-primary",
          provider: "openai",
          harness: "codex",
          status: "cooldown",
          checkedAt: "2026-06-30T10:00:00.000Z",
          activeSessions: 0,
          activeTurns: 0,
          reason: "fixed_window_usage_cap",
        },
        {
          schema: "identity_profile_status.v0.1",
          profileId: "profile-google-primary",
          provider: "google",
          harness: "codex",
          status: "ready",
          checkedAt: "2026-06-30T10:00:00.000Z",
          activeSessions: 1,
          activeTurns: 1,
        },
      ],
      providerCooldowns: [
        {
          schema: "provider_family_cooldown.v0.1",
          provider: "openai",
          scope: "provider_family",
          active: true,
          reason: "fixed_window_usage_cap",
          observedAt: "2026-06-30T09:55:00.000Z",
          resetAt: "2026-07-01T00:00:00.000Z",
          source: "limit_classification",
        },
      ],
      activeTurns: buildActiveTurnSnapshot([
        {
          schema: "identity_profile_status.v0.1",
          profileId: "profile-google-primary",
          provider: "google",
          harness: "codex",
          status: "ready",
          checkedAt: "2026-06-30T10:00:00.000Z",
          activeSessions: 1,
          activeTurns: 1,
        },
      ]),
      capabilityFitByProfileId: {
        "profile-google-primary": 0.95,
        "profile-openai-primary": 0.9,
      },
      providerHealth: {
        google: 0.92,
        openai: 0.7,
      },
      now: "2026-06-30T10:00:00.000Z",
    });

    expect(pool.evaluatedAt).toBe("2026-06-30T10:00:00.000Z");
    expect(pool.candidates.map((candidate) => candidate.profile.id)).toEqual([
      "profile-google-primary",
      "profile-openai-primary",
    ]);
    expect(pool.candidates[0]?.available).toBe(true);
    expect(pool.candidates[0]?.availableTurnSlots).toBe(2);
    expect(pool.candidates[1]?.available).toBe(false);
    expect(pool.candidates[1]?.cooldownState.providerFamilyBlocked).toBe(true);
  });
});
