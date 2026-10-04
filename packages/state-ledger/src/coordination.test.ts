import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CoordinationStore } from "./coordination.js";
import { getStateLedgerPaths } from "./schema.js";
import { WorktreeLeaseManager } from "../../worktree-leasing/src/lease-manager.js";
import { getCurrentHostIdentity, checkProcessLiveness } from "../../worktree-leasing/src/process-liveness.js";

const request = { taskId: "task", repoId: "repo", branchName: "feature/legacy", mode: "exclusive_write" as const };
const holder = { processId: process.pid, host: "local" };
const now = "2026-06-30T00:00:00Z";
describe("legacy coordination boundary", () => {
  it("documents permanent expired legacy ownership and starts COORD only on a fresh disjoint root", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "coord-legacy-retained-"));
    const store = await CoordinationStore.open({ rootDir });
    const dead = { processId: 2147483647, host: getCurrentHostIdentity() };
    expect(checkProcessLiveness({ processId: dead.processId, holderHost: dead.host }).state).toBe("missing");
    const first = await store.acquireExclusiveLease({ ...request, repoRoot: join(rootDir, "legacy-path") }, dead, { now, ttlSeconds: 1 });
    const before = await readFile(getStateLedgerPaths(rootDir).worktreeLeasesPath);
    expect((await store.acquireExclusiveLease({ ...request, repoRoot: join(rootDir, "legacy-path"), branchName: "other" }, dead, { now: "2026-07-01T00:00:00Z" })).acquired).toBe(false);
    expect((await store.listActiveLeases())[0]?.id).toBe(first.lease?.id);
    const blocked = await WorktreeLeaseManager.open({ rootDir });
    await expect(blocked.acquireLease(request, { holder: dead, now })).rejects.toMatchObject({ code: "legacy_lease_conflict" });
    expect(await readFile(getStateLedgerPaths(rootDir).worktreeLeasesPath)).toEqual(before);
    const freshRoot = await mkdtemp(join(tmpdir(), "coord-fresh-root-"));
    const manager = await WorktreeLeaseManager.open({ rootDir: freshRoot });
    expect((await manager.acquireLease(request, { holder: dead, now, leasePath: join(freshRoot, "disjoint-tree") })).acquired).toBe(true);
    expect(await readFile(getStateLedgerPaths(rootDir).worktreeLeasesPath)).toEqual(before);
  });
  it.each(["prototype", "mismatched-key"])("preserves unsupported legacy identifier maps (%s)", async (kind) => {
    const rootDir = await mkdtemp(join(tmpdir(), "coord-legacy-keys-"));
    const store = await CoordinationStore.open({ rootDir });
    const acquired = await store.acquireExclusiveLease(request, holder, { now });
    const path = getStateLedgerPaths(rootDir).worktreeLeasesPath;
    const bytes = JSON.stringify({ [kind === "prototype" ? "__proto__" : "wrong-key"]: acquired.lease });
    await writeFile(path, bytes);
    await expect(store.listActiveLeases()).rejects.toThrow();
    await expect(store.acquireExclusiveLease(request, holder)).rejects.toThrow();
    expect(await readFile(path, "utf8")).toBe(bytes);
  });
  it("denies physical acquisition on a COORD-managed root before changing state", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "coord-legacy-deny-"));
    const manager = await WorktreeLeaseManager.open({ rootDir });
    await manager.acquireLease(request, { holder, now, leasePath: join(rootDir, "tree") });
    const store = await CoordinationStore.open({ rootDir });
    const paths = getStateLedgerPaths(rootDir);
    const before = await Promise.all([readFile(paths.worktreeLeasesPath), readFile(paths.ledgerPath)]);
    await expect(store.acquireExclusiveLease({ ...request, branchName: "other" }, holder)).rejects.toThrow("COORD-managed");
    expect(await Promise.all([readFile(paths.worktreeLeasesPath), readFile(paths.ledgerPath)])).toEqual(before);
  });
  it("does not overwrite a standalone legacy owner when COORD starts later", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "coord-legacy-first-"));
    const store = await CoordinationStore.open({ rootDir });
    const first = await store.acquireExclusiveLease(request, holder, { now, ttlSeconds: 1 });
    const manager = await WorktreeLeaseManager.open({ rootDir });
    await expect(manager.acquireLease(request, { holder, now: "2026-06-30T01:00:00Z" })).rejects.toMatchObject({ code: "legacy_lease_conflict" });
    expect((await store.listActiveLeases())[0]?.id).toBe(first.lease?.id);
  });
  it("keeps live or uncertain ownership after TTL and rejects cross-mode/path collisions", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "coord-legacy-collision-"));
    const store = await CoordinationStore.open({ rootDir });
    const path = join(rootDir, "tree");
    const first = await store.acquireExclusiveLease(request, holder, { now, ttlSeconds: 1, leasePath: path });
    const byBranch = await store.acquireExclusiveLease({ ...request, mode: "read_only" }, holder, { now: "2026-06-30T01:00:00Z", leasePath: join(rootDir, "other") });
    const byPath = await store.acquireExclusiveLease({ ...request, repoId: "other", branchName: "other" }, holder, { now: "2026-06-30T01:00:00Z", leasePath: path });
    expect(byBranch).toMatchObject({ acquired: false, existingLease: { id: first.lease!.id } });
    expect(byPath.acquired).toBe(false);
  });
  it.each(["leases", "cooldowns"])("rejects and preserves malformed %s instead of treating it as empty", async (kind) => {
    const rootDir = await mkdtemp(join(tmpdir(), "coord-legacy-corrupt-"));
    const store = await CoordinationStore.open({ rootDir });
    const paths = getStateLedgerPaths(rootDir);
    const path = kind === "leases" ? paths.worktreeLeasesPath : paths.cooldownsPath;
    const bytes = JSON.stringify({ constructor: { invalid: true } });
    await writeFile(path, bytes);
    if (kind === "leases") await expect(store.acquireExclusiveLease(request, holder)).rejects.toThrow();
    else await expect(store.getProviderCooldown("constructor")).rejects.toThrow();
    expect(await readFile(path, "utf8")).toBe(bytes);
  });
});
