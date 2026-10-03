import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { resolve } from "node:path";

import {
  providerFamilyCooldownSchema,
  worktreeLeaseSchema,
  worktreeLeaseRequestSchema,
  type ProviderFamilyCooldown,
  type WorktreeLease,
  type WorktreeLeaseRequest,
} from "@consiliency/runtime-provider";
import { z } from "zod";

import { AuditLedger } from "./audit-ledger.js";
import {
  withFilesystemLock,
  type AppendOnlyStoreOptions,
} from "./append-only-store.js";
import { nowIsoString, readJsonFile, writeJsonAtomic } from "./schema.js";

const providerCooldownMapSchema = z.record(
  z.string(),
  providerFamilyCooldownSchema,
);
const worktreeLeaseMapSchema = z.record(z.string(), worktreeLeaseSchema);

export interface LeaseAcquisitionResult {
  readonly acquired: boolean;
  readonly lease?: WorktreeLease;
  readonly existingLease?: WorktreeLease;
}

export class CoordinationStore {
  private readonly ledger: AuditLedger;

  private constructor(ledger: AuditLedger) {
    this.ledger = ledger;
  }

  static async open(options: AppendOnlyStoreOptions): Promise<CoordinationStore> {
    return new CoordinationStore(await AuditLedger.open(options));
  }

  async getProviderCooldown(
    provider: string,
  ): Promise<ProviderFamilyCooldown | undefined> {
    const cooldowns = await this.readCooldownMap();
    return cooldowns[provider];
  }

  async setProviderCooldown(
    cooldown: ProviderFamilyCooldown,
  ): Promise<ProviderFamilyCooldown> {
    return withFilesystemLock(
      join(this.ledger.store.paths.locksDir, "coordination.lock"),
      async () => {
        const cooldowns = await this.readCooldownMap();
        cooldowns[cooldown.provider] = cooldown;
        await writeJsonAtomic(this.ledger.store.paths.cooldownsPath, cooldowns);
        await this.ledger.appendProviderCooldown(cooldown);
        return cooldown;
      },
    );
  }

  async acquireExclusiveLease(
    request: WorktreeLeaseRequest,
    holder: WorktreeLease["holder"],
    options: {
      readonly ttlSeconds?: number;
      readonly dirtyState?: WorktreeLease["dirtyState"];
      readonly leasePath?: string;
      readonly now?: string;
    } = {},
  ): Promise<LeaseAcquisitionResult> {
    worktreeLeaseRequestSchema.parse(request);
    await this.assertStandaloneRoot();
    return withFilesystemLock(
      join(this.ledger.store.paths.locksDir, "coordination.lock"),
      async () => {
        await this.assertStandaloneRoot();
        const now = options.now ?? nowIsoString();
        const leases = await this.readLeaseMap();
        this.clearReleasedLeases(leases);
        const leaseKey = `${request.repoId}:${request.branchName}:${request.mode}`;
        const leasePath = options.leasePath ?? request.repoRoot ?? join(request.repoId, request.branchName);
        const existingLease = Object.values(leases).find((lease) => lease.repoId === request.repoId && lease.branchName === request.branchName
          || resolve(lease.path) === resolve(leasePath));

        if (existingLease !== undefined) {
          return {
            acquired: false,
            existingLease,
          };
        }

        const ttlSeconds = options.ttlSeconds ?? request.requestedTtlSeconds ?? 300;
        if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds <= 0 || !Number.isFinite(Date.parse(now))) throw new Error("Invalid lease clock or TTL.");
        const expiresAt = new Date(
          Date.parse(now) + ttlSeconds * 1_000,
        ).toISOString();
        const lease: WorktreeLease = worktreeLeaseSchema.parse({
          id: randomUUID(),
          fencingToken: randomUUID(),
          repoId: request.repoId,
          path:
            options.leasePath ??
            request.repoRoot ??
            join(request.repoId, request.branchName),
          branchName: request.branchName,
          mode: request.mode,
          holder,
          acquiredAt: now,
          renewedAt: now,
          expiresAt,
          dirtyState: options.dirtyState ?? "unknown",
        });

        leases[leaseKey] = lease;
        await this.ledger.appendWorktreeLease(lease);
        await writeJsonAtomic(this.ledger.store.paths.worktreeLeasesPath, leases);
        return {
          acquired: true,
          lease,
        };
      },
    );
  }

  async listActiveLeases(): Promise<WorktreeLease[]> {
    return Object.values(await this.readLeaseMap());
  }

  private async readCooldownMap(): Promise<Record<string, ProviderFamilyCooldown>> {
    const raw = await readJsonFile<unknown>(this.ledger.store.paths.cooldownsPath);
    return Object.assign(Object.create(null) as Record<string, ProviderFamilyCooldown>, raw === undefined ? {} : providerCooldownMapSchema.parse(raw));
  }

  private async readLeaseMap(): Promise<Record<string, WorktreeLease>> {
    const raw = await readJsonFile<unknown>(this.ledger.store.paths.worktreeLeasesPath);
    return Object.assign(Object.create(null) as Record<string, WorktreeLease>, raw === undefined ? {} : worktreeLeaseMapSchema.parse(raw));
  }

  private async assertStandaloneRoot(): Promise<void> {
    const paths = this.ledger.store.paths;
    const marker = await readJsonFile<unknown>(join(paths.coordinationDir, "worktree-coord-root.json"));
    if (marker !== undefined || await readJsonFile<unknown>(join(paths.coordinationDir, "worktree-lease-registry.json")) !== undefined)
      throw new Error("Legacy physical acquisition is unsupported on a COORD-managed root.");
  }

  private clearReleasedLeases(
    leases: Record<string, WorktreeLease>,
  ): void {
    for (const [key, lease] of Object.entries(leases)) {
      if (lease.release !== undefined) {
        delete leases[key];
      }
    }
  }
}
