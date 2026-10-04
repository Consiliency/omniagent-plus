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
    byProvider[status.provider] = normalizeCount(normalizeCount(byProvider[status.provider]) + activeTurns);
    totalActiveTurns = normalizeCount(totalActiveTurns + activeTurns);
  }

  return {
    totalActiveTurns,
    byProfileId,
    byProvider,
    bySessionId: Object.create(null),
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
  const byProfileId = Object.assign(Object.create(null), snapshot.byProfileId) as Record<string, number>;
  const byProvider = Object.assign(Object.create(null), snapshot.byProvider) as Partial<Record<ProviderFamilyId, number>>;
  const bySessionId = Object.assign(Object.create(null), snapshot.bySessionId) as Record<string, number>;
  byProfileId[options.profileId] = normalizeCount(normalizeCount(byProfileId[options.profileId]) + delta);
  byProvider[options.provider] = normalizeCount(normalizeCount(byProvider[options.provider]) + delta);
  if (options.sessionId !== undefined) bySessionId[options.sessionId] = normalizeCount(normalizeCount(bySessionId[options.sessionId]) + delta);

  return {
    totalActiveTurns: normalizeCount(normalizeCount(snapshot.totalActiveTurns) + delta),
    byProfileId,
    byProvider,
    bySessionId,
  };
}

export function decrementActiveTurns(snapshot: ActiveTurnSnapshot, options: Parameters<typeof incrementActiveTurns>[1]): ActiveTurnSnapshot {
  const delta = normalizeCount(options.delta ?? 1);
  const byProfileId = Object.assign(Object.create(null), snapshot.byProfileId) as Record<string, number>;
  const byProvider = Object.assign(Object.create(null), snapshot.byProvider) as Partial<Record<ProviderFamilyId, number>>;
  const bySessionId = Object.assign(Object.create(null), snapshot.bySessionId) as Record<string, number>;
  const profile = normalizeCount(byProfileId[options.profileId]);
  const provider = normalizeCount(byProvider[options.provider]);
  const session = options.sessionId === undefined ? undefined : normalizeCount(bySessionId[options.sessionId]);
  const total = normalizeCount(snapshot.totalActiveTurns);
  if (profile < delta || provider < delta || total < delta || (session !== undefined && session < delta)) throw new TypeError("Active turn settlement exceeds owned counts");
  byProfileId[options.profileId] = profile - delta;
  byProvider[options.provider] = provider - delta;
  if (options.sessionId !== undefined) bySessionId[options.sessionId] = session! - delta;
  return {
    totalActiveTurns: total - delta,
    byProfileId,
    byProvider,
    bySessionId,
  };
}

export class ActiveTurnAccounting {
  private current: ActiveTurnSnapshot;
  private readonly turns = new Map<string, { options: Parameters<typeof incrementActiveTurns>[1]; settled: boolean }>();
  constructor(snapshot: ActiveTurnSnapshot = createEmptyActiveTurnSnapshot()) { this.current = snapshot; }
  get snapshot(): ActiveTurnSnapshot { return this.current; }
  begin(turnId: string, options: Parameters<typeof incrementActiveTurns>[1]): ActiveTurnSnapshot {
    const key = JSON.stringify([options.sessionId ?? null, turnId]);
    if (turnId.length === 0 || this.turns.has(key)) throw new TypeError("Turn accounting identity must be new");
    const owned = { ...options, delta: 1 };
    this.current = incrementActiveTurns(this.current, owned);
    this.turns.set(key, { options: owned, settled: false });
    return this.current;
  }
  settle(turnId: string, sessionId?: string): ActiveTurnSnapshot {
    const turn = this.turns.get(JSON.stringify([sessionId ?? null, turnId]));
    if (turn === undefined) throw new TypeError("Turn accounting identity is not owned");
    if (!turn.settled) { this.current = decrementActiveTurns(this.current, turn.options); turn.settled = true; }
    return this.current;
  }
}
