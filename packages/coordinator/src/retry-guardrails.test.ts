import { describe, expect, it } from "vitest";

import { classifyLimitSignal } from "@omniagent-plus/rate-limit-catalog";

import { evaluateRetryGuardrails } from "./index.js";

describe("retry guardrails", () => {
  it("respects nonretryable and unsafe mutation posture despite a retryable classification", () => {
    const classification = classifyLimitSignal({ bodyText: "Service overloaded" });
    const failure = { schema: "runtime_failure.v0.1" as const, actor: "provider" as const, category: "transport" as const, message: "transient", retryable: true, scope: "turn" as const };
    for (const input of [{ failure: { ...failure, retryable: false } }, { failure, idempotencySafe: false }, { failure, mutation: true }, { failure: { ...failure, category: "auth" as const } }]) {
      expect(evaluateRetryGuardrails({ ...input, classification, repeatedFailures: 0 }).allowRetry).toBe(false);
    }
    expect(evaluateRetryGuardrails({ failure, classification, repeatedFailures: 0, mutation: true, idempotencySafe: true }).allowRetry).toBe(true);
    for (const repeatedFailures of [-1, 0.5, NaN, Infinity]) expect(() => evaluateRetryGuardrails({ failure, repeatedFailures })).toThrow();
    expect(evaluateRetryGuardrails({ failure, repeatedFailures: 1 }).retryAfterSeconds).toBe(2);
    expect(evaluateRetryGuardrails({ failure, classification: { ...classification, retryAfterSeconds: Infinity }, repeatedFailures: 1 }).retryAfterSeconds).toBe(2);
    expect(evaluateRetryGuardrails({ failure, classification: { ...classification, retryAfterSeconds: 999 }, repeatedFailures: 1 }).retryAfterSeconds).toBe(300);
    expect(evaluateRetryGuardrails({ failure, classification, repeatedFailures: 3, maxRepeatedFailures: 100 }).allowRetry).toBe(false);
  });
  it("requires manual review for auth and billing failures", () => {
    const decision = evaluateRetryGuardrails({
      failure: {
        schema: "runtime_failure.v0.1",
        actor: "provider",
        category: "auth",
        message: "Authentication expired",
        retryable: false,
        scope: "identity_profile",
      },
      repeatedFailures: 0,
    });

    expect(decision.allowRetry).toBe(false);
    expect(decision.action).toBe("manual_review");
  });

  it("stops repeated retryable failures before they become a retry storm", () => {
    const classification = classifyLimitSignal({
      bodyText: "Service overloaded, please try again later.",
      headers: {
        "retry-after": "5",
      },
      statusCode: 503,
    });

    const decision = evaluateRetryGuardrails({
      failure: {
        schema: "runtime_failure.v0.1",
        actor: "provider",
        category: "backend_unavailable",
        message: "backend unavailable",
        retryable: true,
        scope: "provider_family",
      },
      classification,
      repeatedFailures: 3,
    });

    expect(decision.allowRetry).toBe(false);
    expect(decision.action).toBe("route_new_work_elsewhere");
    expect(decision.reason).toBe("retry_storm_guardrail");
  });

  it("waits for reset on unknown limit signals instead of retrying indefinitely", () => {
    const decision = evaluateRetryGuardrails({
      failure: {
        schema: "runtime_failure.v0.1",
        actor: "provider",
        category: "rate_limit",
        message: "unclassified 429",
        retryable: false,
        scope: "provider_family",
      },
      classification: {
        schema: "limit_classification.v0.1",
        type: "unknown_limit",
        scope: "provider_family",
        confidence: 0.3,
        provider: "openai",
        harness: "codex",
        retryAfterSeconds: 120,
        resetAt: "2026-06-30T10:35:00.000Z",
        rawSignal: {
          statusCode: 429,
          stderrExcerpt: "unknown throttling signal",
        },
        routingAction: {
          retrySameSession: false,
          reduceConcurrency: true,
          routeNewWorkElsewhere: false,
          migrateExistingPortableWork: false,
          requireManualReview: true,
          sameProviderAccountSwitch: "manual_confirmation_required",
        },
      },
      repeatedFailures: 1,
    });

    expect(decision.allowRetry).toBe(false);
    expect(decision.action).toBe("wait_for_reset");
    expect(decision.retryAfterSeconds).toBe(120);
  });
});
