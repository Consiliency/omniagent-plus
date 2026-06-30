import { randomUUID } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { WorktreeLease, WorktreeLeaseRequest } from "@omniagent-plus/core-contracts";
import {
  AuditLedger,
  getStateLedgerPaths,
  nowIsoString,
  readJsonFile,
  withFilesystemLock,
  type AppendOnlyStoreOptions,
} from "@omniagent-plus/state-ledger";

import { evaluateBranchCollision } from "./branch-policy.js";
import { branchNameToSlug } from "./mounted-workspace.js";
import {
  WorktreeLeasingError,
  type AcquireWorktreeLeaseOptions,
  type RenewWorktreeLeaseOptions,
  type SequentialContinuationEvidence,
  type StoredLeaseRecord,
  type WorktreeLeaseAcquisition,
  type WorktreeLeaseRegistry,
} from "./types.js";

const REGISTRY_FILE = "worktree-lease-registry.json";

function calculateExpiry(now: string, ttlSeconds: number): string {
  return new Date(Date.parse(now) + ttlSeconds * 1_000).toISOString();
}

function createEmptyRegistry(now: string): WorktreeLeaseRegistry {
  return {
    schema: "worktree_lease_registry.v0.1",
    updatedAt: now,
    records: {},
  };
}

function leaseMapKey(
  value: Pick<WorktreeLease, "repoId" | "branchName" | "mode">,
): string {
  return `${value.repoId}:${value.branchName}:${value.mode}`;
}

function createDefaultLeasePath(request: WorktreeLeaseRequest): string {
  if (request.repoRoot !== undefined) {
    return join(
      dirname(request.repoRoot),
      `${request.repoId}-${branchNameToSlug(request.branchName)}`,
    );
  }

  return join(request.repoId, branchNameToSlug(request.branchName));
}

