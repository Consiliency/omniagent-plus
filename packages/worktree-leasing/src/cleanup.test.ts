import { spawnSync } from "node:child_process";
import { accessSync, constants, readFileSync } from "node:fs";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  cleanupLeasedWorktree,
  ensureGitWorktree,
  resolveMountedWorkspacePlacement,
  WorktreeLeaseManager,
} from "./index.js";

interface CleanupFixture {
  readonly cases: Array<{
    readonly name: string;
    readonly expectedReason: string;
  }>;
}

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
  runGit(repoRoot, ["config", "user.name", "Cleanup Test"]);
  runGit(repoRoot, ["config", "user.email", "cleanup@example.com"]);
  await writeFile(join(repoRoot, "README.md"), "hello\n", "utf8");
  runGit(repoRoot, ["add", "README.md"]);
  runGit(repoRoot, ["commit", "-m", "init"]);
  return repoRoot;
}

function readFixture(): CleanupFixture {
  return JSON.parse(
    readFileSync(
      new URL("../../../fixtures/worktree/cleanup/cleanup-cases.json", import.meta.url),
      "utf8",
    ),
  ) as CleanupFixture;
}

async function createLease(mode: "exclusive_write" | "read_only" = "exclusive_write") {
  const rootDir = await mkdtemp(join(tmpdir(), "worktree-cleanup-"));
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
  const manager = await WorktreeLeaseManager.open({
    rootDir: join(rootDir, "ledger"),
  });
  const leaseResult = await manager.acquireLease(
    {
      repoId: "omniagent-plus",
      repoRoot,
      baseRef: "main",
      branchName: "feature/cleanup",
      taskId: "task-cleanup",
      mode,
      requestedTtlSeconds: 120,
    },
    {
      holder: {
        processId: 4242,
        host: "display",
        sessionId: "session-cleanup",
        turnId: "turn-cleanup-1",
      },
      leasePath: worktree.path,
      dirtyState: "clean",
      now: "2026-06-30T00:00:00.000Z",
    },
  );

  return {
    manager,
    lease: leaseResult.lease!,
    repoRoot,
    worktreePath: worktree.path,
  };
}

describe("cleanup", () => {
  it("refuses mismatched-token, dirty, unknown, active-process, different-host, branch-divergent, and read-only cleanup attempts", async () => {
    const fixture = readFixture();
    const blockedReasons = new Set<string>();

    const mismatch = await createLease();
    blockedReasons.add(
      (
        await cleanupLeasedWorktree(mismatch.manager, mismatch.lease, {
          activeFencingToken: "wrong-token",
          currentHost: "display",
          repoRoot: mismatch.repoRoot,
          worktreePath: mismatch.worktreePath,
        })
      ).reason,
    );

    const dirty = await createLease();
    blockedReasons.add(
      (
        await cleanupLeasedWorktree(dirty.manager, dirty.lease, {
          activeFencingToken: dirty.lease.fencingToken,
          currentHost: "display",
          dirtyState: "dirty",
          repoRoot: dirty.repoRoot,
          worktreePath: dirty.worktreePath,
        })
      ).reason,
    );

    const unknown = await createLease();
    blockedReasons.add(
      (
        await cleanupLeasedWorktree(unknown.manager, unknown.lease, {
          activeFencingToken: unknown.lease.fencingToken,
          currentHost: "display",
          dirtyState: "unknown",
          repoRoot: unknown.repoRoot,
          worktreePath: unknown.worktreePath,
        })
      ).reason,
    );

    const active = await createLease();
    blockedReasons.add(
      (
        await cleanupLeasedWorktree(active.manager, active.lease, {
          activeFencingToken: active.lease.fencingToken,
          currentHost: "display",
          processLiveness: {
            state: "alive",
            processId: active.lease.holder.processId,
            holderHost: "display",
            currentHost: "display",
            sameHost: true,
          },
          repoRoot: active.repoRoot,
          worktreePath: active.worktreePath,
        })
      ).reason,
    );

    const differentHost = await createLease();
    blockedReasons.add(
      (
        await cleanupLeasedWorktree(differentHost.manager, differentHost.lease, {
          activeFencingToken: differentHost.lease.fencingToken,
          currentHost: "display",
          processLiveness: {
            state: "different_host",
            processId: differentHost.lease.holder.processId,
            holderHost: "remote-host",
            currentHost: "display",
            sameHost: false,
          },
          repoRoot: differentHost.repoRoot,
          worktreePath: differentHost.worktreePath,
        })
      ).reason,
    );

    const branchDiverged = await createLease();
    blockedReasons.add(
      (
        await cleanupLeasedWorktree(branchDiverged.manager, branchDiverged.lease, {
          activeFencingToken: branchDiverged.lease.fencingToken,
          currentHost: "display",
          processLiveness: {
            state: "missing",
            processId: branchDiverged.lease.holder.processId,
            holderHost: "display",
            currentHost: "display",
            sameHost: true,
          },
          branchMatches: false,
          repoRoot: branchDiverged.repoRoot,
          worktreePath: branchDiverged.worktreePath,
        })
      ).reason,
    );

    const readOnly = await createLease("read_only");
    blockedReasons.add(
      (
        await cleanupLeasedWorktree(readOnly.manager, readOnly.lease, {
          activeFencingToken: readOnly.lease.fencingToken,
          currentHost: "display",
          processLiveness: {
            state: "missing",
            processId: readOnly.lease.holder.processId,
            holderHost: "display",
            currentHost: "display",
            sameHost: true,
          },
          repoRoot: readOnly.repoRoot,
          worktreePath: readOnly.worktreePath,
        })
      ).reason,
    );

    expect(blockedReasons).toEqual(
      new Set(fixture.cases.map((entry) => entry.expectedReason)),
    );
  });

  it("removes clean stale worktrees only when the active fencing token still matches", async () => {
    const leaseContext = await createLease();
    const result = await cleanupLeasedWorktree(
      leaseContext.manager,
      leaseContext.lease,
      {
        activeFencingToken: leaseContext.lease.fencingToken,
        currentHost: "display",
        processLiveness: {
          state: "missing",
          processId: leaseContext.lease.holder.processId,
          holderHost: "display",
          currentHost: "display",
          sameHost: true,
        },
        branchMatches: true,
        repoRoot: leaseContext.repoRoot,
        worktreePath: leaseContext.worktreePath,
      },
    );

    expect(result.deleted).toBe(true);
    expect(result.reason).toBe("cleanup_complete");
    expect(() =>
      accessSync(leaseContext.worktreePath, constants.F_OK),
    ).toThrow();
  });
});
