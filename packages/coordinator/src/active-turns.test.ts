import { describe, expect, it } from "vitest";

import {
  buildActiveTurnSnapshot,
  createEmptyActiveTurnSnapshot,
  incrementActiveTurns,
} from "./index.js";

describe("active turn accounting", () => {
  it("aggregates active turns per profile and provider", () => {
    const snapshot = buildActiveTurnSnapshot([
      {
        schema: "identity_profile_status.v0.1",
        profileId: "profile-openai-primary",
        provider: "openai",
        harness: "codex",
        status: "ready",
        checkedAt: "2026-06-30T00:00:00.000Z",
        activeSessions: 1,
        activeTurns: 2,
      },
      {
        schema: "identity_profile_status.v0.1",
        profileId: "profile-openai-secondary",
        provider: "openai",
        harness: "codex",
        status: "degraded",
        checkedAt: "2026-06-30T00:00:01.000Z",
        activeSessions: 1,
        activeTurns: 1,
      },
      {
        schema: "identity_profile_status.v0.1",
        profileId: "profile-google-primary",
        provider: "google",
        harness: "codex",
        status: "cooldown",
        checkedAt: "2026-06-30T00:00:02.000Z",
        activeSessions: 0,
        activeTurns: 0,
        reason: "fixed_window_usage_cap",
      },
    ]);

    expect(snapshot.totalActiveTurns).toBe(3);
    expect(snapshot.byProfileId).toEqual({
      "profile-google-primary": 0,
      "profile-openai-primary": 2,
      "profile-openai-secondary": 1,
    });
    expect(snapshot.byProvider).toEqual({
      google: 0,
      openai: 3,
    });
    expect(snapshot.bySessionId).toEqual({});
  });

  it("increments total, provider, profile, and session counters", () => {
    const snapshot = incrementActiveTurns(createEmptyActiveTurnSnapshot(), {
      profileId: "profile-openai-primary",
      provider: "openai",
      sessionId: "session-1",
      delta: 2,
    });

    expect(snapshot.totalActiveTurns).toBe(2);
    expect(snapshot.byProfileId["profile-openai-primary"]).toBe(2);
    expect(snapshot.byProvider.openai).toBe(2);
    expect(snapshot.bySessionId["session-1"]).toBe(2);
  });
});
