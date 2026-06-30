import type {
  LimitClassification,
  RouteDecision,
} from "@omniagent-plus/core-contracts";

import { scoreTaskPortability } from "./portability.js";
import type {
  IdentityPoolMember,
  LaunchGateAction,
  PlannedRoute,
  PortabilityScore,
  RoutePlannerInput,
} from "./types.js";

function buildPortability(input: RoutePlannerInput): PortabilityScore {
  return input.portability ?? scoreTaskPortability(input.portabilityInput ?? {});
}

function findPreferredCandidate(input: RoutePlannerInput): IdentityPoolMember | undefined {
  if (input.preferredIdentityProfileId) {
    return input.identityPool.candidates.find(
      (candidate) => candidate.profile.id === input.preferredIdentityProfileId,
    );
  }

  return input.identityPool.candidates.find((candidate) => {
    if (
      input.preferredProvider
      && candidate.profile.provider !== input.preferredProvider
    ) {
      return false;
    }
    if (
      input.preferredHarness
      && candidate.profile.harness !== input.preferredHarness
    ) {
      return false;
    }
    return true;
  });
}

function sameProviderSwitchAllowed(
  candidate: IdentityPoolMember,
  preferredCandidate: IdentityPoolMember | undefined,
  classification: LimitClassification | undefined,
  manualConfirmationProvided: boolean,
): boolean {
  if (
    preferredCandidate === undefined
    || candidate.profile.provider !== preferredCandidate.profile.provider
    || candidate.profile.id === preferredCandidate.profile.id
  ) {
    return true;
  }

  const sameProviderAccountSwitch =
    classification?.routingAction.sameProviderAccountSwitch
    ?? candidate.cooldownState.sameProviderAccountSwitch;

  if (sameProviderAccountSwitch === "allowed_by_policy") {
    return true;
  }

  if (sameProviderAccountSwitch === "manual_confirmation_required") {
    return manualConfirmationProvided;
  }

  return false;
}

function pickFallbackCandidate(
  input: RoutePlannerInput,
  preferredCandidate: IdentityPoolMember | undefined,
  portability: PortabilityScore,
): IdentityPoolMember | undefined {
  if (
    !portability.migrateAcrossProviders
    || input.latestClassification?.routingAction.routeNewWorkElsewhere !== true
  ) {
    return undefined;
  }

  for (const candidate of input.identityPool.candidates) {
    if (!candidate.available) {
      continue;
    }
    if (
      !sameProviderSwitchAllowed(
        candidate,
        preferredCandidate,
        input.latestClassification,
        input.manualConfirmationProvided ?? false,
      )
    ) {
      continue;
    }
    if (
      preferredCandidate !== undefined
      && candidate.profile.provider === preferredCandidate.profile.provider
      && candidate.profile.id !== preferredCandidate.profile.id
    ) {
      continue;
    }
    return candidate;
  }

  for (const candidate of input.identityPool.candidates) {
    if (!candidate.available) {
      continue;
    }
    if (
      sameProviderSwitchAllowed(
        candidate,
        preferredCandidate,
        input.latestClassification,
        input.manualConfirmationProvided ?? false,
      )
    ) {
      return candidate;
    }
  }

  return undefined;
}

function determineLaunchGate(
  candidate: IdentityPoolMember,
  preferredCandidate: IdentityPoolMember | undefined,
  fallbackUsed: boolean,
  input: RoutePlannerInput,
): { action: LaunchGateAction; reason: string } {
  if (!candidate.available) {
    if (
      preferredCandidate !== undefined
      && candidate.profile.provider === preferredCandidate.profile.provider
      && candidate.profile.id !== preferredCandidate.profile.id
      && candidate.cooldownState.sameProviderAccountSwitch
        === "manual_confirmation_required"
      && !input.manualConfirmationProvided
    ) {
      return {
        action: "manual_confirmation_required",
        reason:
          "provider-family cooldown requires manual confirmation before same-provider account switching",
      };
    }

    if (candidate.cooldownState.blocked) {
      return {
        action: "wait_for_reset",
        reason: candidate.cooldownState.reason ?? "provider cooldown blocks launch",
      };
    }

    return {
      action: "blocked",
      reason: candidate.reasons[0] ?? "no launchable candidate is available",
    };
  }

  if (
    fallbackUsed
    && preferredCandidate !== undefined
    && candidate.profile.provider === preferredCandidate.profile.provider
    && candidate.profile.id !== preferredCandidate.profile.id
    && candidate.cooldownState.sameProviderAccountSwitch
      === "manual_confirmation_required"
    && !input.manualConfirmationProvided
  ) {
    return {
      action: "manual_confirmation_required",
      reason:
        "same-provider account switching requires manual confirmation for this cooldown class",
    };
  }

  return {
    action: "allowed",
    reason: "route decision is persisted before launch",
  };
}

