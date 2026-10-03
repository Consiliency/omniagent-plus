import { mkdtemp, readFile, mkdir, stat, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuditLedger, AppendOnlyStore, getStateLedgerPaths } from "@omniagent-plus/state-ledger";
import type * as LedgerModule from "@omniagent-plus/state-ledger";
import { WorktreeLeaseManager } from "./lease-manager.js";
import { getCurrentHostIdentity } from "./process-liveness.js";

const fault = vi.hoisted(() => ({ boundary: 0, writes: 0 }));
vi.mock("@omniagent-plus/state-ledger", async (original) => {
  const module = await original<typeof LedgerModule>();
  return { ...module, writeJsonAtomic: async (path: string, value: unknown) => {
    await module.writeJsonAtomic(path, value);
    if (path.endsWith("worktree-lease-registry.json") || path.endsWith("worktree-leases.json")) {
      fault.writes += 1;
      if (fault.boundary === fault.writes) throw new Error("injected publication interruption");
    }
  } };
});
const request = { taskId: "task", repoId: "repo", branchName: "feature/durable", mode: "exclusive_write" as const };
const holder = { processId: 2147483647, host: getCurrentHostIdentity(), sessionId: "closed" };
const now = "2026-06-30T00:00:00.000Z";
afterEach(() => { fault.boundary = 0; fault.writes = 0; vi.restoreAllMocks(); });

