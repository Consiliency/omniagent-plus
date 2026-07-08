import { randomUUID } from "node:crypto";
import { join } from "node:path";
import {
  consiliencyLeaseSchema,
  isLeaseExpired,
  toContractTimestamp,
  type ConsiliencyLease,
  type ConsiliencyLeaseScope,
} from "@omniagent-plus/core-contracts";
import {
  getStateLedgerPaths,
  nowIsoString,
  readJsonFile,
  withFilesystemLock,
  writeJsonAtomic,
} from "@omniagent-plus/state-ledger";

import { WorktreeLeasingError } from "./types.js";

export type LeaseStoreFailure =
  | "conflict"
  | "not-holder"
  | "not-found"
  | "expired"
  | "backend-unavailable";

export interface LeaseAcquireRequest {
  readonly leaseId?: string;
  readonly holder: string;
  readonly ttlSeconds: number;
  readonly mode: "soft" | "hard";
  readonly scope: ConsiliencyLeaseScope;
  readonly phase: string;
  readonly now?: string;
}

export interface LeaseAcquireResult {
  readonly granted: boolean;
  readonly lease?: ConsiliencyLease;
  readonly conflict?: ConsiliencyLease;
  readonly failure?: LeaseStoreFailure;
}

export interface LeaseRenewResult {
  readonly renewed: boolean;
  readonly lease?: ConsiliencyLease;
  readonly failure?: LeaseStoreFailure;
}

export interface LeaseReleaseResult {
  readonly released: boolean;
  readonly failure?: LeaseStoreFailure;
}

export interface LeaseQuery {
  readonly leaseId?: string;
  readonly scope?: ConsiliencyLeaseScope;
  readonly includeExpired?: boolean;
  readonly now?: string;
}

export interface LeaseSnapshot {
  readonly leases: readonly ConsiliencyLease[];
}

export interface LeaseStore {
  acquire(request: LeaseAcquireRequest): Promise<LeaseAcquireResult>;
  renew(
    leaseId: string,
    holder: string,
    options?: { readonly ttlSeconds?: number; readonly now?: string },
  ): Promise<LeaseRenewResult>;
  release(
    leaseId: string,
    holder: string,
    options?: { readonly now?: string },
  ): Promise<LeaseReleaseResult>;
  query(query?: LeaseQuery): Promise<LeaseSnapshot>;
  expire?(now?: string): Promise<number>;
}

interface LeaseEvent {
  readonly eventId: string;
  readonly eventType: "acquire" | "renew" | "release" | "expire";
  readonly leaseId: string;
  readonly holder: string;
  readonly lease?: ConsiliencyLease;
  readonly recordedAt: string;
  readonly reason?: string;
}

interface LocalLeaseStoreState {
  readonly schema: "consiliency.local_lease_store.v0.1";
  readonly updatedAt: string;
  readonly leases: Record<string, ConsiliencyLease>;
  readonly events: LeaseEvent[];
}

function emptyState(now: string): LocalLeaseStoreState {
  return {
    schema: "consiliency.local_lease_store.v0.1",
    updatedAt: now,
    leases: {},
    events: [],
  };
}

function normalizeSelector(selector: readonly string[]): string[] {
  return [...new Set(selector.map((entry) => entry.replace(/\/+$/u, "")))]
    .filter((entry) => entry.length > 0)
    .sort();
}

export function normalizeLeaseScope(scope: ConsiliencyLeaseScope): ConsiliencyLeaseScope {
  return {
    granularity: scope.granularity,
    selector: normalizeSelector(scope.selector),
  };
}

function pathOverlaps(left: string, right: string): boolean {
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}

export function leaseScopesOverlap(
  left: ConsiliencyLeaseScope,
  right: ConsiliencyLeaseScope,
): boolean {
  const normalizedLeft = normalizeLeaseScope(left);
  const normalizedRight = normalizeLeaseScope(right);

  if (normalizedLeft.granularity === "repo" || normalizedRight.granularity === "repo") {
    return true;
  }
  if (normalizedLeft.granularity !== normalizedRight.granularity) {
    return false;
  }
  if (normalizedLeft.granularity === "symbol") {
    return normalizedLeft.selector.some((selector) => normalizedRight.selector.includes(selector));
  }

  return normalizedLeft.selector.some((leftSelector) =>
    normalizedRight.selector.some((rightSelector) => pathOverlaps(leftSelector, rightSelector)),
  );
}

export function createLeaseFromAcquireRequest(
  request: LeaseAcquireRequest,
): ConsiliencyLease {
  const now = toContractTimestamp(request.now ?? nowIsoString());
  return consiliencyLeaseSchema.parse({
    schema: "consiliency.lease.v1",
    lease_id: request.leaseId ?? `lease:${randomUUID()}`,
    holder: request.holder,
    acquired_at: now,
    ttl_seconds: request.ttlSeconds,
    heartbeat_at: now,
    mode: request.mode,
    scope: normalizeLeaseScope(request.scope),
    phase: request.phase,
  });
}

export class LocalLeaseStore implements LeaseStore {
  private readonly statePath: string;

  private readonly lockPath: string;

  constructor(options: { readonly rootDir: string }) {
    const paths = getStateLedgerPaths(options.rootDir);
    this.statePath = `${paths.coordinationDir}/consiliency-leases.json`;
    this.lockPath = join(paths.locksDir, "coordination.lock");
  }

