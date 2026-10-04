import { applyRetryGuardrails } from "@omniagent-plus/rate-limit-catalog";

import type {
  RetryGuardrailDecision,
  RetryGuardrailInput,
} from "./types.js";

export function evaluateRetryGuardrails(
  input: RetryGuardrailInput,
): RetryGuardrailDecision {
  for (const count of [input.repeatedFailures, input.maxRepeatedFailures ?? 0]) {
    if (!Number.isSafeInteger(count) || count < 0) throw new TypeError("Retry counts must be nonnegative safe integers");
  }
  if (["auth", "billing", "policy_denied", "approval_required", "approval_denied"].includes(input.failure.category)
    || input.idempotencySafe === false || (input.mutation === true && input.idempotencySafe !== true)) {
    return { allowRetry: false, action: "manual_review", reason: "Failure or mutation requires manual review before retry" };
  }
  if (input.classification !== undefined) {
    const result = applyRetryGuardrails({
      classification: input.classification,
      repeatedAttempts: input.repeatedFailures,
      maxRepeatedAttempts: input.maxRepeatedFailures,
    });

    if (result.allowRetry) {
      if (!input.failure.retryable) return { allowRetry: false, action: "manual_review", reason: "Runtime failure is not retryable" };
      return {
        allowRetry: true,
        action:
          input.repeatedFailures > 0
          && input.classification.routingAction.routeNewWorkElsewhere
            ? "route_new_work_elsewhere"
            : "retry_same_session",
        reason: result.reason,
        retryAfterSeconds: result.nextDelaySeconds,
        sameProviderAccountSwitch:
          input.classification.routingAction.sameProviderAccountSwitch,
      };
    }

    const action =
      result.reason === "wait_for_reset"
        ? "wait_for_reset"
        : input.classification.routingAction.requireManualReview
          ? "manual_review"
          : "route_new_work_elsewhere";

    return {
      allowRetry: false,
      action,
      reason: result.reason,
      retryAfterSeconds: result.nextDelaySeconds,
      sameProviderAccountSwitch:
        result.classification.routingAction.sameProviderAccountSwitch,
    };
  }

  switch (input.failure.category) {
    case "auth":
    case "billing":
    case "policy_denied":
    case "approval_required":
    case "approval_denied":
      return {
        allowRetry: false,
        action: "manual_review",
        reason: `${input.failure.category} requires manual review`,
      };
    case "backend_unavailable":
    case "transport":
    case "timeout":
    case "concurrency_limit":
    case "rate_limit":
      if (!input.failure.retryable) return { allowRetry: false, action: "manual_review", reason: "Runtime failure is not retryable" };
      if (input.repeatedFailures >= Math.min(input.maxRepeatedFailures ?? 2, 2)) {
        return {
          allowRetry: false,
          action: "route_new_work_elsewhere",
          reason: "retry storm guardrail stopped repeated backend failures",
        };
      }
      return {
        allowRetry: true,
        action: "retry_same_session",
        reason: "retryable runtime failure",
        retryAfterSeconds: Math.min(300, 2 ** Math.min(9, input.repeatedFailures)),
      };
    default:
      return {
        allowRetry: false,
        action: "manual_review",
        reason: "retry guardrail requires manual review",
      };
  }
}
