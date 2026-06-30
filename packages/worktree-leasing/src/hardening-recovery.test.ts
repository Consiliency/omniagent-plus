import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  cleanupLeasedWorktree,
  ensureGitWorktree,
  evaluateStaleLeaseRecovery,
  resolveMountedWorkspacePlacement,
  WorktreeLeaseManager,
} from "./index.js";

interface HardeningFixture {
  readonly staleRecovery: {
    readonly allowed: {
      readonly branchMatches: boolean;
      readonly currentDirtyState: "clean" | "dirty";
      readonly currentHost: string;
      readonly holderHost: string;
      readonly leaseDirtyState: "clean" | "dirty";
      readonly leaseExpiresAt: string;
      readonly ledgerEvidencePresent: boolean;
      readonly now: string;
      readonly processState: "alive" | "missing" | "different_host";
      readonly expectedReason: string;
    };
    readonly blockedDirty: {
      readonly branchMatches: boolean;
      readonly currentDirtyState: "clean" | "dirty";
      readonly currentHost: string;
      readonly holderHost: string;
      readonly leaseDirtyState: "clean" | "dirty";
      readonly leaseExpiresAt: string;
      readonly ledgerEvidencePresent: boolean;
      readonly now: string;
      readonly processState: "alive" | "missing" | "different_host";
      readonly expectedReason: string;
    };
  };
  readonly cleanup: {
    readonly branchName: string;
    readonly expectedBlockedReason: string;
    readonly expectedSuccessReason: string;
  };
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
  runGit(repoRoot, ["config", "user.name", "Hardening Test"]);
  runGit(repoRoot, ["config", "user.email", "hardening@example.com"]);
  await writeFile(join(repoRoot, "README.md"), "hardening\n", "utf8");
  runGit(repoRoot, ["add", "README.md"]);
  runGit(repoRoot, ["commit", "-m", "init"]);
  return repoRoot;
}

function readFixture(): HardeningFixture {
  return JSON.parse(
    readFileSync(
      new URL("../../../fixtures/hardening/recovery/worktree-stale-recovery.json", import.meta.url),
      "utf8",
    ),
  ) as HardeningFixture;
}

function buildRecoveryDecisionInput(
  fixture: HardeningFixture["staleRecovery"]["allowed"]
    | HardeningFixture["staleRecovery"]["blockedDirty"],
) {
  return {
    lease: {
      id: "lease-hardening",
      fencingToken: "token-hardening",
      repoId: "omniagent-plus",
      path: "/tmp/lease-hardening",
      branchName: "feature/hardening",
      mode: "exclusive_write" as const,
      holder: {
        processId: 4242,
        host: fixture.holderHost,
      },
      acquiredAt: "2026-06-30T00:00:00.000Z",
      renewedAt: "2026-06-30T00:01:00.000Z",
      expiresAt: fixture.leaseExpiresAt,
      dirtyState: fixture.leaseDirtyState,
    },
    currentHost: fixture.currentHost,
    now: fixture.now,
    processLiveness: {
      state: fixture.processState,
      processId: 4242,
      holderHost: fixture.holderHost,
      currentHost: fixture.currentHost,
      sameHost: fixture.processState !== "different_host",
    },
    dirtyState: fixture.currentDirtyState,
    branchMatches: fixture.branchMatches,
    ledgerEvidencePresent: fixture.ledgerEvidencePresent,
  };
}

async function createLease(branchName: string) {
  const rootDir = await mkdtemp(join(tmpdir(), "worktree-hardening-"));
  const repoRoot = await createRepo(rootDir);
  const placement = await resolveMountedWorkspacePlacement({
    projectName: "omniagent-plus",
    branchName,
    repoRoot,
    fallbackRoot: join(rootDir, "worktrees"),
    workspaceMountExists: false,
  });
  const worktree = await ensureGitWorktree({
    repoRoot,
    targetPath: placement.path,
    branchName,
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
      branchName,
      taskId: "task-hardening",
      mode: "exclusive_write",
      requestedTtlSeconds: 120,
    },
    {
      holder: {
        processId: 4242,
        host: "display",
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

describe("hardening recovery", () => {
  it("allows stale recovery only after ledger, expiry, host, branch, and dirty-state checks pass", () => {
    const fixture = readFixture();
    const allowed = evaluateStaleLeaseRecovery(
      buildRecoveryDecisionInput(fixture.staleRecovery.allowed),
    );
    const blocked = evaluateStaleLeaseRecovery(
      buildRecoveryDecisionInput(fixture.staleRecovery.blockedDirty),
    );

    expect(allowed.reusable).toBe(true);
    expect(allowed.cleanupAllowed).toBe(true);
    expect(allowed.reason).toBe(fixture.staleRecovery.allowed.expectedReason);
    expect(blocked.reusable).toBe(false);
    expect(blocked.cleanupAllowed).toBe(false);
    expect(blocked.reason).toBe(
      fixture.staleRecovery.blockedDirty.expectedReason,
    );
  });

  it("refuses stale cleanup without the active fencing token and only removes clean worktrees after the token matches", async () => {
    const fixture = readFixture();
    const leaseContext = await createLease(fixture.cleanup.branchName);
    const blocked = await cleanupLeasedWorktree(
      leaseContext.manager,
      leaseContext.lease,
      {
        activeFencingToken: "wrong-token",
        currentHost: "display",
        repoRoot: leaseContext.repoRoot,
        worktreePath: leaseContext.worktreePath,
      },
    );
    const cleaned = await cleanupLeasedWorktree(
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

    expect(blocked.deleted).toBe(false);
    expect(blocked.reason).toBe(fixture.cleanup.expectedBlockedReason);
    expect(cleaned.deleted).toBe(true);
    expect(cleaned.reason).toBe(fixture.cleanup.expectedSuccessReason);
  });
});
