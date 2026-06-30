import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { LimitClassification } from "@omniagent-plus/core-contracts";
import { classifyLimitSignal } from "@omniagent-plus/rate-limit-catalog";

import { evaluateFailurePolicy, evaluateRetryGuardrails } from "./index.js";

interface HardeningFixture {
  readonly retryAllowed: {
    readonly bodyText: string;
    readonly headers: Record<string, string>;
    readonly repeatedFailures: number;
    readonly statusCode: number;
    readonly expected: {
      readonly action: string;
      readonly note: string;
      readonly reason: string;
      readonly retryAfterSeconds: number;
    };
  };
  readonly retryStorm: {
    readonly bodyText: string;
    readonly headers: Record<string, string>;
    readonly repeatedFailures: number;
    readonly statusCode: number;
    readonly expected: {
      readonly action: string;
      readonly reason: string;
      readonly retryAfterSeconds: number;
    };
  };
  readonly cooldownPause: {
    readonly classification: LimitClassification;
    readonly observedAt: string;
    readonly repeatedFailures: number;
    readonly expected: {
      readonly action: string;
      readonly reason: string;
      readonly resetAt: string;
    };
  };
}

function readFixture(): HardeningFixture {
  return JSON.parse(
    readFileSync(
      new URL("../../../fixtures/hardening/recovery/coordinator-retry-guardrails.json", import.meta.url),
      "utf8",
    ),
  ) as HardeningFixture;
}

function backendUnavailableFailure() {
  return {
    schema: "runtime_failure.v0.1" as const,
    actor: "provider" as const,
    category: "backend_unavailable" as const,
    message: "backend unavailable",
    retryable: true,
    scope: "provider_family" as const,
  };
}

describe("hardening recovery", () => {
  it("proves retry storms stop after cooldown-backed retry evidence instead of looping indefinitely", () => {
    const fixture = readFixture();
    const allowedClassification = classifyLimitSignal({
      bodyText: fixture.retryAllowed.bodyText,
      headers: fixture.retryAllowed.headers,
      statusCode: fixture.retryAllowed.statusCode,
    });
    const allowed = evaluateRetryGuardrails({
      failure: backendUnavailableFailure(),
      classification: allowedClassification,
      repeatedFailures: fixture.retryAllowed.repeatedFailures,
    });
    const blockedClassification = classifyLimitSignal({
      bodyText: fixture.retryStorm.bodyText,
      headers: fixture.retryStorm.headers,
      statusCode: fixture.retryStorm.statusCode,
    });
    const blocked = evaluateRetryGuardrails({
      failure: backendUnavailableFailure(),
      classification: blockedClassification,
      repeatedFailures: fixture.retryStorm.repeatedFailures,
    });

    expect(allowedClassification.notes).toContain(
      fixture.retryAllowed.expected.note,
    );
    expect(allowed.allowRetry).toBe(true);
    expect(allowed.action).toBe(fixture.retryAllowed.expected.action);
    expect(allowed.reason).toBe(fixture.retryAllowed.expected.reason);
    expect(allowed.retryAfterSeconds).toBe(
      fixture.retryAllowed.expected.retryAfterSeconds,
    );

    expect(blocked.allowRetry).toBe(false);
    expect(blocked.action).toBe(fixture.retryStorm.expected.action);
    expect(blocked.reason).toBe(fixture.retryStorm.expected.reason);
    expect(blocked.retryAfterSeconds).toBe(
      fixture.retryStorm.expected.retryAfterSeconds,
    );
  });

  it("records provider cooldown evidence for hard-stop classifications that must wait for reset", () => {
    const fixture = readFixture();
    const decision = evaluateFailurePolicy({
      failure: {
        schema: "runtime_failure.v0.1",
        actor: "provider",
        category: "rate_limit",
        message: "provider reset pending",
        retryable: false,
        scope: "provider_family",
      },
      classification: fixture.cooldownPause.classification,
      observedAt: fixture.cooldownPause.observedAt,
      repeatedFailures: fixture.cooldownPause.repeatedFailures,
    });

    expect(decision.allowRetry).toBe(false);
    expect(decision.action).toBe(fixture.cooldownPause.expected.action);
    expect(decision.reason).toBe(fixture.cooldownPause.expected.reason);
    expect(decision.providerCooldown?.active).toBe(true);
    expect(decision.providerCooldown?.resetAt).toBe(
      fixture.cooldownPause.expected.resetAt,
    );
  });
});
