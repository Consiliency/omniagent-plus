import type { LimitClassification, LimitType } from "@omniagent-plus/core-contracts";

import { dedupeNotes } from "./rules.js";
import type {
  RetryGuardrailDecision,
  RetryGuardrailInput,
} from "./types.js";

const hardStopTypes = new Set<LimitType>([
  "fixed_window_usage_cap",
  "monthly_spend_or_quota_cap",
  "auth_or_billing_problem",
  "abuse_or_policy_block",
  "unknown_limit",
]);

const retryBudgetByType: Partial<Record<LimitType, number>> = {
  acceleration_limit: 1,
  burst_rate_limit: 2,
  concurrency_limit: 2,
  overload_or_transient: 3,
  token_rate_limit: 2,
};

function withGuardrailUpdate(
  classification: LimitClassification,
  note: string,
  updates: Partial<LimitClassification["routingAction"]>,
): LimitClassification {
  return {
    ...classification,
    notes: dedupeNotes([...(classification.notes ?? []), note]),
    routingAction: {
      ...classification.routingAction,
      ...updates,
    },
  };
}

export function applyRetryGuardrails(
  input: RetryGuardrailInput,
): RetryGuardrailDecision {
  const { classification, repeatedAttempts } = input;

  if (hardStopTypes.has(classification.type)) {
    return {
      allowRetry: false,
      classification,
      nextDelaySeconds: classification.retryAfterSeconds,
      reason:
        classification.resetAt || classification.retryAfterSeconds !== undefined
          ? "wait_for_reset"
          : "hard_cap",
    };
  }

  if (!classification.routingAction.retrySameSession) {
    return {
      allowRetry: false,
      classification,
      nextDelaySeconds: classification.retryAfterSeconds,
      reason: "classification_blocks_retry",
    };
  }

  const maxRepeatedAttempts =
    input.maxRepeatedAttempts ??
    retryBudgetByType[classification.type] ??
    0;

  if (repeatedAttempts >= maxRepeatedAttempts) {
    return {
      allowRetry: false,
      classification: withGuardrailUpdate(
        classification,
        `Retry storm guardrail stopped attempt ${repeatedAttempts + 1}.`,
        {
          requireManualReview: true,
          retrySameSession: false,
          routeNewWorkElsewhere: true,
        },
      ),
      nextDelaySeconds: classification.retryAfterSeconds,
      reason: "retry_storm_guardrail",
    };
  }

  return {
    allowRetry: true,
    classification,
    nextDelaySeconds: classification.retryAfterSeconds,
    reason: "retry_allowed",
  };
}
