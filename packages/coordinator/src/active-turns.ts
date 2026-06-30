import type { ProviderFamilyId } from "@omniagent-plus/core-contracts";
import type { IdentityProfileStatus } from "@omniagent-plus/core-contracts";

import type { ActiveTurnSnapshot } from "./types.js";

function normalizeCount(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.trunc(value ?? 0));
}

export function createEmptyActiveTurnSnapshot(): ActiveTurnSnapshot {
  return {
    totalActiveTurns: 0,
    byProfileId: {},
    byProvider: {},
    bySessionId: {},
  };
}

export function buildActiveTurnSnapshot(
  statuses: readonly IdentityProfileStatus[],
): ActiveTurnSnapshot {
  const byProfileId: Record<string, number> = {};
  const byProvider: Partial<Record<ProviderFamilyId, number>> = {};
  let totalActiveTurns = 0;

  for (const status of statuses) {
    const activeTurns = normalizeCount(status.activeTurns);
    byProfileId[status.profileId] = activeTurns;
    byProvider[status.provider] = normalizeCount(byProvider[status.provider]) + activeTurns;
    totalActiveTurns += activeTurns;
  }

  return {
    totalActiveTurns,
    byProfileId,
    byProvider,
    bySessionId: {},
  };
}

export function incrementActiveTurns(
  snapshot: ActiveTurnSnapshot,
  options: {
    readonly profileId: string;
    readonly provider: ProviderFamilyId;
    readonly sessionId?: string;
    readonly delta?: number;
  },
): ActiveTurnSnapshot {
  const delta = normalizeCount(options.delta ?? 1);
  const byProfileId = {
    ...snapshot.byProfileId,
    [options.profileId]: normalizeCount(snapshot.byProfileId[options.profileId]) + delta,
  };
  const byProvider = {
    ...snapshot.byProvider,
    [options.provider]: normalizeCount(snapshot.byProvider[options.provider]) + delta,
  };
  const bySessionId =
    options.sessionId === undefined
      ? { ...snapshot.bySessionId }
      : {
          ...snapshot.bySessionId,
          [options.sessionId]:
            normalizeCount(snapshot.bySessionId[options.sessionId]) + delta,
        };

  return {
    totalActiveTurns: snapshot.totalActiveTurns + delta,
    byProfileId,
    byProvider,
    bySessionId,
  };
}
