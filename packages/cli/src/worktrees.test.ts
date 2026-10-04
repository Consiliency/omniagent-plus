import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, mkdir, writeFile, readFile, rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";
import { AppendOnlyStore } from "@omniagent-plus/state-ledger";

import {
  ensureGitWorktree,
  getCurrentHostIdentity,
  resolveMountedWorkspacePlacement,
  WorktreeLeaseManager,
} from "@omniagent-plus/worktree-leasing";

import { COMMAND_REGISTRY } from "./command-registry.js";
import { executeCli } from "./runtime.js";

function runGit(cwd: string, args: readonly string[]): void {
  const result = spawnSync("git", [...args], {
    cwd,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `git ${args.join(" ")} failed`);
  }
}

async function createRepo(rootDir: string): Promise<string> {
  const repoRoot = join(rootDir, "repo");
  await mkdir(repoRoot, { recursive: true });
  runGit(repoRoot, ["init", "--initial-branch=main"]);
  runGit(repoRoot, ["config", "user.name", "CLI Worktree Test"]);
  runGit(repoRoot, ["config", "user.email", "cli-worktree@example.com"]);
  await writeFile(join(repoRoot, "README.md"), "hello\n", "utf8");
  runGit(repoRoot, ["add", "README.md"]);
  runGit(repoRoot, ["commit", "-m", "init"]);
  return repoRoot;
}

async function createLease(
  processId: number,
  host: string,
): Promise<{
  readonly stateRoot: string;
  readonly leaseId: string;
  readonly managedRoot: string;
  readonly fencingToken: string;
  readonly path: string;
  readonly repoRoot: string;
}> {
  const rootDir = await mkdtemp(join(tmpdir(), "cli-worktrees-"));
  const repoRoot = await createRepo(rootDir);
  const placement = await resolveMountedWorkspacePlacement({
    projectName: "omniagent-plus",
    branchName: "feature/cleanup",
    repoRoot,
    fallbackRoot: join(rootDir, "worktrees"),
    workspaceMountExists: false,
  });
  const worktree = await ensureGitWorktree({
    repoRoot,
    targetPath: placement.path,
    branchName: "feature/cleanup",
    baseRef: "HEAD",
  });
  const stateRoot = join(rootDir, "ledger");
  const manager = await WorktreeLeaseManager.open({
    rootDir: stateRoot,
    managedRoot: dirname(worktree.path),
  });
  const lease = await manager.acquireLease(
    {
      repoId: "omniagent-plus",
      repoRoot,
      baseRef: "main",
      branchName: "feature/cleanup",
      taskId: "task-cleanup",
      mode: "exclusive_write",
      requestedTtlSeconds: 120,
    },
    {
      holder: {
        processId,
        host,
      },
      leasePath: worktree.path,
      dirtyState: "clean",
      now: "2026-06-30T00:00:00.000Z",
    },
  );

  return {
    stateRoot,
    leaseId: lease.lease!.id,
    managedRoot: dirname(worktree.path),
    fencingToken: lease.lease!.fencingToken,
    path: worktree.path,
    repoRoot,
  };
}

function readFixture<T>(name: string): T {
  return JSON.parse(
    readFileSync(
      new URL(`../../../fixtures/cli/worktrees/${name}`, import.meta.url),
      "utf8",
    ),
  ) as T;
}

