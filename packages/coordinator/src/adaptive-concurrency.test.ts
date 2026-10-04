import { describe, expect, it } from "vitest";

import { evaluateAdaptiveConcurrency } from "./index.js";

describe("adaptive concurrency", () => {
  it("rejects unsafe count and health inputs rather than publishing nonfinite capacity", () => {
    const input = { baseTarget: 3, maxActiveTurns: 3, activeTurns: 0, providerHealth: 1 };
    for (const field of ["baseTarget", "maxActiveTurns", "activeTurns"] as const) {
      for (const value of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) expect(() => evaluateAdaptiveConcurrency({ ...input, [field]: value })).toThrow();
    }
    for (const providerHealth of [-1, 2, NaN, Infinity]) expect(() => evaluateAdaptiveConcurrency({ ...input, providerHealth })).toThrow();
    expect(evaluateAdaptiveConcurrency({ baseTarget: 0, maxActiveTurns: 0, activeTurns: 0, providerHealth: 0 }).currentCapacity).toBe(0);
  });
  it("reduces the active-turn target for transient pressure and low health", () => {
    const decision = evaluateAdaptiveConcurrency({
      baseTarget: 6,
      maxActiveTurns: 6,
      activeTurns: 1,
      providerHealth: 0.4,
      classification: {
        schema: "limit_classification.v0.1",
        type: "concurrency_limit",
        scope: "provider_family",
        confidence: 0.98,
        provider: "openai",
        harness: "codex",
        rawSignal: {
          statusCode: 429,
        },
        routingAction: {
          retrySameSession: true,
          reduceConcurrency: true,
          routeNewWorkElsewhere: true,
          migrateExistingPortableWork: true,
          requireManualReview: false,
          sameProviderAccountSwitch: "forbidden",
        },
      },
    });

    expect(decision.targetActiveTurns).toBe(1);
    expect(decision.availableTurnSlots).toBe(0);
    expect(decision.currentCapacity).toBe(0);
    expect(decision.reduced).toBe(true);
    expect(decision.reasons).toContain(
      "provider health reduced the active-turn target",
    );
    expect(decision.reasons).toContain(
      "concurrency_limit reduced concurrency",
    );
  });

  it("pauses active turns for hard usage caps", () => {
    const decision = evaluateAdaptiveConcurrency({
      baseTarget: 3,
      maxActiveTurns: 3,
      activeTurns: 0,
      classification: {
        schema: "limit_classification.v0.1",
        type: "fixed_window_usage_cap",
        scope: "provider_family",
        confidence: 0.99,
        provider: "openai",
        harness: "codex",
        retryAfterSeconds: 600,
        resetAt: "2026-07-01T00:00:00.000Z",
        rawSignal: {
          statusCode: 429,
        },
        routingAction: {
          retrySameSession: false,
          reduceConcurrency: true,
          routeNewWorkElsewhere: true,
          migrateExistingPortableWork: true,
          requireManualReview: false,
          sameProviderAccountSwitch: "forbidden",
        },
      },
    });

    expect(decision.targetActiveTurns).toBe(0);
    expect(decision.availableTurnSlots).toBe(0);
    expect(decision.currentCapacity).toBe(0);
    expect(decision.reasons).toContain(
      "fixed_window_usage_cap paused active turns",
    );
  });
});
