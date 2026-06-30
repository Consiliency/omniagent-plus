import { describe, expect, it } from "vitest";

import { classifyLimitSignal } from "./classifier.js";

describe("classifier", () => {
  it("parses retry-after headers and redacts raw signal headers to safe metadata", () => {
    const classification = classifyLimitSignal({
      bodyText:
        "Rate limit reached for requests per minute. Please retry after 20 seconds.",
      headers: {
        authorization: "secret-token",
        "retry-after": "20",
      },
      statusCode: 429,
    });

    expect(classification.type).toBe("burst_rate_limit");
    expect(classification.retryAfterSeconds).toBe(20);
    expect(classification.rawSignal.headers).toEqual({
      "retry-after": "20",
    });
  });

  it("distinguishes reset-bound hard caps from retryable burst limits", () => {
    const burst = classifyLimitSignal({
      bodyText: "Too many requests for this endpoint. Retry after 15 seconds.",
      headers: {
        "retry-after": "15",
      },
      statusCode: 429,
    });
    const hardCap = classifyLimitSignal({
      bodyText:
        "Daily usage limit reached and resets at 2026-07-01T09:00:00.000Z.",
      statusCode: 429,
    });

    expect(burst.type).toBe("burst_rate_limit");
    expect(burst.routingAction.retrySameSession).toBe(true);
    expect(hardCap.type).toBe("fixed_window_usage_cap");
    expect(hardCap.resetAt).toBe("2026-07-01T09:00:00.000Z");
    expect(hardCap.routingAction.retrySameSession).toBe(false);
    expect(hardCap.routingAction.sameProviderAccountSwitch).toBe(
      "manual_confirmation_required",
    );
  });

  it("captures ambiguous limit-like signals as unknown_limit", () => {
    const classification = classifyLimitSignal({
      bodyText: "limit event encountered by backend",
      headers: {
        "x-ratelimit-reset": "2026-07-01T00:15:00.000Z",
      },
      statusCode: 429,
    });

    expect(classification.type).toBe("unknown_limit");
    expect(classification.confidence).toBeLessThan(0.7);
  });

  it("returns none for non-limit validation failures even when the status code is 429", () => {
    const classification = classifyLimitSignal({
      bodyText: "Schema validation failed: payload missing required field.",
      statusCode: 429,
    });

    expect(classification.type).toBe("none");
  });
});
