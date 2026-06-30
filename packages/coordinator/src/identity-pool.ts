import type {
  IdentityProfile,
  IdentityProfileStatus,
  ProviderFamilyCooldown,
  ProviderFamilyId,
} from "@omniagent-plus/core-contracts";

import { createEmptyActiveTurnSnapshot } from "./active-turns.js";
import { evaluateAdaptiveConcurrency } from "./adaptive-concurrency.js";
import { evaluateCooldownState } from "./cooldowns.js";
import type {
  BuildIdentityPoolInput,
  IdentityPoolMember,
  IdentityPoolSnapshot,
} from "./types.js";

function mapStatuses(
  statuses: readonly IdentityProfileStatus[],
): ReadonlyMap<string, IdentityProfileStatus> {
  return new Map(statuses.map((status) => [status.profileId, status]));
}

function mapProviderCooldowns(
  cooldowns: readonly ProviderFamilyCooldown[],
): ReadonlyMap<ProviderFamilyId, ProviderFamilyCooldown> {
  return new Map(
    cooldowns.map((cooldown) => [cooldown.provider, cooldown]),
  );
}

function buildCandidate(
  profile: IdentityProfile,
  input: BuildIdentityPoolInput,
  statuses: ReadonlyMap<string, IdentityProfileStatus>,
  providerCooldowns: ReadonlyMap<ProviderFamilyId, ProviderFamilyCooldown>,
): IdentityPoolMember {
  const status = statuses.get(profile.id);
  const activeTurnsSnapshot = input.activeTurns ?? createEmptyActiveTurnSnapshot();
  const activeTurns =
    activeTurnsSnapshot.byProfileId[profile.id]
    ?? status?.activeTurns
    ?? 0;
  const activeSessions = status?.activeSessions ?? 0;
  const providerCooldown = providerCooldowns.get(profile.provider);
  const classification = input.classificationByProvider?.[profile.provider];
  const cooldownState = evaluateCooldownState({
    profile,
    status,
    providerCooldown,
    classification,
  });
  const providerHealth = input.providerHealth?.[profile.provider] ?? 1;
  const concurrency = evaluateAdaptiveConcurrency({
    baseTarget: profile.maxActiveTurns,
    maxActiveTurns: profile.maxActiveTurns,
    activeTurns,
    classification,
    providerHealth,
  });
  const reasons: string[] = [];

  if (status?.status === "blocked") {
    reasons.push(status.reason ?? "identity status is blocked");
  }
  reasons.push(...concurrency.reasons);
  if (cooldownState.reason) {
    reasons.push(cooldownState.reason);
  }
  if (activeSessions >= profile.maxOpenSessions) {
    reasons.push("open-session limit reached");
  }

  const available =
    status?.status !== "blocked"
    && !cooldownState.blocked
    && activeSessions < profile.maxOpenSessions
    && concurrency.availableTurnSlots > 0;

  return {
    profile,
    status,
    providerCooldown,
    cooldownState,
    activeSessions,
    activeTurns,
    targetActiveTurns: concurrency.targetActiveTurns,
    availableTurnSlots: concurrency.availableTurnSlots,
    currentCapacity: concurrency.currentCapacity,
    providerHealth,
    capabilityFit: input.capabilityFitByProfileId?.[profile.id] ?? 1,
    available,
    reasons,
  };
}

export function buildIdentityPool(
  input: BuildIdentityPoolInput,
): IdentityPoolSnapshot {
  const statuses = mapStatuses(input.statuses ?? []);
  const providerCooldowns = mapProviderCooldowns(input.providerCooldowns ?? []);
  const candidates = input.profiles
    .map((profile) => buildCandidate(profile, input, statuses, providerCooldowns))
    .sort((left, right) => {
      if (left.available !== right.available) {
        return left.available ? -1 : 1;
      }
      if (left.capabilityFit !== right.capabilityFit) {
        return right.capabilityFit - left.capabilityFit;
      }
      if (left.currentCapacity !== right.currentCapacity) {
        return right.currentCapacity - left.currentCapacity;
      }
      return left.profile.id.localeCompare(right.profile.id);
    });

  return {
    evaluatedAt: input.now ?? new Date().toISOString(),
    candidates,
  };
}
