import type { ProviderFamilyId } from "@consiliency/runtime-provider";
import type { IdentityProfileStatus } from "@consiliency/runtime-provider";

import type { ActiveTurnSnapshot } from "./types.js";

function normalizeCount(value: number | undefined): number {
  if (value === undefined) return 0;
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError("Active turn counts must be nonnegative safe integers");
  return value;
}

export function createEmptyActiveTurnSnapshot(): ActiveTurnSnapshot {
  return {
    totalActiveTurns: 0,
    byProfileId: Object.create(null),
    byProvider: Object.create(null),
    bySessionId: Object.create(null),
  };
}

export function buildActiveTurnSnapshot(
  statuses: readonly IdentityProfileStatus[],
): ActiveTurnSnapshot {
  const byProfileId: Record<string, number> = Object.create(null);
  const byProvider: Partial<Record<ProviderFamilyId, number>> = Object.create(null);
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
    totalActiveTurns: normalizeCount(snapshot.totalActiveTurns + delta),
    byProfileId,
    byProvider,
    bySessionId,
  };
}

export function decrementActiveTurns(snapshot: ActiveTurnSnapshot, options: Parameters<typeof incrementActiveTurns>[1]): ActiveTurnSnapshot {
  const delta = normalizeCount(options.delta ?? 1);
  const profile = normalizeCount(snapshot.byProfileId[options.profileId]);
  const provider = normalizeCount(snapshot.byProvider[options.provider]);
  const session = options.sessionId === undefined ? undefined : normalizeCount(snapshot.bySessionId[options.sessionId]);
  if (profile < delta || provider < delta || snapshot.totalActiveTurns < delta || (session !== undefined && session < delta)) throw new TypeError("Active turn settlement exceeds owned counts");
  return {
    totalActiveTurns: snapshot.totalActiveTurns - delta,
    byProfileId: { ...snapshot.byProfileId, [options.profileId]: profile - delta },
    byProvider: { ...snapshot.byProvider, [options.provider]: provider - delta },
    bySessionId: options.sessionId === undefined ? { ...snapshot.bySessionId } : { ...snapshot.bySessionId, [options.sessionId]: session! - delta },
  };
}

export class ActiveTurnAccounting {
  private current: ActiveTurnSnapshot;
  private readonly turns = new Map<string, { options: Parameters<typeof incrementActiveTurns>[1]; settled: boolean }>();
  constructor(snapshot: ActiveTurnSnapshot = createEmptyActiveTurnSnapshot()) { this.current = snapshot; }
  get snapshot(): ActiveTurnSnapshot { return this.current; }
  begin(turnId: string, options: Parameters<typeof incrementActiveTurns>[1]): ActiveTurnSnapshot {
    if (turnId.length === 0 || this.turns.has(turnId)) throw new TypeError("Turn accounting identity must be new");
    const owned = { ...options, delta: 1 };
    this.current = incrementActiveTurns(this.current, owned);
    this.turns.set(turnId, { options: owned, settled: false });
    return this.current;
  }
  settle(turnId: string): ActiveTurnSnapshot {
    const turn = this.turns.get(turnId);
    if (turn === undefined) throw new TypeError("Turn accounting identity is not owned");
    if (!turn.settled) { this.current = decrementActiveTurns(this.current, turn.options); turn.settled = true; }
    return this.current;
  }
}
