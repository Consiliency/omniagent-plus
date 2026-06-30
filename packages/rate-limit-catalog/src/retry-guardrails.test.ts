import { describe, expect, it } from "vitest";

import { classifyLimitSignal } from "./classifier.js";
import { applyRetryGuardrails } from "./retry-guardrails.js";

describe("retry guardrails", () => {
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
