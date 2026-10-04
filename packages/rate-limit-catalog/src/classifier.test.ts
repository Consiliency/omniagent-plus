import { describe, expect, it } from "vitest";

import { classifyLimitSignal } from "./classifier.js";

describe("classifier", () => {
  it("bounds complete integer and HTTP-date delays and ignores invalid or overflowing inputs", () => {
    for (const value of ["-1", "1.5", "5junk", "Infinity", "9007199254740992", "9".repeat(400)]) {
      expect(classifyLimitSignal({ headers: { "retry-after": value }, statusCode: 429 }).retryAfterSeconds).toBeUndefined();
    }
    expect(classifyLimitSignal({ headers: { "retry-after": "301" } }).retryAfterSeconds).toBe(300);
    expect(classifyLimitSignal({ headers: { "retry-after": "0" } }).retryAfterSeconds).toBe(0);
    expect(classifyLimitSignal({ headers: { "retry-after": "Sat, 03 Oct 2026 00:02:00 GMT" }, now: "2026-10-03T00:00:00Z" }).retryAfterSeconds).toBe(120);
    expect(classifyLimitSignal({ headers: { "x-ratelimit-reset": "9".repeat(400) } }).resetAt).toBeUndefined();
  });
  it("keeps individual confidence scores heuristic and precedence deterministic", () => {
    const keyword = classifyLimitSignal({ bodyText: "policy" });
    expect(keyword.type).toBe("abuse_or_policy_block");
    expect(keyword.confidence).toBeGreaterThanOrEqual(0.86);
    expect(keyword.rawSignal.statusCode).toBeUndefined();
    expect(keyword.resetAt).toBeUndefined();
    const mixed = { bodyText: "policy billing overload monthly quota concurrency rate limit", statusCode: 401 };
    expect(classifyLimitSignal(mixed).type).toBe("abuse_or_policy_block");
    expect(classifyLimitSignal(mixed)).toEqual(classifyLimitSignal(mixed));
    expect(classifyLimitSignal({ bodyText: "billing overload", statusCode: 401 }).type).toBe("auth_or_billing_problem");
    expect(classifyLimitSignal({ bodyText: "overload monthly quota", statusCode: 503 }).type).toBe("overload_or_transient");
  });
  it("does not publish raw credentials, secret-like headers or provider text", () => {
    const classification = classifyLimitSignal({ bodyText: "Rate limit. API_KEY=synthetic-private", stderrText: "Authorization: Bearer synthetic-private", headers: { "private-reset-token": "synthetic-private", "retry-after": "5", "x-ratelimit-reset": "API_KEY=synthetic-private" }, statusCode: 429 });
    const published = JSON.stringify(classification);
    expect(published).not.toContain("synthetic-private");
    expect(published).not.toContain("private-reset-token");
    expect(classification.rawSignal.stdoutExcerpt).toBe("[redacted]");
  });
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
