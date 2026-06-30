import {
  providerFamilyIds,
  type IdentityProfile,
  type IdentityProfileStatus,
  type LimitClassification,
  type ProviderFamilyCooldown,
  type ProviderFamilyId,
} from "@omniagent-plus/core-contracts";

import type { CooldownEvaluation } from "./types.js";

const providerFamilyIdSet = new Set<ProviderFamilyId>(providerFamilyIds);

const providerCooldownTypes = new Set<LimitClassification["type"]>([
  "fixed_window_usage_cap",
  "monthly_spend_or_quota_cap",
  "auth_or_billing_problem",
  "abuse_or_policy_block",
  "unknown_limit",
]);

function isProviderFamilyId(value: string | undefined): value is ProviderFamilyId {
  return value !== undefined && providerFamilyIdSet.has(value as ProviderFamilyId);
}

export function deriveProviderFamilyCooldown(
  classification: LimitClassification,
  observedAt: string,
): ProviderFamilyCooldown | undefined {
  if (
    !providerCooldownTypes.has(classification.type)
    || !isProviderFamilyId(classification.provider)
  ) {
    return undefined;
  }

  return {
    schema: "provider_family_cooldown.v0.1",
    provider: classification.provider,
    scope: "provider_family",
    active: true,
    reason: classification.type,
    observedAt,
    resetAt: classification.resetAt,
    source: "limit_classification",
  };
}

export function evaluateCooldownState(options: {
  readonly profile: IdentityProfile;
  readonly status?: IdentityProfileStatus;
  readonly providerCooldown?: ProviderFamilyCooldown;
  readonly classification?: LimitClassification;
}): CooldownEvaluation {
  const providerFamilyBlocked =
    options.providerCooldown?.active === true
    || options.profile.providerFamilyCooldown?.active === true;
  const identityBlocked =
    options.status?.cooldown?.active === true
    || options.profile.identityCooldown?.active === true;
  const reason =
    options.status?.cooldown?.reason
    ?? options.providerCooldown?.reason
    ?? options.profile.identityCooldown?.reason
    ?? options.profile.providerFamilyCooldown?.reason;
  const resetAt =
    options.status?.cooldown?.resetAt
    ?? options.providerCooldown?.resetAt
    ?? options.profile.identityCooldown?.resetAt
    ?? options.profile.providerFamilyCooldown?.resetAt;

  return {
    blocked: providerFamilyBlocked || identityBlocked,
    providerFamilyBlocked,
    identityBlocked,
    reason,
    resetAt,
    sameProviderAccountSwitch:
      options.classification?.routingAction.sameProviderAccountSwitch ?? "forbidden",
  };
}
