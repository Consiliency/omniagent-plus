import { limitClassificationSchema, routeDecisionSchema, type LimitClassification, type RouteDecision } from "@consiliency/runtime-provider";

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
  const classifications: LimitClassification[] = [];
  const result: RouteReplayEntry[] = [];
  for (const record of records) {
    if (record.kind === "limit_classification") classifications.push(limitClassificationSchema.parse(record.payload));
    if (record.kind !== "route_decision") continue;
    const decision = routeDecisionSchema.parse(record.payload);
    if (decision.taskId !== taskId) throw new TypeError("Route replay task mismatch");
    const provider = decision.preferredTarget?.provider ?? decision.preferredProvider ?? decision.selectedProvider;
    const harness = decision.preferredTarget?.harness ?? decision.preferredHarness ?? decision.selectedHarness;
    const identity = decision.preferredTarget?.identityProfileId ?? decision.selectedIdentityProfileId;
    const latestClassification = [...classifications].reverse().find((classification) => classification.provider === provider && classification.harness === harness
      && (classification.identityProfileId === undefined || classification.identityProfileId === identity) && classification.sessionId === undefined);
    result.push({
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
    });
  }
  return result;
}
