import { describe, expect, it } from "vitest";

import { evaluateFailurePolicy } from "./index.js";

describe("failure policy", () => {
  it("pauses the provider family for hard usage caps", () => {
    const decision = evaluateFailurePolicy({
      observedAt: "2026-06-30T10:30:00.000Z",
      failure: {
        schema: "runtime_failure.v0.1",
        actor: "provider",
        category: "rate_limit",
        message: "Daily cap reached",
        retryable: false,
        scope: "provider_family",
      },
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
      repeatedFailures: 1,
    });

    expect(decision.allowRetry).toBe(false);
    expect(decision.action).toBe("pause_provider_family");
    expect(decision.providerCooldown?.provider).toBe("openai");
    expect(decision.retryAfterSeconds).toBe(600);
  });

  it("forces manual review for auth and billing failures", () => {
    const decision = evaluateFailurePolicy({
      observedAt: "2026-06-30T10:31:00.000Z",
      failure: {
        schema: "runtime_failure.v0.1",
        actor: "provider",
        category: "billing",
        message: "Billing setup required",
        retryable: false,
        scope: "provider_family",
      },
      repeatedFailures: 0,
    });

    expect(decision.allowRetry).toBe(false);
    expect(decision.action).toBe("manual_review");
    expect(decision.providerCooldown).toBeUndefined();
  });
});
