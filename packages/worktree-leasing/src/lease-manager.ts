import { randomUUID } from "node:crypto";
import { lstat, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { createWorktreeLeaseRelease, worktreeLeaseSchema, worktreeLeaseRequestSchema,
  type WorktreeLease, type WorktreeLeaseRequest, type StateLedgerEntry } from "@consiliency/runtime-provider";
import { AuditLedger, getStateLedgerPaths, nowIsoString, readJsonFile, withFilesystemLock,
  writeJsonAtomic, selectRetentionSequences, LedgerReadError, type RetentionPolicy, type RetentionResult } from "@omniagent-plus/state-ledger";
import { z } from "zod";
import { evaluateBranchCollision } from "./branch-policy.js";
import { branchNameToSlug } from "./mounted-workspace.js";
import { inspectWorktreeDirtyState, readGitWorktreeRegistration, verifyGitWorktreeRepository } from "./git.js";
import { checkProcessLiveness } from "./process-liveness.js";
import { WorktreeLeasingError, type AcquireWorktreeLeaseOptions, type RenewWorktreeLeaseOptions,
  type SequentialContinuationEvidence, type StoredLeaseRecord, type WorktreeLeaseAcquisition,
  type WorktreeLeaseRegistry, type WorktreeLeaseManagerOptions, type PendingLeaseMutation,
  type PathIdentity, type LeasePageOptions } from "./types.js";

const instant = z.string().datetime({ offset: true });
const identitySchema = z.object({ path: z.string().min(1), dev: z.number().int().nonnegative(), ino: z.number().int().nonnegative() }).strict();
const storedSchema = z.object({
  lease: worktreeLeaseSchema, request: worktreeLeaseRequestSchema,
  repoRoot: z.string().min(1).optional(), branchHead: z.string().min(1).optional(),
  status: z.enum(["active", "released"]), releasedAt: instant.optional(), updatedAt: instant,
  managedRoot: identitySchema.optional(), pathIdentity: identitySchema.optional(),
}).strict().superRefine((record, ctx) => {
  if (record.lease.repoId !== record.request.repoId || record.lease.branchName !== record.request.branchName
    || record.lease.mode !== record.request.mode || (record.status === "released") !== (record.releasedAt !== undefined))
    ctx.addIssue({ code: "custom", message: "Lease projection identity mismatch." });
});
const pendingSchema = z.object({ recordId: z.string().min(1), record: storedSchema,
  operation: z.enum(["acquire", "renew", "release", "remove"]),
  removal: z.object({ identity: identitySchema, state: z.enum(["prepared", "removal_done"]) }).strict().optional(),
}).strict();
const registrySchema = z.object({ schema: z.literal("worktree_lease_registry.v0.1"), updatedAt: instant,
  records: z.record(storedSchema), pending: z.record(pendingSchema).optional(),
  reclamation: z.object({ recordIds: z.array(z.string().min(1)), leaseIds: z.array(z.string().min(1)), watermarks: z.record(instant) }).strict().optional(),
  reclaimedThrough: z.record(instant).optional(),
}).strict();

function dictionary<T>(entries: ReadonlyArray<readonly [string, T]> = []): Record<string, T> {
  return Object.assign(Object.create(null) as Record<string, T>, Object.fromEntries(entries));
}
function mapKey(lease: WorktreeLease): string { return [lease.repoId, lease.branchName, lease.mode].join(":"); }
function continuationKey(request: WorktreeLeaseRequest): string { return JSON.stringify([request.taskId, request.repoId, request.branchName]); }
async function canonicalLeasePath(path: string): Promise<string> {
  let parent = resolve(path);
  const missing: string[] = [];
  while (true) {
    const identity = await readPathIdentity(parent);
    if (identity) return join(identity.path, ...missing);
    missing.unshift(relative(dirname(parent), parent));
    parent = dirname(parent);
  }
}
function expiry(now: string, ttl: number): string {
  instant.parse(now);
  if (!Number.isSafeInteger(ttl) || ttl <= 0 || Math.abs(Date.parse(now) + ttl * 1000) > 8.64e15)
    throw new WorktreeLeasingError("invalid_ttl", "Lease TTL must produce a finite positive whole-number expiry.");
  return new Date(Date.parse(now) + ttl * 1000).toISOString();
}
export async function readPathIdentity(path: string): Promise<PathIdentity | undefined> {
  try {
    const info = await lstat(path);
    if (info.isSymbolicLink() || !info.isDirectory()) throw new WorktreeLeasingError("unsafe_path", "Lease path must be a real directory.");
    return { path: await realpath(path), dev: info.dev, ino: info.ino };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
}
export function samePathIdentity(a: PathIdentity, b: PathIdentity): boolean {
  return a.path === b.path && a.dev === b.dev && a.ino === b.ino;
}

export class WorktreeLeaseManager {
  private readonly paths: ReturnType<typeof getStateLedgerPaths>;
  private readonly registryPath: string;
  private ledgerPromise?: Promise<AuditLedger>;
  private configuredRoot?: PathIdentity;
  private constructor(private readonly options: WorktreeLeaseManagerOptions) {
    this.paths = getStateLedgerPaths(options.rootDir);
    this.registryPath = join(this.paths.coordinationDir, "worktree-lease-registry.json");
  }
  static async open(options: WorktreeLeaseManagerOptions): Promise<WorktreeLeaseManager> {
    const manager = new WorktreeLeaseManager(options);
    if (options.managedRoot !== undefined) {
      manager.configuredRoot = await readPathIdentity(resolve(options.managedRoot));
      if (!manager.configuredRoot) throw new WorktreeLeasingError("managed_root_missing", "Configured managed root must already exist.");
    }
    return manager;
  }

  async acquireLease(request: WorktreeLeaseRequest, options: AcquireWorktreeLeaseOptions): Promise<WorktreeLeaseAcquisition> {
    worktreeLeaseRequestSchema.parse(request);
    const now = options.now ?? nowIsoString();
    const expiresAt = expiry(now, options.ttlSeconds ?? request.requestedTtlSeconds ?? this.options.defaultTtlSeconds ?? 300);
    return this.withMutation(async (registry, ledger) => {
      const active = Object.values(registry.records).filter((r) => r.status === "active");
      const collision = evaluateBranchCollision({ request, activeLeases: active.map((r) => r.lease),
        previousSequentialCandidate: this.getSequentialCandidate(registry, request, options.branchHead) });
      if (!collision.allowed) return { acquired: false, collision,
        existingLease: active.find((r) => r.lease.repoId === request.repoId && r.lease.branchName === request.branchName)?.lease };
      const path = options.leasePath ?? collision.reusePath ?? (request.repoRoot
        ? join(dirname(request.repoRoot), request.repoId + "-" + branchNameToSlug(request.branchName))
        : join(request.repoId, branchNameToSlug(request.branchName)));
      const canonical = await canonicalLeasePath(path);
      const quarantined = Object.values(registry.pending ?? {}).find((p) => (p.record.lease.repoId === request.repoId
        && p.record.lease.branchName === request.branchName) || (p.record.pathIdentity?.path ?? resolve(p.record.lease.path)) === canonical);
      const pathOwner = active.find((r) => (r.pathIdentity?.path ?? resolve(r.lease.path)) === canonical);
      if (quarantined || pathOwner) return { acquired: false, existingLease: (quarantined?.record ?? pathOwner)?.lease };
      if (this.configuredRoot) await this.validateManagedPath(path, this.configuredRoot);
      const lease = worktreeLeaseSchema.parse({ id: randomUUID(), fencingToken: randomUUID(), repoId: request.repoId,
        path: canonical, branchName: request.branchName, mode: request.mode, holder: options.holder,
        acquiredAt: now, renewedAt: now, expiresAt, dirtyState: options.dirtyState ?? "unknown" });
      const record: StoredLeaseRecord = { lease, request, repoRoot: options.repoRoot ?? request.repoRoot,
        branchHead: options.branchHead, status: "active", updatedAt: now,
        managedRoot: this.configuredRoot, pathIdentity: await readPathIdentity(canonical) };
      await this.publishMutation(registry, ledger, { recordId: randomUUID(), record, operation: "acquire" });
      return { acquired: true, lease };
    });
  }
  async renewLease(lease: WorktreeLease, options: RenewWorktreeLeaseOptions = {}): Promise<WorktreeLease> {
    return this.withMutation(async (registry, ledger) => {
      const existing = this.requireOwner(registry, lease);
      const now = options.now ?? nowIsoString();
      if (Date.parse(now) < Date.parse(existing.lease.renewedAt)) throw new WorktreeLeasingError("invalid_clock", "Lease renewal cannot rewind the established clock.");
      const renewed = worktreeLeaseSchema.parse({ ...existing.lease, renewedAt: now,
        expiresAt: expiry(now, options.ttlSeconds ?? existing.request.requestedTtlSeconds ?? this.options.defaultTtlSeconds ?? 300),
        dirtyState: options.dirtyState ?? existing.lease.dirtyState });
      await this.publishMutation(registry, ledger, { recordId: randomUUID(), operation: "renew",
        record: { ...existing, lease: renewed, updatedAt: now, branchHead: options.branchHead ?? existing.branchHead } });
      return renewed;
    });
  }
  async releaseLease(lease: WorktreeLease, options: { readonly now?: string } = {}): Promise<void> {
    await this.withMutation(async (registry, ledger) => {
      const record = registry.records[lease.id];
      if (!record) return;
      this.assertOwner(record.lease, lease);
      if (record.status === "released") return;
      if (registry.pending?.[lease.id]) throw new WorktreeLeasingError("lease_incomplete", "Lease has an unresolved intent.");
      await this.publishMutation(registry, ledger, this.releaseIntent(record, options.now ?? nowIsoString(), "release"));
    });
  }
  async listActiveLeases(options: LeasePageOptions = {}): Promise<WorktreeLease[]> {
    const limit = options.limit ?? 100;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) throw new WorktreeLeasingError("invalid_limit", "Lease page limit must be between 1 and 500.");
    if (options.cursor) { instant.parse(options.cursor.timestamp); z.string().min(1).parse(options.cursor.id); }
    const cursor = options.cursor && { ...options.cursor, timestamp: new Date(options.cursor.timestamp).toISOString() };
    return Object.values((await this.readRegistry()).records).filter((r) => r.status === "active")
      .map((r) => ({ ...r.lease, acquiredAt: new Date(r.lease.acquiredAt).toISOString() }))
      .sort((a, b) => a.acquiredAt.localeCompare(b.acquiredAt) || Buffer.compare(Buffer.from(a.id), Buffer.from(b.id)))
      .filter((lease) => !cursor || lease.acquiredAt > cursor.timestamp || lease.acquiredAt === cursor.timestamp
        && Buffer.compare(Buffer.from(lease.id), Buffer.from(cursor.id)) > 0).slice(0, limit);
  }
  async getStoredLeaseRecord(id: string): Promise<StoredLeaseRecord | undefined> { return (await this.readRegistry()).records[id]; }
  async inspectIncomplete(): Promise<{ pending: readonly PendingLeaseMutation[]; reclamation: boolean }> {
    const registry = await this.readRegistry();
    return { pending: Object.values(registry.pending ?? {}), reclamation: registry.reclamation !== undefined };
  }
  async reconcile(): Promise<{ pending: readonly PendingLeaseMutation[]; reclamation: boolean }> {
    await this.withMutation(async () => undefined);
    return this.inspectIncomplete();
  }
  async retainHistory(policy: RetentionPolicy, now = new Date()): Promise<RetentionResult> {
    return this.withLeaseLock(async (ledger) => {
      const registry = await this.readRegistry();
      await this.ensureManagedStore(registry);
      await this.finishReclamation(registry, ledger);
      const snapshot = await ledger.listRecords();
      const preliminary = this.retentionSelection(snapshot, registry, policy, now);
      const recordIds = snapshot.filter((r) => r.kind === "worktree_lease" && !preliminary.has(r.sequence)).map((r) => r.recordId);
      const leaseIds = Object.values(registry.records).filter((r) => r.status === "released" && !registry.pending?.[r.lease.id]
        && snapshot.some((e) => e.kind === "worktree_lease" && e.payload.id === r.lease.id)
        && !snapshot.some((e) => e.kind === "worktree_lease" && e.payload.id === r.lease.id && preliminary.has(e.sequence))).map((r) => r.lease.id);
      const watermarks: Record<string, string> = dictionary();
      for (const id of leaseIds) {
        const record = registry.records[id]!;
        const key = continuationKey(record.request);
        const current = watermarks[key] ?? registry.reclaimedThrough?.[key];
        if (!current || Date.parse(record.updatedAt) > Date.parse(current)) watermarks[key] = record.updatedAt;
      }
      registry.reclamation = { recordIds, leaseIds, watermarks };
      await this.writeRegistry(registry);
      const candidates = new Set(recordIds);
      let selected: Set<number> | undefined;
      const result = await ledger.store.compactRecords((record, current) => {
        selected ??= this.retentionSelection(current, registry, policy, now);
        return selected.has(record.sequence) || record.kind === "worktree_lease" && !candidates.has(record.recordId);
      });
      await this.finishReclamation(registry, ledger);
      await this.replayPending(registry, ledger);
      return { keptRecords: result.keptRecords, prunedRecords: result.prunedRecords };
    });
  }

  async withCleanup<T>(lease: WorktreeLease, callback: (record: StoredLeaseRecord, controls: {
    validatePath(): Promise<void>; stageRemoval(identity: PathIdentity, now: string): Promise<void>;
    markRemovalDone(): Promise<void>; release(now: string): Promise<void>; ledgerEvidence(): Promise<boolean>;
  }) => Promise<T>): Promise<T> {
    return this.withMutation(async (registry, ledger) => {
      const record = this.requireOwner(registry, lease);
      return callback(record, {
        ledgerEvidence: async () => (await ledger.listRecords()).some((r) => r.kind === "worktree_lease"
          && r.payload.id === record.lease.id && r.payload.fencingToken === record.lease.fencingToken),
        validatePath: async () => {
          if (!record.managedRoot || !this.configuredRoot || !samePathIdentity(record.managedRoot, this.configuredRoot))
            throw new WorktreeLeasingError("managed_root_unproven", "Cleanup requires independently configured acquisition-root provenance.");
          await this.validateManagedPath(record.lease.path, record.managedRoot);
        },
        stageRemoval: async (identity, now) => {
          registry.pending ??= dictionary();
          registry.pending[lease.id] = { ...this.releaseIntent(record, now, "remove"), removal: { identity, state: "prepared" } };
          await this.writeRegistry(registry);
        },
        markRemovalDone: async () => {
          const intent = registry.pending?.[lease.id];
          if (!intent?.removal) throw new WorktreeLeasingError("removal_intent_missing", "Removal intent is missing.");
          registry.pending![lease.id] = { ...intent, removal: { ...intent.removal, state: "removal_done" } };
          await this.writeRegistry(registry);
        },
        release: async (now) => {
          await this.publishMutation(registry, ledger, registry.pending?.[lease.id] ?? this.releaseIntent(record, now, "release"));
        },
      });
    });
  }
  private async validateManagedPath(path: string, root: PathIdentity): Promise<void> {
    const actual = await readPathIdentity(root.path);
    if (!actual || !samePathIdentity(root, actual)) throw new WorktreeLeasingError("managed_root_changed", "Managed root identity changed.");
    const child = relative(root.path, resolve(path));
    if (!child || child === ".." || child.startsWith(".." + sep) || isAbsolute(child))
      throw new WorktreeLeasingError("outside_managed_root", "Lease path must be below the configured root.");
    let current = root.path;
    for (const component of child.split(sep)) {
      current = join(current, component);
      const identity = await readPathIdentity(current);
      if (!identity) break;
      if (identity.path !== current) throw new WorktreeLeasingError("unsafe_path", "Symlink components cannot authorize cleanup.");
    }
  }
  private requireOwner(registry: WorktreeLeaseRegistry, lease: WorktreeLease): StoredLeaseRecord {
    const record = registry.records[lease.id];
    if (!record || record.status !== "active") throw new WorktreeLeasingError("lease_not_active", "Lease is not active.");
    this.assertOwner(record.lease, lease);
    if (registry.pending?.[lease.id]) throw new WorktreeLeasingError("lease_incomplete", "Lease has an unresolved mutation intent.");
    return record;
  }
  private assertOwner(recorded: WorktreeLease, supplied: WorktreeLease): void {
    if (recorded.fencingToken !== supplied.fencingToken) throw new WorktreeLeasingError("fencing_token_mismatch", "Lease fencing token does not match.");
    if (recorded.holder.processId !== supplied.holder.processId || recorded.holder.host !== supplied.holder.host
      || recorded.holder.sessionId !== supplied.holder.sessionId || recorded.holder.turnId !== supplied.holder.turnId || recorded.path !== supplied.path
      || recorded.repoId !== supplied.repoId || recorded.branchName !== supplied.branchName || recorded.mode !== supplied.mode)
      throw new WorktreeLeasingError("holder_mismatch", "Lease ownership identity does not match.");
  }
  private releaseIntent(record: StoredLeaseRecord, now: string, operation: "release" | "remove"): PendingLeaseMutation {
    const lease = createWorktreeLeaseRelease(record.lease, { cause: operation === "remove" ? "reconciliation" : "holder_release",
      actor: "worktree-lease-manager", releasedAt: now });
    return { operation, recordId: randomUUID(), record: { ...record, lease, status: "released", releasedAt: now, updatedAt: now } };
  }
  private async getLedger(): Promise<AuditLedger> {
    this.ledgerPromise ??= AuditLedger.open({ rootDir: this.options.rootDir, readOnly: this.options.readOnly,
      lockRetryMs: this.options.lockRetryMs, lockTimeoutMs: this.options.lockTimeoutMs, maxSnapshotBytes: this.options.maxSnapshotBytes });
    return this.ledgerPromise;
  }
  private async withLeaseLock<T>(callback: (ledger: AuditLedger) => Promise<T>): Promise<T> {
    if (this.options.readOnly) throw new WorktreeLeasingError("read_only_store", "Lease store is read-only.");
    return withFilesystemLock(join(this.paths.locksDir, "coordination.lock"), async () => callback(await this.getLedger()),
      { retryMs: this.options.lockRetryMs, timeoutMs: this.options.lockTimeoutMs });
  }
  private async withMutation<T>(callback: (registry: WorktreeLeaseRegistry, ledger: AuditLedger) => Promise<T>): Promise<T> {
    return this.withLeaseLock(async (ledger) => {
      const registry = await this.readRegistry();
      await this.ensureManagedStore(registry);
      await this.finishReclamation(registry, ledger);
      await this.replayPending(registry, ledger);
      return callback(registry, ledger);
    });
  }
  private async ensureManagedStore(registry: WorktreeLeaseRegistry): Promise<void> {
    for (const lease of Object.values(await this.readActiveMap())) {
      if (!registry.records[lease.id] && !registry.pending?.[lease.id])
        throw new WorktreeLeasingError("legacy_lease_conflict", "Legacy physical ownership must be reconciled before COORD manages this root.");
    }
    const marker = join(this.paths.coordinationDir, "worktree-coord-root.json");
    const existing = await readJsonFile<unknown>(marker);
    if (existing !== undefined) z.object({ schema: z.literal("worktree_coord_root.v1") }).strict().parse(existing);
    else await writeJsonAtomic(marker, { schema: "worktree_coord_root.v1" });
  }
  private async readRegistry(): Promise<WorktreeLeaseRegistry> {
    const raw = await readJsonFile<unknown>(this.registryPath);
    if (raw === undefined) return { schema: "worktree_lease_registry.v0.1", updatedAt: nowIsoString(), records: dictionary(), pending: dictionary(), reclaimedThrough: dictionary() };
    const parsed = registrySchema.parse(raw);
    for (const key of ["records", "pending", "reclaimedThrough"] as const) {
      if (Object.keys((raw as WorktreeLeaseRegistry)[key] ?? {}).length !== Object.keys(parsed[key] ?? {}).length)
        throw new WorktreeLeasingError("corrupt_registry", "Registry contains unsupported identifier keys.");
    }
    for (const [id, record] of Object.entries(parsed.records))
      if (id !== record.lease.id) throw new WorktreeLeasingError("corrupt_registry", "Registry lease ID mismatch.");
    for (const [id, pending] of Object.entries(parsed.pending ?? {}))
      if (id !== pending.record.lease.id || pending.operation === "remove" && !pending.removal)
        throw new WorktreeLeasingError("corrupt_registry", "Registry intent identity mismatch.");
    return { ...parsed, records: dictionary(Object.entries(parsed.records)), pending: dictionary(Object.entries(parsed.pending ?? {})),
      reclaimedThrough: dictionary(Object.entries(parsed.reclaimedThrough ?? {})) };
  }
  private async readActiveMap(): Promise<Record<string, WorktreeLease>> {
    const raw = await readJsonFile<unknown>(this.paths.worktreeLeasesPath);
    if (raw === undefined) return dictionary();
    z.record(worktreeLeaseSchema).parse(raw);
    const entries = Object.entries(raw as Record<string, unknown>).map(([key, value]) => [key, worktreeLeaseSchema.parse(value)] as const);
    for (const [key, value] of entries) if (key !== mapKey(value)) throw new WorktreeLeasingError("corrupt_lease_map", "Lease map key does not match its payload.");
    return dictionary(entries);
  }
  private async writeRegistry(registry: WorktreeLeaseRegistry): Promise<void> {
    registrySchema.parse(registry);
    await writeJsonAtomic(this.registryPath, registry);
  }
  private async publishMutation(registry: WorktreeLeaseRegistry, ledger: AuditLedger, intent: PendingLeaseMutation): Promise<void> {
    pendingSchema.parse(intent);
    const id = intent.record.lease.id;
    registry.pending ??= dictionary();
    registry.pending[id] = intent;
    registry.updatedAt = intent.record.updatedAt;
    await this.writeRegistry(registry);
    try { await this.applyIntent(registry, ledger, intent); }
    catch (error) {
      if ((intent.operation === "acquire" || intent.operation === "renew") && error instanceof LedgerReadError && error.code === "snapshot_limit") {
        const observed = (await ledger.listRecords()).find((r) => r.recordId === intent.recordId);
        if (!observed) { delete registry.pending[id]; await this.writeRegistry(registry); }
      }
      throw error;
    }
  }
  private async applyIntent(registry: WorktreeLeaseRegistry, ledger: AuditLedger, intent: PendingLeaseMutation): Promise<void> {
    const lease = intent.record.lease;
    const existing = (await ledger.listRecords()).find((r) => r.recordId === intent.recordId);
    if (existing) {
      if (existing.kind !== "worktree_lease" || JSON.stringify(existing.payload) !== JSON.stringify(lease))
        throw new WorktreeLeasingError("intent_payload_mismatch", "Pending ledger evidence does not match its intent.");
    } else await ledger.store.appendRecord({ kind: "worktree_lease", payload: lease, recordId: intent.recordId,
      recordedAt: intent.record.updatedAt, sessionId: lease.holder.sessionId, turnId: lease.holder.turnId });
    registry.records[lease.id] = intent.record;
    await this.writeRegistry(registry);
    const map = dictionary<WorktreeLease>();
    for (const record of Object.values(registry.records)) if (record.status === "active") map[mapKey(record.lease)] = record.lease;
    await writeJsonAtomic(this.paths.worktreeLeasesPath, map);
    delete registry.pending![lease.id];
    await this.writeRegistry(registry);
  }
  private async replayPending(registry: WorktreeLeaseRegistry, ledger: AuditLedger): Promise<void> {
    for (const intent of Object.values(registry.pending ?? {})) {
      if (intent.removal?.state === "prepared") {
        const path = await readPathIdentity(resolve(intent.record.lease.path));
        if (!intent.record.repoRoot) continue;
        const registration = await readGitWorktreeRegistration(intent.record.repoRoot, resolve(intent.record.lease.path));
        if (!path) {
          if (registration && registration.branchName !== intent.record.lease.branchName
            || checkProcessLiveness({ processId: intent.record.lease.holder.processId, holderHost: intent.record.lease.holder.host }).state !== "missing") continue;
        } else {
          if (samePathIdentity(path, intent.removal.identity) && registration?.branchName === intent.record.lease.branchName
            && await verifyGitWorktreeRepository(intent.record.repoRoot, path.path) && await inspectWorktreeDirtyState(path.path) === "clean") {
            delete registry.pending![intent.record.lease.id]; await this.writeRegistry(registry);
          }
          continue;
        }
      }
      try { await this.applyIntent(registry, ledger, intent); }
      catch (error) {
        if (!(error instanceof LedgerReadError && error.code === "snapshot_limit")
          && !(error instanceof WorktreeLeasingError && error.code === "intent_payload_mismatch")) throw error;
      }
    }
  }
  private retentionSelection(records: readonly StateLedgerEntry[], registry: WorktreeLeaseRegistry, policy: RetentionPolicy, now: Date): Set<number> {
    const pins = new Set(policy.protectedRecordIds ?? []);
    const grouped = new Map<string, StateLedgerEntry[]>();
    for (const entry of records) if (entry.kind === "worktree_lease") {
      const rows = grouped.get(entry.payload.id) ?? [];
      rows.push(entry); grouped.set(entry.payload.id, rows);
    }
    for (const [id, entries] of grouped) {
      const record = registry.records[id];
      const pending = registry.pending?.[id];
      for (const entry of entries) {
        if ((!record && !pending) || pending?.recordId === entry.recordId
          || (record?.status === "active" || pending) && (entry === entries[0] || entry === entries.at(-1))
          || record?.status === "released" && entry === entries.at(-1) && (policy.maxAgeMs === undefined
            || Date.parse(record.updatedAt) >= now.getTime() - policy.maxAgeMs)) pins.add(entry.recordId);
      }
    }
    return selectRetentionSequences(records, { ...policy, protectedRecordIds: [...pins], nonRootKinds: ["worktree_lease"] }, now);
  }
  private async finishReclamation(registry: WorktreeLeaseRegistry, ledger: AuditLedger): Promise<void> {
    const intent = registry.reclamation;
    if (!intent) return;
    const rows = await ledger.listRecords();
    for (const id of intent.leaseIds) {
      const record = registry.records[id];
      if (!record || record.status !== "released" || registry.pending?.[id] || rows.some((r) => r.kind === "worktree_lease" && r.payload.id === id)) continue;
      const key = continuationKey(record.request);
      const watermark = intent.watermarks[key];
      if (watermark && (!registry.reclaimedThrough?.[key] || Date.parse(watermark) > Date.parse(registry.reclaimedThrough[key]!))) {
        registry.reclaimedThrough ??= dictionary(); registry.reclaimedThrough[key] = watermark;
      }
      delete registry.records[id];
    }
    delete registry.reclamation;
    for (const [key, watermark] of Object.entries(registry.reclaimedThrough ?? {})) {
      if (![...Object.values(registry.records), ...Object.values(registry.pending ?? {}).map((p) => p.record)]
        .some((record) => continuationKey(record.request) === key && Date.parse(record.updatedAt) <= Date.parse(watermark))) delete registry.reclaimedThrough![key];
    }
    await this.writeRegistry(registry);
  }
  private getSequentialCandidate(registry: WorktreeLeaseRegistry, request: WorktreeLeaseRequest, head?: string): SequentialContinuationEvidence | undefined {
    const matching = Object.values(registry.records).filter((r) => r.status === "released" && continuationKey(r.request) === continuationKey(request))
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || Buffer.compare(Buffer.from(b.lease.id), Buffer.from(a.lease.id)));
    const candidate = matching[0];
    if (!candidate) return undefined;
    const watermark = registry.reclaimedThrough?.[continuationKey(request)];
    const tied = matching.some((r) => r !== candidate && Date.parse(r.updatedAt) === Date.parse(candidate.updatedAt)
      && (r.lease.path !== candidate.lease.path || r.lease.dirtyState !== candidate.lease.dirtyState || r.branchHead !== candidate.branchHead));
    return { taskId: request.taskId, repoId: request.repoId, branchName: request.branchName, path: candidate.lease.path,
      dirtyState: tied || watermark && Date.parse(candidate.updatedAt) <= Date.parse(watermark) ? "unknown" : candidate.lease.dirtyState,
      branchHeadMatches: head === undefined || candidate.branchHead === undefined || head === candidate.branchHead };
  }
}
