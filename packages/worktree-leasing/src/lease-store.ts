import { randomUUID } from "node:crypto";
import { join } from "node:path";
import {
  consiliencyLeaseSchema,
  isLeaseExpired,
  toContractTimestamp,
  type ConsiliencyLease,
  type ConsiliencyLeaseScope,
} from "@consiliency/runtime-provider";
import {
  getStateLedgerPaths,
  nowIsoString,
  readJsonFile,
  withFilesystemLock,
  writeJsonAtomic,
  validateCoordinationPage,
  compareCoordinationTuple,
  CoordinationBackendError,
  type CoordinationPage,
  type BackendFailureCause,
} from "@omniagent-plus/state-ledger";
import { z } from "zod";

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
  readonly cause?: BackendFailureCause;
}

export interface LeaseRenewResult {
  readonly renewed: boolean;
  readonly lease?: ConsiliencyLease;
  readonly failure?: LeaseStoreFailure;
  readonly cause?: BackendFailureCause;
}

export interface LeaseReleaseResult {
  readonly released: boolean;
  readonly failure?: LeaseStoreFailure;
  readonly cause?: BackendFailureCause;
}

export interface LeaseQuery extends CoordinationPage {
  readonly leaseId?: string;
  readonly scope?: ConsiliencyLeaseScope;
  readonly includeExpired?: boolean;
  readonly now?: string;
  readonly mode?: "soft" | "hard";
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
const eventSchema = z.object({ eventId: z.string().min(1), eventType: z.enum(["acquire", "renew", "release", "expire"]),
  leaseId: z.string().min(1), holder: z.string().min(1), lease: consiliencyLeaseSchema.optional(),
  recordedAt: z.string().datetime({ offset: true }), reason: z.string().optional(),
}).strict();
const localStateSchema = z.object({ schema: z.literal("consiliency.local_lease_store.v0.1"), updatedAt: z.string().datetime({ offset: true }),
  leases: z.record(consiliencyLeaseSchema), events: z.array(eventSchema),
}).strict();

function emptyState(now: string): LocalLeaseStoreState {
  return {
    schema: "consiliency.local_lease_store.v0.1",
    updatedAt: now,
    leases: Object.create(null) as Record<string, ConsiliencyLease>,
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
    const now = toContractTimestamp(request.now ?? nowIsoString());
    const lease = createLeaseFromAcquireRequest({ ...request, now });
    return this.withLeaseLock(async () => {
      const state = await this.readState(now);
      this.expireState(state, now);
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
    z.string().min(1).parse(leaseId);
    z.string().min(1).parse(holder);
    options = z.object({ ttlSeconds: z.number().int().min(1).max(7200).optional(), now: z.string().datetime({ offset: true }).optional() }).parse(options);
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
    z.string().min(1).parse(leaseId);
    z.string().min(1).parse(holder);
    options = z.object({ now: z.string().datetime({ offset: true }).optional() }).parse(options);
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
      const page = validateCoordinationPage(query);
      if (query.mode !== undefined) z.enum(["soft", "hard"]).parse(query.mode);
      const now = toContractTimestamp(query.now ?? nowIsoString());
      const state = await this.readState(now);
      const leases = Object.values(state.leases)
        .filter((lease) => query.includeExpired === true || !isLeaseExpired(lease, now))
        .filter((lease) => query.leaseId === undefined || lease.lease_id === query.leaseId)
        .filter((lease) => query.scope === undefined || leaseScopesOverlap(lease.scope, query.scope))
        .filter((lease) => query.mode === undefined || lease.mode === query.mode)
        .sort((left, right) => compareCoordinationTuple({ timestamp: left.acquired_at, id: left.lease_id }, { timestamp: right.acquired_at, id: right.lease_id }))
        .filter((lease) => !page.cursor || compareCoordinationTuple({ timestamp: lease.acquired_at, id: lease.lease_id }, page.cursor) > 0)
        .slice(0, page.limit);
      return { leases };
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
    const existing = await readJsonFile<unknown>(this.statePath);
    if (existing === undefined) return emptyState(now);
    const parsed = localStateSchema.parse(existing);
    const entries = Object.entries((existing as LocalLeaseStoreState).leases).map(([key, value]) => [key, consiliencyLeaseSchema.parse(value)] as const);
    for (const [key, lease] of entries) if (key !== lease.lease_id) throw new WorktreeLeasingError("corrupt_lease_store", "Fleet lease projection key does not match.");
    return { ...parsed, leases: Object.assign(Object.create(null) as Record<string, ConsiliencyLease>, Object.fromEntries(entries)) };
  }

  private async writeState(state: LocalLeaseStoreState, now: string): Promise<void> {
    if (Object.keys(state.leases).length > 10000) throw new CoordinationBackendError("capacity");
    const protectedIndices = new Set<number>();
    const latest = new Map<string, number>();
    const acquisitions = new Map<string, number>();
    state.events.forEach((event, index) => {
      const lease = state.leases[event.leaseId];
      if (!lease) return;
      latest.set(lease.lease_id, index);
      if (event.eventType === "acquire" && event.lease?.acquired_at === lease.acquired_at && event.holder === lease.holder) acquisitions.set(lease.lease_id, index);
    });
    for (const index of [...latest.values(), ...acquisitions.values()]) {
      protectedIndices.add(index);
    }
    if (protectedIndices.size > 10000) throw new CoordinationBackendError("capacity");
    let remove = Math.max(0, state.events.length - 10000);
    const events = state.events.filter((_event, index) => {
      if (remove > 0 && !protectedIndices.has(index)) { remove -= 1; return false; }
      return true;
    });
    await writeJsonAtomic(this.statePath, {
      ...state,
      events,
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