describe("worktree commands", () => {
  afterEach(() => vi.restoreAllMocks());
  it("reconciles absence without a managed root and refuses deletion without acquisition provenance", async () => {
    const absent = await createLease(2147483647, getCurrentHostIdentity());
    runGit(absent.repoRoot, ["worktree", "remove", absent.path]);
    const ownership = (lease: typeof absent) => ["worktrees", "cleanup", "--lease-id", lease.leaseId, "--state-root", lease.stateRoot,
      "--holder-process-id", "2147483647", "--holder-host", getCurrentHostIdentity(), "--fencing-token", lease.fencingToken, "--json"];
    const reconciled = await executeCli(ownership(absent), COMMAND_REGISTRY);
    expect(reconciled.exitCode).toBe(0);
    expect(JSON.parse(reconciled.stdout).result).toMatchObject({ deleted: false, reconciled: true, reason: "absent_path_reconciled" });
    const legacy = await createLease(2147483647, getCurrentHostIdentity());
    const registryPath = join(legacy.stateRoot, "coordination", "worktree-lease-registry.json");
    const registry = JSON.parse(await readFile(registryPath, "utf8"));
    delete registry.records[legacy.leaseId].managedRoot;
    await writeFile(registryPath, JSON.stringify(registry));
    const denied = await executeCli([...ownership(legacy), "--managed-root", legacy.managedRoot], COMMAND_REGISTRY);
    expect(denied.exitCode).toBe(6);
    expect(JSON.parse(denied.stderr).error.details.result).toMatchObject({ deleted: false, reason: "managed_root_unproven" });
    expect(await readFile(join(legacy.path, "README.md"), "utf8")).toBe("hello\n");
  });
  it("reports actual deletion separately from incomplete release and then reconciles", async () => {
    const lease = await createLease(2147483647, getCurrentHostIdentity());
    vi.spyOn(AppendOnlyStore.prototype, "appendRecord").mockRejectedValueOnce(new Error("synthetic release interruption"));
    const result = await executeCli(["worktrees", "cleanup", "--lease-id", lease.leaseId, "--state-root", lease.stateRoot,
      "--managed-root", lease.managedRoot, "--holder-process-id", "2147483647", "--holder-host", getCurrentHostIdentity(),
      "--fencing-token", lease.fencingToken, "--json"], COMMAND_REGISTRY);
    expect(result.exitCode).toBe(6);
    expect(JSON.parse(result.stderr).error.details.result).toMatchObject({ deleted: true, releaseIncomplete: true, reason: "cleanup_release_incomplete" });
    await expect(readFile(join(lease.path, "README.md"))).rejects.toMatchObject({ code: "ENOENT" });
    const manager = await WorktreeLeaseManager.open({ rootDir: lease.stateRoot });
    await manager.reconcile();
    expect((await manager.getStoredLeaseRecord(lease.leaseId))?.status).toBe("released");
  });
  it("requires independent cleanup ownership and preserves a replacement path", async () => {
    const lease = await createLease(2147483647, getCurrentHostIdentity());
    const missing = await executeCli(["worktrees", "cleanup", "--lease-id", lease.leaseId, "--state-root", lease.stateRoot, "--json"], COMMAND_REGISTRY);
    expect(missing.exitCode).toBe(2);
    await rename(lease.path, lease.path + "-original");
    await mkdir(lease.path);
    await writeFile(join(lease.path, "sentinel"), "preserve");
    const result = await executeCli(["worktrees", "cleanup", "--lease-id", lease.leaseId, "--state-root", lease.stateRoot, "--managed-root", lease.managedRoot, "--holder-process-id", "2147483647", "--holder-host", getCurrentHostIdentity(), "--fencing-token", lease.fencingToken, "--json"], COMMAND_REGISTRY);
    expect(result.exitCode).toBe(6);
    expect(await readFile(join(lease.path, "sentinel"), "utf8")).toBe("preserve");
  });
  it("lists active worktree leases from durable state", async () => {
    const fixture = readFixture<{
      count: number;
      branchName: string;
      mode: string;
      dirtyState: string;
    }>("list.json");
    const lease = await createLease(999999, "display");

    const result = await executeCli(
      ["worktrees", "list", "--state-root", lease.stateRoot, "--json"],
      COMMAND_REGISTRY,
    );
    const parsed = JSON.parse(result.stdout) as {
      readonly result: {
        readonly count: number;
        readonly leases: Array<{
          readonly branchName: string;
          readonly mode: string;
          readonly dirtyState: string;
        }>;
      };
    };

    expect(result.exitCode).toBe(0);
    expect(parsed.result.count).toBe(fixture.count);
    expect(parsed.result.leases[0]).toEqual(
      expect.objectContaining({
        branchName: fixture.branchName,
        mode: fixture.mode,
        dirtyState: fixture.dirtyState,
      }),
    );
  });

  it("cleans stale worktrees and blocks active-process cleanup with typed exit codes", async () => {
    const fixture = readFixture<{
      deleted: boolean;
      reason: string;
    }>("cleanup.json");
    const stale = await createLease(2147483647, getCurrentHostIdentity());
    const cleaned = await executeCli(
      [
        "worktrees",
        "cleanup",
        "--lease-id",
        stale.leaseId,
        "--state-root",
        stale.stateRoot,
        "--managed-root", stale.managedRoot,
        "--holder-process-id", "2147483647",
        "--holder-host", getCurrentHostIdentity(),
        "--fencing-token", stale.fencingToken,
        "--json",
      ],
      COMMAND_REGISTRY,
    );
    const parsed = JSON.parse(cleaned.stdout) as {
      readonly result: {
        readonly deleted: boolean;
        readonly reason: string;
      };
    };

    expect(cleaned.exitCode).toBe(0);
    expect(parsed.result.deleted).toBe(fixture.deleted);
    expect(parsed.result.reason).toBe(fixture.reason);

    const blocked = await createLease(process.pid, "display");
    const blockedResult = await executeCli(
      [
        "worktrees",
        "cleanup",
        "--lease-id",
        blocked.leaseId,
        "--state-root",
        blocked.stateRoot,
        "--managed-root", blocked.managedRoot,
        "--holder-process-id", String(process.pid),
        "--holder-host", "display",
        "--fencing-token", blocked.fencingToken,
        "--json",
      ],
      COMMAND_REGISTRY,
    );
    const blockedEnvelope = JSON.parse(blockedResult.stderr) as {
      readonly error: {
        readonly category: string;
      };
    };

    expect(blockedResult.exitCode).toBe(6);
    expect(blockedEnvelope.error.category).toBe("cleanup_block");
  });
});
