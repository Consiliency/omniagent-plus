import { describe, expect, it } from "vitest";

import { classifyLimitSignal } from "./classifier.js";
import { applyRetryGuardrails } from "./retry-guardrails.js";

describe("retry guardrails", () => {
  it("uses integer fallback for invalid delay evidence and refuses false reset authority", () => {
    const transient = classifyLimitSignal({ statusCode: 503, bodyText: "Service overloaded" });
    const hard = { ...transient, type: "fixed_window_usage_cap" as const, resetAt: undefined };
    for (const retryAfterSeconds of [0.5, -1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(applyRetryGuardrails({ classification: { ...transient, retryAfterSeconds }, repeatedAttempts: 1 }).nextDelaySeconds).toBe(2);
      expect(applyRetryGuardrails({ classification: { ...hard, retryAfterSeconds }, repeatedAttempts: 1 }).reason).toBe("hard_cap");
    }
    for (const retryAfterSeconds of [300, 301, Number.MAX_SAFE_INTEGER]) {
      expect(applyRetryGuardrails({ classification: { ...transient, retryAfterSeconds }, repeatedAttempts: 0 }).nextDelaySeconds).toBe(300);
    }
    expect(applyRetryGuardrails({ classification: { ...hard, retryAfterSeconds: 0 }, repeatedAttempts: 0 }).reason).toBe("wait_for_reset");
    expect(applyRetryGuardrails({ classification: { ...hard, resetAt: "invalid" }, repeatedAttempts: 0 }).reason).toBe("hard_cap");
  });
  it("blocks hard usage caps until reset instead of retrying them like burst limits", () => {
    const classification = classifyLimitSignal({
      bodyText:
        "Daily usage cap reached until reset at 2026-07-01T09:00:00.000Z.",
      statusCode: 429,
    });

    const decision = applyRetryGuardrails({
      classification,
      repeatedAttempts: 0,
    });

    expect(decision.allowRetry).toBe(false);
    expect(decision.reason).toBe("wait_for_reset");
  });

  it("stops retry storms after repeated retryable failures", () => {
    const classification = classifyLimitSignal({
      bodyText: "Too many requests for this endpoint. Retry after 15 seconds.",
      headers: {
        "retry-after": "15",
      },
      statusCode: 429,
    });

    const decision = applyRetryGuardrails({
      classification,
      repeatedAttempts: 2,
    });

    expect(decision.allowRetry).toBe(false);
    expect(decision.reason).toBe("retry_storm_guardrail");
    expect(decision.classification.routingAction.retrySameSession).toBe(false);
    expect(decision.classification.routingAction.requireManualReview).toBe(
      true,
    );
  });

  it("allows bounded transient retries while honoring retry-after evidence", () => {
    const classification = classifyLimitSignal({
      bodyText: "Service overloaded, please try again later.",
      headers: {
        "retry-after": "5",
      },
      statusCode: 503,
    });

    const decision = applyRetryGuardrails({
      classification,
      repeatedAttempts: 1,
    });

    expect(decision.allowRetry).toBe(true);
    expect(decision.reason).toBe("retry_allowed");
    expect(decision.nextDelaySeconds).toBe(5);
  });
});
