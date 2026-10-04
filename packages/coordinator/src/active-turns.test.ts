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
    for (const _terminal of ["complete", "cancel", "failure", "retry"]) accounting.settle("turn-1", options.sessionId);
    expect(accounting.snapshot.totalActiveTurns).toBe(1);
    expect(accounting.snapshot.bySessionId.__proto__).toBe(1);
    accounting.settle("turn-2", options.sessionId);
    expect(accounting.snapshot.totalActiveTurns).toBe(0);
    expect(() => accounting.begin("turn-1", options)).toThrow();
    expect(() => accounting.settle("unknown")).toThrow();
    expect(() => decrementActiveTurns(accounting.snapshot, options)).toThrow();
    for (const delta of [-1, 0.5, NaN, Infinity]) expect(() => incrementActiveTurns(accounting.snapshot, { ...options, delta })).toThrow();
  });
  it("owns turn IDs independently in each session and preserves identifier maps across transitions", () => {
    const accounting = new ActiveTurnAccounting();
    accounting.begin("same", { profileId: "ordinary", provider: "openai", sessionId: "a" });
    accounting.begin("same", { profileId: "constructor", provider: "openai", sessionId: "toString" });
    expect(accounting.snapshot.totalActiveTurns).toBe(2);
    accounting.settle("same", "a");
    accounting.settle("same", "a");
    expect(accounting.snapshot.byProfileId.constructor).toBe(1);
    expect(accounting.snapshot.bySessionId.toString).toBe(1);
    accounting.settle("same", "toString");
    expect(accounting.snapshot.totalActiveTurns).toBe(0);
    expect(Object.getPrototypeOf(accounting.snapshot.byProfileId)).toBeNull();
    expect(Object.getPrototypeOf(accounting.snapshot.bySessionId)).toBeNull();
    const built = incrementActiveTurns(buildActiveTurnSnapshot([]), { profileId: "toString", provider: "openai", sessionId: "__proto__" });
    expect(built.bySessionId.__proto__).toBe(1);
    const legacy = incrementActiveTurns({ totalActiveTurns: 0, byProfileId: {}, byProvider: {}, bySessionId: {} }, { profileId: "constructor", provider: "openai", sessionId: "constructor" });
    expect(legacy.totalActiveTurns).toBe(1);
  });
  it("refuses aggregate overflow before publishing counts", () => {
    const status = { schema: "identity_profile_status.v0.1" as const, profileId: "a", provider: "openai" as const, harness: "codex" as const,
      status: "ready" as const, checkedAt: "2026-06-30T00:00:00Z", activeSessions: 0, activeTurns: Number.MAX_SAFE_INTEGER };
    expect(() => buildActiveTurnSnapshot([status, { ...status, profileId: "b", activeTurns: 1 }])).toThrow(/safe integers/);
    expect(() => buildActiveTurnSnapshot([status, { ...status, profileId: "b", provider: "google", activeTurns: 1 }])).toThrow(/safe integers/);
    const full = buildActiveTurnSnapshot([status]);
    expect(() => incrementActiveTurns(full, { profileId: "b", provider: "openai" })).toThrow(/safe integers/);
    expect(() => incrementActiveTurns({ ...createEmptyActiveTurnSnapshot(), totalActiveTurns: -1 }, { profileId: "a", provider: "openai" })).toThrow();
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
