import {
  createRuntimeFailure,
  createSessionRequestSchema,
  sendTurnRequestSchema,
  routeDecisionSchema,
  providerFamilyIds,
  harnessIds,
  type AgentSession,
  type CreateSessionRequest,
  type RouteDecision,
  type SendTurnRequest,
  type TurnHandle,
} from "@consiliency/runtime-provider";

import { persistRouteDecision } from "./route-store.js";
import type { GuardedRequest, LaunchGateInput } from "./types.js";

function assertLaunchDecision(decision: RouteDecision): void {
  const action = decision.launchGate?.action ?? "allowed";

  if (action === "allowed") {
    return;
  }

  if (action === "manual_confirmation_required") {
    throw createRuntimeFailure({
      actor: "policy",
      category: "approval_required",
      message: decision.launchGate?.reason ?? "manual confirmation is required",
      retryable: false,
      scope: "turn",
    });
  }

  if (action === "wait_for_reset") {
    throw createRuntimeFailure({
      actor: "provider",
      category: "rate_limit",
      message: decision.launchGate?.reason ?? "cooldown blocks launch",
      retryable: false,
      scope:
        decision.cooldownState?.providerFamilyBlocked === true
          ? "provider_family"
          : "identity_profile",
    });
  }

  throw createRuntimeFailure({
    actor: "policy",
    category: "state_conflict",
    message: decision.launchGate?.reason ?? "launch gate blocked execution",
    retryable: false,
    scope: "turn",
  });
}

function assertCreateSessionLabels(
  decision: RouteDecision,
  request: LaunchGateInput<GuardedRequest>["request"],
): void {
  if (!("targetHarness" in request)) {
    return;
  }

  if (decision.selectedHarness !== request.targetHarness) {
    throw createRuntimeFailure({
      actor: "policy",
      category: "state_conflict",
      message:
        "Launch gate blocked a silent harness downgrade before provider launch.",
      retryable: false,
      scope: "turn",
    });
  }

  if (
    request.targetProvider !== undefined
    && decision.selectedProvider !== request.targetProvider
  ) {
    throw createRuntimeFailure({
      actor: "policy",
      category: "state_conflict",
      message:
        "Launch gate blocked a silent provider downgrade before provider launch.",
      retryable: false,
      scope: "turn",
    });
  }

  if (
    request.identityProfileId !== undefined
    && decision.selectedIdentityProfileId !== request.identityProfileId
  ) {
    throw createRuntimeFailure({
      actor: "policy",
      category: "state_conflict",
      message:
        "Launch gate blocked a silent identity downgrade before provider launch.",
      retryable: false,
      scope: "turn",
    });
  }
}

export async function createSessionWithRouteDecision(
  input: LaunchGateInput<CreateSessionRequest>,
): Promise<AgentSession> {
  const { provider, routeStore } = input;
  const request = createSessionRequestSchema.parse(input.request);
  const decision = routeDecisionSchema.parse(input.decision);
  assertCreateSessionLabels(decision, request);
  assertLaunchDecision(decision);
  await persistRouteDecision(routeStore, decision);
  return provider.createSession(request);
}

export async function sendTurnWithRouteDecision(
  input: LaunchGateInput<SendTurnRequest>,
): Promise<TurnHandle> {
  const { provider, routeStore } = input;
  const request = sendTurnRequestSchema.parse(input.request);
  const decision = routeDecisionSchema.parse(input.decision);
  assertLaunchDecision(decision);
  const session = await provider.getSessionInfo(request.sessionId);
  if (session.id !== request.sessionId
    || !harnessIds.includes(session.targetHarness)
    || session.targetProvider === undefined || !providerFamilyIds.includes(session.targetProvider)
    || session.targetHarness !== decision.selectedHarness
    || session.targetProvider !== decision.selectedProvider
    || session.identityProfileId !== decision.selectedIdentityProfileId) {
    throw createRuntimeFailure({ actor: "policy", category: "state_conflict", message: "Established session does not match the route target", retryable: false, scope: "turn" });
  }
  await persistRouteDecision(routeStore, decision);
  return provider.sendTurn(request);
}