async function ensureParentDirectory(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await ensureParentDirectory(path);
  const tempPath = `${path}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(tempPath, path);
}

export class WorktreeLeaseManager {
  private readonly rootDir: string;

  private readonly defaultTtlSeconds: number;

  private readonly lockRetryMs: number;

  private readonly lockTimeoutMs: number;

  private readonly paths: ReturnType<typeof getStateLedgerPaths>;

  private readonly registryPath: string;

  private ledgerPromise?: Promise<AuditLedger>;

  private constructor(options: {
    readonly rootDir: string;
    readonly defaultTtlSeconds?: number;
    readonly lockRetryMs?: number;
    readonly lockTimeoutMs?: number;
  }) {
    this.rootDir = options.rootDir;
    this.defaultTtlSeconds = options.defaultTtlSeconds ?? 300;
    this.lockRetryMs = options.lockRetryMs ?? 25;
    this.lockTimeoutMs = options.lockTimeoutMs ?? 2_000;
    this.paths = getStateLedgerPaths(options.rootDir);
    this.registryPath = join(this.paths.coordinationDir, REGISTRY_FILE);
  }

  static async open(options: {
    readonly rootDir: string;
    readonly defaultTtlSeconds?: number;
    readonly lockRetryMs?: number;
    readonly lockTimeoutMs?: number;
  }): Promise<WorktreeLeaseManager> {
    const manager = new WorktreeLeaseManager(options);
    await manager.getLedger();
    return manager;
  }

  async acquireLease(
    request: WorktreeLeaseRequest,
    options: AcquireWorktreeLeaseOptions,
  ): Promise<WorktreeLeaseAcquisition> {
    const ttlSeconds =
      options.ttlSeconds ??
      request.requestedTtlSeconds ??
      this.defaultTtlSeconds;
    if (ttlSeconds <= 0) {
      throw new WorktreeLeasingError(
        "invalid_ttl",
        `Lease TTL must be positive for ${request.branchName}.`,
        { branchName: request.branchName, ttlSeconds },
      );
    }

    return this.withLeaseLock(async (ledger) => {
      const now = options.now ?? nowIsoString();
      const registry = await this.readRegistry(now);
      const activeMap = await this.readActiveLeaseMap();
      const records = Object.values(registry.records);
      const activeRecords = records.filter((record) => record.status === "active");
      const previousSequentialCandidate = this.getSequentialCandidate(
        records,
        request,
        options.branchHead,
      );
      const collision = evaluateBranchCollision({
        request,
        activeLeases: activeRecords.map((record) => record.lease),
        previousSequentialCandidate,
      });

      if (!collision.allowed) {
        const existingLease = activeRecords.find(
          (record) =>
            record.lease.repoId === request.repoId &&
            record.lease.branchName === request.branchName,
        )?.lease;

        return {
          acquired: false,
          existingLease,
          collision,
        };
      }

      const lease: WorktreeLease = {
        id: randomUUID(),
        fencingToken: randomUUID(),
        repoId: request.repoId,
        path:
          options.leasePath ?? collision.reusePath ?? createDefaultLeasePath(request),
        branchName: request.branchName,
        mode: request.mode,
        holder: options.holder,
        acquiredAt: now,
        renewedAt: now,
        expiresAt: calculateExpiry(now, ttlSeconds),
        dirtyState: options.dirtyState ?? "unknown",
      };
      const record: StoredLeaseRecord = {
        lease,
        request,
        repoRoot: options.repoRoot ?? request.repoRoot,
        branchHead: options.branchHead,
        status: "active",
        updatedAt: now,
      };

      registry.records[lease.id] = record;
      registry.updatedAt = now;
      activeMap[leaseMapKey(lease)] = lease;
      await writeJsonAtomic(this.registryPath, registry);
      await writeJsonAtomic(this.paths.worktreeLeasesPath, activeMap);
      await ledger.appendWorktreeLease(lease);

      return {
        acquired: true,
        lease,
      };
    });
  }

  async renewLease(
    lease: WorktreeLease,
    options: RenewWorktreeLeaseOptions = {},
  ): Promise<WorktreeLease> {
    return this.withLeaseLock(async (ledger) => {
      const now = options.now ?? nowIsoString();
      const registry = await this.readRegistry(now);
      const activeMap = await this.readActiveLeaseMap();
      const existing = registry.records[lease.id];

      if (existing === undefined || existing.status !== "active") {
        throw new WorktreeLeasingError(
          "lease_not_active",
          `Cannot renew inactive lease ${lease.id}.`,
          { leaseId: lease.id },
        );
      }
      if (existing.lease.fencingToken !== lease.fencingToken) {
        throw new WorktreeLeasingError(
          "fencing_token_mismatch",
          `Cannot renew lease ${lease.id} with mismatched fencing token.`,
          { leaseId: lease.id },
        );
      }

      const ttlSeconds =
        options.ttlSeconds ??
        existing.request.requestedTtlSeconds ??
        this.defaultTtlSeconds;
      const renewedLease: WorktreeLease = {
        ...existing.lease,
        renewedAt: now,
        expiresAt: calculateExpiry(now, ttlSeconds),
        dirtyState: options.dirtyState ?? existing.lease.dirtyState,
      };

      registry.records[lease.id] = {
        ...existing,
        lease: renewedLease,
        branchHead: options.branchHead ?? existing.branchHead,
        updatedAt: now,
      };
      registry.updatedAt = now;
      activeMap[leaseMapKey(renewedLease)] = renewedLease;
      await writeJsonAtomic(this.registryPath, registry);
      await writeJsonAtomic(this.paths.worktreeLeasesPath, activeMap);
      await ledger.appendWorktreeLease(renewedLease);

      return renewedLease;
    });
  }

  async releaseLease(
    lease: WorktreeLease,
    options: { readonly now?: string } = {},
  ): Promise<void> {
    await this.withLeaseLock(async () => {
      const now = options.now ?? nowIsoString();
      const registry = await this.readRegistry(now);
      const activeMap = await this.readActiveLeaseMap();
      const existing = registry.records[lease.id];

      if (existing === undefined) {
        return;
      }
      if (existing.lease.fencingToken !== lease.fencingToken) {
        throw new WorktreeLeasingError(
          "fencing_token_mismatch",
          `Cannot release lease ${lease.id} with mismatched fencing token.`,
          { leaseId: lease.id },
        );
      }

      registry.records[lease.id] = {
        ...existing,
        lease,
        status: "released",
        releasedAt: now,
        updatedAt: now,
      };
      registry.updatedAt = now;
      delete activeMap[leaseMapKey(existing.lease)];
      await writeJsonAtomic(this.registryPath, registry);
      await writeJsonAtomic(this.paths.worktreeLeasesPath, activeMap);
    });
  }

  async listActiveLeases(): Promise<WorktreeLease[]> {
    const registry = await this.readRegistry(nowIsoString());
    return Object.values(registry.records)
      .filter((record) => record.status === "active")
      .map((record) => record.lease);
  }

  async getStoredLeaseRecord(
    leaseId: string,
  ): Promise<StoredLeaseRecord | undefined> {
    const registry = await this.readRegistry(nowIsoString());
    return registry.records[leaseId];
  }

  private async getLedger(): Promise<AuditLedger> {
    this.ledgerPromise ??= AuditLedger.open({
      rootDir: this.rootDir,
      lockRetryMs: this.lockRetryMs,
      lockTimeoutMs: this.lockTimeoutMs,
    } satisfies AppendOnlyStoreOptions);
    return this.ledgerPromise;
  }

  private async withLeaseLock<T>(
    callback: (ledger: AuditLedger) => Promise<T>,
  ): Promise<T> {
    const ledger = await this.getLedger();
    return withFilesystemLock(
      join(this.paths.locksDir, "coordination.lock"),
      async () => callback(ledger),
      {
        retryMs: this.lockRetryMs,
        timeoutMs: this.lockTimeoutMs,
      },
    );
  }

  private async readRegistry(now: string): Promise<WorktreeLeaseRegistry> {
    const existing = await readJsonFile<WorktreeLeaseRegistry>(this.registryPath);
    if (existing?.schema === "worktree_lease_registry.v0.1") {
      return existing;
    }
    return createEmptyRegistry(now);
  }

  private async readActiveLeaseMap(): Promise<Record<string, WorktreeLease>> {
    return (
      (await readJsonFile<Record<string, WorktreeLease>>(
        this.paths.worktreeLeasesPath,
      )) ?? {}
    );
  }

  private getSequentialCandidate(
    records: readonly StoredLeaseRecord[],
    request: WorktreeLeaseRequest,
    branchHead?: string,
  ): SequentialContinuationEvidence | undefined {
    const matching = records
      .filter(
        (record) =>
          record.status === "released" &&
          record.request.taskId === request.taskId &&
          record.request.repoId === request.repoId &&
          record.request.branchName === request.branchName,
      )
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
    const candidate = matching[0];

    if (candidate === undefined) {
      return undefined;
    }

    return {
      taskId: candidate.request.taskId,
      repoId: candidate.request.repoId,
      branchName: candidate.request.branchName,
      path: candidate.lease.path,
      dirtyState: candidate.lease.dirtyState,
      branchHeadMatches:
        branchHead === undefined ||
        candidate.branchHead === undefined ||
        branchHead === candidate.branchHead,
    };
  }
}
