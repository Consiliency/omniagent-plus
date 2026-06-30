import { randomUUID } from "node:crypto";
import { join } from "node:path";

import {
  providerFamilyCooldownSchema,
  worktreeLeaseSchema,
  type ProviderFamilyCooldown,
  type WorktreeLease,
  type WorktreeLeaseRequest,
} from "@omniagent-plus/core-contracts";
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
    return withFilesystemLock(
      join(this.ledger.store.paths.locksDir, "coordination.lock"),
      async () => {
        const now = options.now ?? nowIsoString();
        const leases = await this.readLeaseMap();
        this.clearExpiredLeases(leases, now);
        const leaseKey = `${request.repoId}:${request.branchName}:${request.mode}`;
        const existingLease = leases[leaseKey];

        if (existingLease !== undefined && request.mode === "exclusive_write") {
          return {
            acquired: false,
            existingLease,
          };
        }

        const ttlSeconds = options.ttlSeconds ?? request.requestedTtlSeconds ?? 300;
        const expiresAt = new Date(
          Date.parse(now) + ttlSeconds * 1_000,
        ).toISOString();
        const lease: WorktreeLease = {
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
        };

        leases[leaseKey] = lease;
        await writeJsonAtomic(this.ledger.store.paths.worktreeLeasesPath, leases);
        await this.ledger.appendWorktreeLease(lease);
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
    const parsed = providerCooldownMapSchema.safeParse(
      await readJsonFile<unknown>(this.ledger.store.paths.cooldownsPath),
    );
    return parsed.success ? parsed.data : {};
  }

  private async readLeaseMap(): Promise<Record<string, WorktreeLease>> {
    const parsed = worktreeLeaseMapSchema.safeParse(
      await readJsonFile<unknown>(this.ledger.store.paths.worktreeLeasesPath),
    );
    return parsed.success ? parsed.data : {};
  }

  private clearExpiredLeases(
    leases: Record<string, WorktreeLease>,
    now: string,
  ): void {
    const nowMs = Date.parse(now);
    for (const [key, lease] of Object.entries(leases)) {
      if (Date.parse(lease.expiresAt) <= nowMs) {
        delete leases[key];
      }
    }
  }
}
