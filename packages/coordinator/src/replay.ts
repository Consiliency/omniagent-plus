import { routeDecisionSchema, type LimitClassification, type RouteDecision } from "@omniagent-plus/core-contracts";

import type { RouteReplayEntry, RouteStoreReader } from "./types.js";

export function explainRouteDecision(
  decision: RouteDecision,
  limitClassification?: LimitClassification,
): string {
  const fragments = [
    `selected provider ${decision.selectedProvider}`,
    `selected harness ${decision.selectedHarness}`,
  ];

  if (decision.selectedIdentityProfileId) {
    fragments.push(`selected identity ${decision.selectedIdentityProfileId}`);
  }
  if (decision.fallbackUsed) {
    fragments.push(`fallback reason ${decision.fallbackReason ?? "unspecified"}`);
  }
  if (decision.portabilityScore !== undefined) {
    fragments.push(`portability score ${decision.portabilityScore.toFixed(2)}`);
  }
  if (decision.activeTurnTarget !== undefined) {
    fragments.push(`active-turn target ${decision.activeTurnTarget}`);
  }
  if (decision.cooldownState?.reason) {
    fragments.push(`cooldown ${decision.cooldownState.reason}`);
  }
  if (limitClassification?.type) {
    fragments.push(`limit evidence ${limitClassification.type}`);
  }
  if ((decision.evidenceRefs?.length ?? 0) > 0) {
    fragments.push(
      `evidence refs ${decision.evidenceRefs?.map((ref) => ref.label).join(", ")}`,
    );
  }

  return fragments.join("; ");
}

function formatPreferredTarget(decision: RouteDecision): string | undefined {
  const parts = [
    decision.preferredTarget?.provider,
    decision.preferredTarget?.harness,
    decision.preferredTarget?.identityProfileId,
  ].filter((part): part is string => part !== undefined);

  return parts.length === 0 ? undefined : parts.join(" / ");
}

export async function replayTaskRouting(
  routeStore: RouteStoreReader,
  taskId: string,
): Promise<RouteReplayEntry[]> {
  const records = await routeStore.listTaskRecords(taskId);
  const decisions = records
    .filter((record) => record.kind === "route_decision")
    .map((record) => routeDecisionSchema.parse(record.payload));
  const latestClassification = records
    .filter(
      (record): record is { kind: "limit_classification"; payload: LimitClassification } =>
        record.kind === "limit_classification",
    )
    .at(-1)?.payload;

  return decisions.map((decision) => ({
    taskId: decision.taskId,
    selectedProvider: decision.selectedProvider,
    selectedHarness: decision.selectedHarness,
    selectedIdentityProfileId: decision.selectedIdentityProfileId,
    preferredTarget: formatPreferredTarget(decision),
    fallbackReason: decision.fallbackReason,
    portabilityScore: decision.portabilityScore,
    activeTurnTarget: decision.activeTurnTarget,
    cooldownState: decision.cooldownState,
    evidenceRefs: decision.evidenceRefs ?? [],
    explanation: explainRouteDecision(decision, latestClassification),
  }));
}
