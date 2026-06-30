import type { FailurePolicyDecision, FailurePolicyInput } from "./types.js";

import { deriveProviderFamilyCooldown } from "./cooldowns.js";
import { evaluateRetryGuardrails } from "./retry-guardrails.js";

export function evaluateFailurePolicy(
  input: FailurePolicyInput,
): FailurePolicyDecision {
  const retry = evaluateRetryGuardrails(input);
  const providerCooldown =
    input.classification === undefined
      ? undefined
      : deriveProviderFamilyCooldown(input.classification, input.observedAt);

  return {
    allowRetry: retry.allowRetry,
    action:
      providerCooldown !== undefined && !retry.allowRetry
        ? "pause_provider_family"
        : retry.action,
    reason: retry.reason,
    retryAfterSeconds: retry.retryAfterSeconds,
    providerCooldown,
    sameProviderAccountSwitch: retry.sameProviderAccountSwitch,
  };
}