describe("COORD durable publication", () => {
  it.each([1, 2, 3, 4])("reconciles publication boundary %i without duplicating ledger transitions", async (boundary) => {
    const rootDir = await mkdtemp(join(tmpdir(), "coord-boundary-"));
    const manager = await WorktreeLeaseManager.open({ rootDir });
    fault.boundary = boundary;
    await expect(manager.acquireLease(request, { holder, leasePath: join(rootDir, "tree"), now })).rejects.toThrow("interruption");
    fault.boundary = 0;
    const before = await manager.inspectIncomplete();
    const reopened = await WorktreeLeaseManager.open({ rootDir });
    await reopened.reconcile();
    expect((await reopened.inspectIncomplete()).pending).toEqual([]);
    const leases = await reopened.listActiveLeases();
    expect(leases).toHaveLength(1);
    const ledger = await AuditLedger.open({ rootDir, readOnly: true });
    const records = await ledger.listRecordsByKind("worktree_lease");
    expect(records).toHaveLength(1);
    expect(records[0]?.payload.id).toBe(leases[0]?.id);
    if (before.pending.length) expect(records[0]?.recordId).toBe(before.pending[0]?.recordId);
  });

  it("replays the exact ID after interruption immediately following append", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "coord-append-boundary-"));
    const manager = await WorktreeLeaseManager.open({ rootDir });
    const append = AppendOnlyStore.prototype.appendRecord;
    vi.spyOn(AppendOnlyStore.prototype, "appendRecord").mockImplementationOnce(async function (this: AppendOnlyStore, input) {
      await append.call(this, input);
      throw new Error("after ledger publication");
    });
    await expect(manager.acquireLease(request, { holder, leasePath: join(rootDir, "tree"), now })).rejects.toThrow("after ledger");
    const pending = (await manager.inspectIncomplete()).pending[0]!;
    await manager.reconcile();
    const ledger = await AuditLedger.open({ rootDir, readOnly: true });
    expect((await ledger.listRecords()).map((r) => r.recordId)).toEqual([pending.recordId]);
  });

  it("inspects missing and interrupted stores without initializing or repairing them", async () => {
    const parent = await mkdtemp(join(tmpdir(), "coord-inspect-"));
    const rootDir = join(parent, "missing");
    const manager = await WorktreeLeaseManager.open({ rootDir, readOnly: true });
    expect(await manager.listActiveLeases()).toEqual([]);
    expect(await manager.inspectIncomplete()).toEqual({ pending: [], reclamation: false });
    expect(await readdir(parent)).toEqual([]);
  });

  it.each(["wrong-version", "malformed"])('preserves corrupt registry bytes (%s)', async (kind) => {
    const rootDir = await mkdtemp(join(tmpdir(), "coord-corruption-"));
    const path = join(rootDir, "coordination", "worktree-lease-registry.json");
    await mkdir(join(rootDir, "coordination"));
    const bytes = JSON.stringify({ schema: kind === "wrong-version" ? "worktree_lease_registry.v99" : "worktree_lease_registry.v0.1", records: 7 });
    await writeFile(path, bytes);
    const manager = await WorktreeLeaseManager.open({ rootDir });
    await expect(manager.acquireLease(request, { holder, now })).rejects.toThrow();
    expect(await readFile(path, "utf8")).toBe(bytes);
  });

  it("compacts superseded heartbeats before replaying a capacity-refused release", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "coord-capacity-"));
    const manager = await WorktreeLeaseManager.open({ rootDir });
    let lease = (await manager.acquireLease(request, { holder, leasePath: join(rootDir, "tree"), now })).lease!;
    for (let n = 1; n <= 4; n += 1) lease = await manager.renewLease(lease, { now: new Date(Date.parse(now) + n * 1000).toISOString() });
    const ledger = await AuditLedger.open({ rootDir, readOnly: true });
    const bytes = (await stat(getStateLedgerPaths(rootDir).ledgerPath)).size;
    const bounded = await WorktreeLeaseManager.open({ rootDir, maxSnapshotBytes: bytes + 50 });
    await expect(bounded.releaseLease(lease, { now: "2026-06-30T00:00:10.000Z" })).rejects.toMatchObject({ code: "snapshot_limit" });
    const pendingId = (await bounded.inspectIncomplete()).pending[0]!.recordId;
    const result = await bounded.retainHistory({ maxAgeMs: 1 }, new Date("2026-06-30T01:00:00Z"));
    expect(result.prunedRecords).toHaveLength(3);
    expect((await bounded.inspectIncomplete()).pending).toEqual([]);
    expect(await bounded.listActiveLeases()).toEqual([]);
    expect((await ledger.listRecords()).at(-1)).toMatchObject({ recordId: pendingId, payload: { release: { cause: "holder_release" } } });
  });

  it("unstages a proven pre-write acquire or renew refusal without losing established ownership", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "coord-prewrite-refusal-"));
    const manager = await WorktreeLeaseManager.open({ rootDir });
    const lease = (await manager.acquireLease(request, { holder, now })).lease!;
    const size = (await stat(getStateLedgerPaths(rootDir).ledgerPath)).size;
    const bounded = await WorktreeLeaseManager.open({ rootDir, maxSnapshotBytes: size + 50 });
    await expect(bounded.acquireLease({ ...request, branchName: "other" }, { holder, now })).rejects.toMatchObject({ code: "snapshot_limit" });
    expect((await bounded.inspectIncomplete()).pending).toEqual([]);
    await expect(bounded.renewLease(lease, { now: "2026-06-30T00:00:01Z" })).rejects.toMatchObject({ code: "snapshot_limit" });
    expect((await bounded.inspectIncomplete()).pending).toEqual([]);
    expect((await bounded.getStoredLeaseRecord(lease.id))?.lease).toEqual(lease);
  });

  it("quarantines an ambiguous payload on its own key while unrelated mutations continue", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "coord-scoped-intent-"));
    const manager = await WorktreeLeaseManager.open({ rootDir });
    fault.boundary = 1;
    await expect(manager.acquireLease(request, { holder, now })).rejects.toThrow("interruption");
    fault.boundary = 0;
    const intent = (await manager.inspectIncomplete()).pending[0]!;
    const ledger = await AuditLedger.open({ rootDir });
    await ledger.store.appendRecord({ kind: "worktree_lease", payload: { ...intent.record.lease, fencingToken: "ambiguous" }, recordId: intent.recordId });
    expect((await manager.acquireLease(request, { holder, now })).acquired).toBe(false);
    expect((await manager.acquireLease({ ...request, branchName: "unrelated" }, { holder, now })).acquired).toBe(true);
    expect((await manager.inspectIncomplete()).pending).toHaveLength(1);
  });

  it("keeps active ownership while pruning closed-holder history and bounds completed-session churn", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "coord-churn-"));
    const manager = await WorktreeLeaseManager.open({ rootDir });
    const ledger = await AuditLedger.open({ rootDir });
    await ledger.store.appendRecord({ kind: "session", recordedAt: now, payload: {
      id: "closed", runtime: "omnigent", targetHarness: "codex", title: "closed", state: "closed", createdAt: now, updatedAt: now,
    } });
    let lease = (await manager.acquireLease(request, { holder, leasePath: join(rootDir, "tree"), now })).lease!;
    lease = await manager.renewLease(lease, { now: "2026-06-30T00:00:01Z" });
    lease = await manager.renewLease(lease, { now: "2026-06-30T00:00:02Z" });
    await manager.retainHistory({ maxAgeMs: 1 }, new Date("2026-06-30T01:00:00Z"));
    expect(await ledger.listRecordsByKind("worktree_lease")).toHaveLength(2);
    await manager.releaseLease(lease, { now: "2026-06-30T01:00:01Z" });
    await manager.retainHistory({ maxAgeMs: 1 }, new Date("2026-06-30T02:00:00Z"));
    expect(await ledger.listRecords()).toEqual([]);
    for (let n = 0; n < 5; n += 1) {
      const acquired = (await manager.acquireLease({ ...request, taskId: "task-" + n }, { holder, now })).lease!;
      await manager.releaseLease(acquired, { now: "2026-06-30T00:01:00Z" });
      await manager.retainHistory({ maxAgeMs: 1 }, new Date("2026-06-30T02:00:00Z"));
    }
    const registry = JSON.parse(await readFile(join(rootDir, "coordination", "worktree-lease-registry.json"), "utf8"));
    expect(registry.records).toEqual({});
    expect(registry.reclaimedThrough).toEqual({});
  });

  it("rolls forward reclamation interrupted after physical compaction", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "coord-reclaim-boundary-"));
    const manager = await WorktreeLeaseManager.open({ rootDir });
    const lease = (await manager.acquireLease(request, { holder, now })).lease!;
    await manager.releaseLease(lease, { now: "2026-06-30T00:01:00Z" });
    const compact = AppendOnlyStore.prototype.compactRecords;
    vi.spyOn(AppendOnlyStore.prototype, "compactRecords").mockImplementationOnce(async function (this: AppendOnlyStore, predicate) {
      await compact.call(this, predicate);
      throw new Error("after physical reclamation");
    });
    await expect(manager.retainHistory({ maxAgeMs: 1 }, new Date("2026-06-30T02:00:00Z"))).rejects.toThrow("after physical");
    expect((await manager.inspectIncomplete()).reclamation).toBe(true);
    await manager.reconcile();
    expect((await manager.inspectIncomplete()).reclamation).toBe(false);
    expect(await manager.getStoredLeaseRecord(lease.id)).toBeUndefined();
  });

  it("rechecks references arriving between proposal and the writer-lock snapshot", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "coord-reclaim-reference-"));
    const manager = await WorktreeLeaseManager.open({ rootDir });
    const lease = (await manager.acquireLease(request, { holder, now })).lease!;
    await manager.releaseLease(lease, { now: "2026-06-30T00:01:00Z" });
    const ledger = await AuditLedger.open({ rootDir });
    const compact = AppendOnlyStore.prototype.compactRecords;
    vi.spyOn(AppendOnlyStore.prototype, "compactRecords").mockImplementationOnce(async function (this: AppendOnlyStore, predicate) {
      await ledger.store.appendRecord({ kind: "session", recordedAt: now, payload: {
        id: "referencing", runtime: "omnigent", targetHarness: "codex", title: "live", state: "idle", createdAt: now, updatedAt: now,
        worktree: { id: lease.id },
      } });
      return compact.call(this, predicate);
    });
    await manager.retainHistory({ maxAgeMs: 1 }, new Date("2026-06-30T02:00:00Z"));
    expect(await manager.getStoredLeaseRecord(lease.id)).toBeDefined();
    expect((await ledger.listRecordsByKind("worktree_lease")).at(-1)?.payload.release).toBeDefined();
  });

  it("does not promote older referenced clean history after reclaiming a newer dirty continuation", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "coord-watermark-"));
    const manager = await WorktreeLeaseManager.open({ rootDir });
    const first = (await manager.acquireLease(request, { holder, now, dirtyState: "clean" })).lease!;
    await manager.releaseLease(first, { now: "2026-06-30T00:01:00Z" });
    const ledger = await AuditLedger.open({ rootDir });
    await ledger.store.appendRecord({ kind: "session", recordedAt: now, payload: {
      id: "referencing", runtime: "omnigent", targetHarness: "codex", title: "live", state: "idle", createdAt: now, updatedAt: now,
      worktree: { id: first.id },
    } });
    const second = (await manager.acquireLease(request, { holder, now: "2026-06-30T00:02:00Z", dirtyState: "dirty" })).lease!;
    await manager.releaseLease(second, { now: "2026-06-30T00:03:00Z" });
    await manager.retainHistory({ maxAgeMs: 1 }, new Date("2026-06-30T02:00:00Z"));
    expect(await manager.getStoredLeaseRecord(second.id)).toBeUndefined();
    expect(await manager.getStoredLeaseRecord(first.id)).toBeDefined();
    const continued = await manager.acquireLease({ ...request, mode: "sequential_continue", allowReuseExisting: true }, { holder, now: "2026-06-30T03:00:00Z" });
    expect(continued.acquired).toBe(false);
    expect(continued.collision?.reason).toBe("sequential_dirty_worktree");
  });
});
