import type { LimitClassification } from "@omniagent-plus/core-contracts";

import type {
  AdaptiveConcurrencyDecision,
  AdaptiveConcurrencyInput,
} from "./types.js";

const hardStopTypes = new Set<LimitClassification["type"]>([
  "fixed_window_usage_cap",
  "monthly_spend_or_quota_cap",
  "auth_or_billing_problem",
  "abuse_or_policy_block",
  "unknown_limit",
]);

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function evaluateAdaptiveConcurrency(
  input: AdaptiveConcurrencyInput,
): AdaptiveConcurrencyDecision {
  const maxActiveTurns = Math.max(0, Math.trunc(input.maxActiveTurns));
  const baseTarget = clamp(Math.trunc(input.baseTarget), 0, maxActiveTurns);
  const activeTurns = clamp(Math.trunc(input.activeTurns), 0, maxActiveTurns);
  const reasons: string[] = [];
  let targetActiveTurns = baseTarget;

  if (input.providerHealth !== undefined && input.providerHealth < 0.5) {
    const healthTarget = Math.max(1, Math.floor(baseTarget * input.providerHealth));
    if (healthTarget < targetActiveTurns) {
      targetActiveTurns = healthTarget;
      reasons.push("provider health reduced the active-turn target");
    }
  }

  if (input.classification !== undefined) {
    if (hardStopTypes.has(input.classification.type)) {
      targetActiveTurns = 0;
      reasons.push(`${input.classification.type} paused active turns`);
    } else if (input.classification.routingAction.reduceConcurrency) {
      const reducedTarget = Math.max(1, targetActiveTurns - 1);
      if (reducedTarget < targetActiveTurns) {
        targetActiveTurns = reducedTarget;
        reasons.push(`${input.classification.type} reduced concurrency`);
      }
    }
  }

  const availableTurnSlots = Math.max(0, targetActiveTurns - activeTurns);
  const currentCapacity =
    maxActiveTurns === 0 ? 0 : availableTurnSlots / maxActiveTurns;

  return {
    targetActiveTurns,
    availableTurnSlots,
    currentCapacity,
    reduced: targetActiveTurns < baseTarget,
    reasons,
  };
}