function determineRouteReason(
  input: RoutePlannerInput,
  fallbackUsed: boolean,
  preferredCandidate: IdentityPoolMember | undefined,
  candidate: IdentityPoolMember,
): RouteDecision["routeReason"] {
  if (input.preferredIdentityProfileId && !fallbackUsed) {
    return "explicit_override";
  }
  if (input.latestClassification?.type === "fixed_window_usage_cap") {
    return "usage_cap";
  }
  if (input.latestClassification?.type === "monthly_spend_or_quota_cap") {
    return "usage_cap";
  }
  if (candidate.cooldownState.providerFamilyBlocked) {
    return "provider_cooldown";
  }
  if (
    input.latestClassification?.type === "overload_or_transient"
    || input.latestClassification?.type === "acceleration_limit"
    || input.latestClassification?.type === "unknown_limit"
  ) {
    return "transient_failure";
  }
  if (fallbackUsed && preferredCandidate !== undefined) {
    return "load_balance";
  }
  return "capability_fit";
}

function determineFallbackReason(
  preferredCandidate: IdentityPoolMember | undefined,
  candidate: IdentityPoolMember,
  classification: LimitClassification | undefined,
): string | undefined {
  if (
    preferredCandidate === undefined
    || (
      candidate.profile.id === preferredCandidate.profile.id
      && candidate.profile.provider === preferredCandidate.profile.provider
    )
  ) {
    return undefined;
  }

  return (
    preferredCandidate.cooldownState.reason
    ?? classification?.type
    ?? "preferred target had lower capacity"
  );
}

function buildDecision(
  input: RoutePlannerInput,
  candidate: IdentityPoolMember,
  preferredCandidate: IdentityPoolMember | undefined,
  portability: PortabilityScore,
  fallbackUsed: boolean,
): RouteDecision {
  const launchGate = determineLaunchGate(
    candidate,
    preferredCandidate,
    fallbackUsed,
    input,
  );

  return {
    schema: "route_decision.v0.1",
    taskId: input.taskId,
    selectedProvider: candidate.profile.provider,
    selectedHarness: candidate.profile.harness,
    selectedIdentityProfileId: candidate.profile.id,
    preferredProvider: input.preferredProvider,
    preferredHarness: input.preferredHarness,
    preferredTarget:
      input.preferredProvider || input.preferredHarness || input.preferredIdentityProfileId
        ? {
            provider: input.preferredProvider,
            harness: input.preferredHarness,
            identityProfileId: input.preferredIdentityProfileId,
          }
        : undefined,
    fallbackUsed,
    fallbackReason: determineFallbackReason(
      preferredCandidate,
      candidate,
      input.latestClassification,
    ),
    capabilityFit:
      input.capabilityFitByProfileId?.[candidate.profile.id]
      ?? candidate.capabilityFit,
    providerHealth:
      input.providerHealth?.[candidate.profile.provider]
      ?? candidate.providerHealth,
    currentCapacity: candidate.currentCapacity,
    contextPortability: portability.level,
    portabilityScore: portability.score,
    activeTurnTarget: candidate.targetActiveTurns,
    cooldownState: candidate.cooldownState,
    launchGate: {
      action: launchGate.action,
      reason: launchGate.reason,
      routeDecisionPersisted: false,
      labelsMatch: true,
      manualConfirmationProvided: input.manualConfirmationProvided ?? false,
    },
    routeReason: determineRouteReason(
      input,
      fallbackUsed,
      preferredCandidate,
      candidate,
    ),
    silentDowngrade: false,
    evidenceRefs:
      input.evidenceRefs === undefined || input.evidenceRefs.length === 0
        ? undefined
        : [...input.evidenceRefs],
  };
}

export function planRoute(input: RoutePlannerInput): PlannedRoute {
  const firstCandidate = input.identityPool.candidates[0];
  if (firstCandidate === undefined) {
    throw new Error("identityPool must contain at least one candidate");
  }

  const portability = buildPortability(input);
  const preferredCandidate = findPreferredCandidate(input) ?? firstCandidate;
  const fallbackCandidate = pickFallbackCandidate(
    input,
    preferredCandidate,
    portability,
  );
  const selectedCandidate =
    preferredCandidate?.available === true
      ? preferredCandidate
      : fallbackCandidate ?? preferredCandidate;
  const fallbackUsed =
    preferredCandidate !== undefined
    && selectedCandidate.profile.id !== preferredCandidate.profile.id;

  return {
    candidate: selectedCandidate,
    portability,
    decision: buildDecision(
      input,
      selectedCandidate,
      preferredCandidate,
      portability,
      fallbackUsed,
    ),
  };
}