  async acquire(request: LeaseAcquireRequest): Promise<LeaseAcquireResult> {
    return this.withLeaseLock(async () => {
      const now = toContractTimestamp(request.now ?? nowIsoString());
      const state = await this.readState(now);
      this.expireState(state, now);
      const lease = createLeaseFromAcquireRequest({ ...request, now });
      const existingLeaseId = state.leases[lease.lease_id];
      if (existingLeaseId !== undefined) {
        await this.writeState(state, now);
        return {
          granted: false,
          conflict: existingLeaseId,
          failure: "conflict",
        };
      }
      const conflict = Object.values(state.leases).find(
        (existing) =>
          existing.mode === "hard"
          && lease.mode === "hard"
          && leaseScopesOverlap(existing.scope, lease.scope),
      );

      if (conflict !== undefined) {
        await this.writeState(state, now);
        return {
          granted: false,
          conflict,
          failure: "conflict",
        };
      }

      state.leases[lease.lease_id] = lease;
      state.events.push({
        eventId: randomUUID(),
        eventType: "acquire",
        leaseId: lease.lease_id,
        holder: lease.holder,
        lease,
        recordedAt: now,
      });
      await this.writeState(state, now);
      return {
        granted: true,
        lease,
      };
    });
  }

  async renew(
    leaseId: string,
    holder: string,
    options: { readonly ttlSeconds?: number; readonly now?: string } = {},
  ): Promise<LeaseRenewResult> {
    return this.withLeaseLock(async () => {
      const now = toContractTimestamp(options.now ?? nowIsoString());
      const state = await this.readState(now);
      this.expireState(state, now);
      const existing = state.leases[leaseId];

      if (existing === undefined) {
        await this.writeState(state, now);
        return { renewed: false, failure: "not-found" };
      }
      if (existing.holder !== holder) {
        return { renewed: false, failure: "not-holder" };
      }
      if (isLeaseExpired(existing, now)) {
        delete state.leases[leaseId];
        await this.writeState(state, now);
        return { renewed: false, failure: "expired" };
      }

      const lease = consiliencyLeaseSchema.parse({
        ...existing,
        ttl_seconds: options.ttlSeconds ?? existing.ttl_seconds,
        heartbeat_at: now,
      });
      state.leases[leaseId] = lease;
      state.events.push({
        eventId: randomUUID(),
        eventType: "renew",
        leaseId,
        holder,
        lease,
        recordedAt: now,
      });
      await this.writeState(state, now);
      return { renewed: true, lease };
    });
  }

  async release(
    leaseId: string,
    holder: string,
    options: { readonly now?: string } = {},
  ): Promise<LeaseReleaseResult> {
    return this.withLeaseLock(async () => {
      const now = toContractTimestamp(options.now ?? nowIsoString());
      const state = await this.readState(now);
      this.expireState(state, now);
      const existing = state.leases[leaseId];

      if (existing === undefined) {
        await this.writeState(state, now);
        return { released: true, failure: "not-found" };
      }
      if (existing.holder !== holder) {
        return { released: false, failure: "not-holder" };
      }

      delete state.leases[leaseId];
      state.events.push({
        eventId: randomUUID(),
        eventType: "release",
        leaseId,
        holder,
        lease: existing,
        recordedAt: now,
      });
      await this.writeState(state, now);
      return { released: true };
    });
  }

  async query(query: LeaseQuery = {}): Promise<LeaseSnapshot> {
    return this.withLeaseLock(async () => {
      const now = toContractTimestamp(query.now ?? nowIsoString());
      const state = await this.readState(now);
      const leases = Object.values(state.leases)
        .filter((lease) => query.includeExpired === true || !isLeaseExpired(lease, now))
        .filter((lease) => query.leaseId === undefined || lease.lease_id === query.leaseId)
        .filter((lease) => query.scope === undefined || leaseScopesOverlap(lease.scope, query.scope))
        .sort((left, right) => left.lease_id.localeCompare(right.lease_id));
      return { leases };
    });
  }

  async expire(nowValue = nowIsoString()): Promise<number> {
    return this.withLeaseLock(async () => {
      const now = toContractTimestamp(nowValue);
      const state = await this.readState(now);
      const expired = this.expireState(state, now);
      await this.writeState(state, now);
      return expired;
    });
  }

  private async withLeaseLock<T>(callback: () => Promise<T>): Promise<T> {
    return withFilesystemLock(this.lockPath, callback);
  }

  private async readState(now: string): Promise<LocalLeaseStoreState> {
    const existing = await readJsonFile<LocalLeaseStoreState>(this.statePath);
    if (existing?.schema === "consiliency.local_lease_store.v0.1") {
      return {
        ...existing,
        leases: { ...existing.leases },
        events: [...existing.events],
      };
    }
    return emptyState(now);
  }

  private async writeState(state: LocalLeaseStoreState, now: string): Promise<void> {
    await writeJsonAtomic(this.statePath, {
      ...state,
      updatedAt: now,
    });
  }

  private expireState(state: LocalLeaseStoreState, now: string): number {
    let expired = 0;
    for (const [leaseId, lease] of Object.entries(state.leases)) {
      if (isLeaseExpired(lease, now)) {
        delete state.leases[leaseId];
        state.events.push({
          eventId: randomUUID(),
          eventType: "expire",
          leaseId,
          holder: lease.holder,
          lease,
          recordedAt: now,
          reason: "ttl_expired",
        });
        expired += 1;
      }
    }
    return expired;
  }
}

export function assertLeaseStoreGranted(
  result: LeaseAcquireResult,
): ConsiliencyLease {
  if (!result.granted || result.lease === undefined) {
    throw new WorktreeLeasingError(
      result.failure ?? "lease_not_granted",
      "Lease acquisition did not return a granted lease.",
    );
  }
  return result.lease;
}
