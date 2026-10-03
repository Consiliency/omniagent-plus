import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CoordinationStore } from "./coordination.js";
import { getStateLedgerPaths } from "./schema.js";
import { WorktreeLeaseManager } from "../../worktree-leasing/src/lease-manager.js";

const request = { taskId: "task", repoId: "repo", branchName: "feature/legacy", mode: "exclusive_write" as const };
const holder = { processId: process.pid, host: "local" };
const now = "2026-06-30T00:00:00Z";
describe("legacy coordination boundary", () => {
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
