import { describe, expect, it } from "vitest";

import { classifyLimitSignal } from "@omniagent-plus/rate-limit-catalog";

import { evaluateRetryGuardrails } from "./index.js";

describe("retry guardrails", () => {
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
