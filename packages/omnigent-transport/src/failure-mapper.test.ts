import { describe, expect, it } from "vitest";

import { loadOmnigentV010WireContract } from "./contract-fixtures.js";
import {
  mapCapabilityGap,
  mapCliFailure,
  mapDisconnectedBackend,
  mapHttpFailure,
} from "./failure-mapper.js";
import { OmnigentHttpError } from "./http-client.js";

function httpError(
  body: unknown,
  statusCode: number,
  headers: Record<string, string> = {},
): OmnigentHttpError {
  return new OmnigentHttpError({
    body,
    headers,
    method: "POST",
    path: "/v1/sessions/id/events",
    statusCode,
  });
}

describe("failure mapper", () => {
  it("maps validation, billing, policy, and rate-limit HTTP failures", () => {
    const validation = mapHttpFailure(
      httpError({ error: "unsupported event type" }, 400),
    );
    const billing = mapHttpFailure(httpError({ error: "billing issue" }, 403));
    const policy = mapHttpFailure(httpError({ error: "policy blocked" }, 403));
    const rateLimit = mapHttpFailure(
      httpError({ error: "usage cap reached" }, 429, { "retry-after": "60" }),
    );

    expect(validation.failure.category).toBe("validation");
    expect(billing.limitClassification?.type).toBe("auth_or_billing_problem");
    expect(policy.limitClassification?.type).toBe("abuse_or_policy_block");
    expect(rateLimit.failure.category).toBe("rate_limit");
    expect(rateLimit.limitClassification?.type).toBe("fixed_window_usage_cap");
  });

  it("classifies only supported canonical HTTP body signals", () => {
    for (const body of [
      "billing issue",
      { code: "billing_issue" },
      { message: "billing issue" },
      { error: "billing issue" },
      { detail: "billing issue" },
      { detail: { code: "billing_issue" } },
      { detail: { message: "billing issue" } },
      { detail: { error: "billing issue" } },
    ]) {
      expect(mapHttpFailure(httpError(body, 403)).failure.category).toBe(
        "billing",
      );
    }
  });

  it("keeps v0.10 descriptive and unknown fields out of failure policy", () => {
    const wire = loadOmnigentV010WireContract();
    const rateLimitError = httpError(
      wire.structured_error.body,
      wire.structured_error.status_code,
      { ...wire.structured_error.headers },
    );
    const policyError = httpError(
      wire.structured_policy_error.body,
      wire.structured_policy_error.status_code,
    );

    const rateLimit = mapHttpFailure(rateLimitError);
    const policy = mapHttpFailure(policyError);

    expect(rateLimit.failure.category).toBe(
      wire.structured_error.expected_failure.category,
    );
    expect(rateLimit.failure.retryable).toBe(
      wire.structured_error.expected_failure.retryable,
    );
    expect(rateLimit.limitClassification?.type).toBe(
      wire.structured_error.expected_failure.limit_type,
    );
    expect(policy.failure.category).toBe(
      wire.structured_policy_error.expected_failure.category,
    );
    expect(policy.limitClassification?.type).toBe(
      wire.structured_policy_error.expected_failure.limit_type,
    );
    expect(rateLimitError.body).toBe(wire.structured_error.body);
    expect(policyError.body).toBe(wire.structured_policy_error.body);
  });

  it("treats descriptive-only bodies and detail arrays as inert", () => {
    for (const body of [
      {
        cause: "auth failed",
        remediation: "update billing",
        title: "monthly quota reached",
        unknown: "usage cap",
      },
      { detail: ["billing", { message: "auth quota" }] },
      { detail: { title: "billing", unknown: "auth" } },
    ]) {
      const policy = mapHttpFailure(httpError(body, 403));
      const rateLimit = mapHttpFailure(httpError(body, 429));

      expect(policy.failure.category).toBe("policy_denied");
      expect(policy.limitClassification?.type).toBe("abuse_or_policy_block");
      expect(rateLimit.failure.retryable).toBe(true);
      expect(rateLimit.limitClassification?.type).toBe("burst_rate_limit");
    }
  });

  it("maps CLI, capability, and disconnected-backend failures", () => {
    const cliFailure = mapCliFailure({
      command: ["omnigent", "run", "demo-agent"],
      exitCode: 1,
      stderr: "billing quota exceeded",
      stdout: "",
    });
    const capabilityGap = mapCapabilityGap("child_session");
    const disconnected = mapDisconnectedBackend("stream", new Error("socket hung up"));

    expect(cliFailure.limitClassification?.type).toBe("auth_or_billing_problem");
    expect(capabilityGap.failure.category).toBe("backend_capability_missing");
    expect(disconnected.failure.category).toBe("transport");
  });
});
