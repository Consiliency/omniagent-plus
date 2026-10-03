import { describe, expect, it } from "vitest";

import {
  buildActiveTurnSnapshot,
  createEmptyActiveTurnSnapshot,
  incrementActiveTurns,
  decrementActiveTurns,
  ActiveTurnAccounting,
} from "./index.js";

describe("active turn accounting", () => {
  it("settles each turn once across completion, cancellation, failure and retry notifications", () => {
    const accounting = new ActiveTurnAccounting();
    const options = { profileId: "constructor", provider: "openai" as const, sessionId: "__proto__" };
    accounting.begin("turn-1", options);
    accounting.begin("turn-2", options);
    for (const _terminal of ["complete", "cancel", "failure", "retry"]) accounting.settle("turn-1");
    expect(accounting.snapshot.totalActiveTurns).toBe(1);
    expect(accounting.snapshot.bySessionId.__proto__).toBe(1);
    accounting.settle("turn-2");
    expect(accounting.snapshot.totalActiveTurns).toBe(0);
    expect(() => accounting.begin("turn-1", options)).toThrow();
    expect(() => accounting.settle("unknown")).toThrow();
    expect(() => decrementActiveTurns(accounting.snapshot, options)).toThrow();
    for (const delta of [-1, 0.5, NaN, Infinity]) expect(() => incrementActiveTurns(accounting.snapshot, { ...options, delta })).toThrow();
  });
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
