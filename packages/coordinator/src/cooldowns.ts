import {
  providerFamilyIds,
  type IdentityProfile,
  type IdentityProfileStatus,
  type LimitClassification,
  type ProviderFamilyCooldown,
  type ProviderFamilyId,
} from "@consiliency/runtime-provider";

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
  readonly now?: string;
}): CooldownEvaluation {
  const now = Date.parse(options.now ?? new Date().toISOString());
  if (!Number.isFinite(now)) throw new TypeError("Invalid cooldown clock");
  const classification = effectiveRouteClassification(options.classification, options.profile, now);
  const active = (source: { active: boolean; reason?: string; resetAt?: string } | undefined) =>
    source?.active === true && !resetBoundCooldownExpired(source.reason, source.resetAt, now);
  const providerSources = [options.providerCooldown, options.profile.providerFamilyCooldown].filter(active);
  const identitySources = [options.status?.cooldown, options.profile.identityCooldown].filter(active);
  const providerFamilyBlocked = providerSources.length > 0;
  const identityBlocked = identitySources.length > 0;
  const sources = [...identitySources, ...providerSources];
  const reason = sources.find((source) => source?.reason !== undefined)?.reason;
  const resetAt = sources.find((source) => source?.resetAt !== undefined)?.resetAt;

  return {
    blocked: providerFamilyBlocked || identityBlocked,
    providerFamilyBlocked,
    identityBlocked,
    reason,
    resetAt,
    sameProviderAccountSwitch:
      classification?.routingAction.sameProviderAccountSwitch ?? "forbidden",
  };
}

export function resetBoundCooldownExpired(reason: string | undefined, resetAt: string | undefined, now: number): boolean {
  if (reason !== "fixed_window_usage_cap" && reason !== "monthly_spend_or_quota_cap" && reason !== "unknown_limit") return false;
  const reset = Date.parse(resetAt ?? "");
  return Number.isFinite(reset) && reset <= now;
}

export function effectiveRouteClassification(classification: LimitClassification | undefined, profile: { readonly id: string; readonly provider: string; readonly harness: string }, now?: number): LimitClassification | undefined {
  if (!classification || classification.provider !== profile.provider || classification.harness !== profile.harness
    || classification.identityProfileId !== undefined && classification.identityProfileId !== profile.id
    || classification.sessionId !== undefined || classification.scope === "session"
    || classification.scope === "identity_profile" && classification.identityProfileId === undefined
    || ["model", "project", "organization"].includes(classification.scope)
    || now !== undefined && resetBoundCooldownExpired(classification.type, classification.resetAt, now)) return undefined;
  return classification;
}
