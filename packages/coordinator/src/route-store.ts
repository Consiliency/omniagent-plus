import {
  routeDecisionSchema,
  sanitizeMetadataPath,
  sanitizeMetadataText,
  type RouteDecision,
  type RuntimeEvidenceRef,
} from "@omniagent-plus/core-contracts";

import type { RouteStoreReader, RouteStoreWriter } from "./types.js";

function sanitizeEvidenceRefs(
  evidenceRefs: readonly RuntimeEvidenceRef[] | undefined,
): RuntimeEvidenceRef[] | undefined {
  if (evidenceRefs === undefined) {
    return undefined;
  }

  return evidenceRefs.map((ref) => ({
    ...ref,
    label: sanitizeMetadataText(ref.label, "route decision evidence label"),
    path:
      ref.path === undefined ? undefined : sanitizeMetadataPath(ref.path),
    excerpt:
      ref.excerpt === undefined
        ? undefined
        : sanitizeMetadataText(ref.excerpt, "route decision evidence excerpt"),
  }));
}

export async function persistRouteDecision(
  routeStore: RouteStoreWriter,
  decision: RouteDecision,
): Promise<RouteDecision> {
  const persistedDecision = routeDecisionSchema.parse({
    ...decision,
    evidenceRefs: sanitizeEvidenceRefs(decision.evidenceRefs),
    launchGate: {
      action: decision.launchGate?.action ?? "allowed",
      reason:
        decision.launchGate?.reason ?? "route decision is persisted before launch",
      routeDecisionPersisted: true,
      labelsMatch: decision.launchGate?.labelsMatch ?? true,
      manualConfirmationProvided:
        decision.launchGate?.manualConfirmationProvided ?? false,
    },
  });

  await routeStore.appendRouteDecision(persistedDecision);
  return persistedDecision;
}

export async function listPersistedRouteDecisions(
  routeStore: RouteStoreReader,
  taskId: string,
): Promise<RouteDecision[]> {
  const records = await routeStore.listTaskRecords(taskId);
  return records
    .filter((record) => record.kind === "route_decision")
    .map((record) => routeDecisionSchema.parse(record.payload));
}
