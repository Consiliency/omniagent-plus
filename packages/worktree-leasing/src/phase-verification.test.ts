import { readFileSync } from "node:fs";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  evaluateBranchCollision,
  evaluateStaleLeaseRecovery,
  resolveMountedWorkspacePlacement,
  worktreeInterfaceFreezeGate,
} from "./index.js";

function readFixture<T>(path: string): T {
  return JSON.parse(
    readFileSync(new URL(path, import.meta.url), "utf8"),
  ) as T;
}

describe("phase verification", () => {
  it("maps every fixture-backed lock, placement, cleanup, stale recovery, and race case to the frozen WORKTREE gate", async () => {
    const leaseFixture = readFixture<{
      readonly gate: string;
      readonly sequentialContinue: {
        readonly request: {
          readonly repoId: string;
          readonly branchName: string;
          readonly taskId: string;
          readonly mode: "sequential_continue";
          readonly allowReuseExisting: true;
          readonly requestedTtlSeconds: number;
        };
        readonly candidate: {
          readonly taskId: string;
          readonly repoId: string;
          readonly branchName: string;
          readonly path: string;
          readonly dirtyState: "clean";
          readonly branchHeadMatches: true;
        };
      };
    }>("../../../fixtures/worktree/leases/lease-cases.json");
    const placementFixture = readFixture<{
      readonly gate: string;
      readonly mounted: {
        readonly projectName: string;
        readonly branchName: string;
      };
    }>("../../../fixtures/worktree/placement/placement-cases.json");
    const recoveryFixture = readFixture<{
      readonly gate: string;
      readonly cases: Array<{
        readonly name: string;
        readonly holderHost: string;
        readonly currentHost: string;
        readonly processState: "alive" | "missing" | "different_host";
        readonly leaseDirtyState: "clean" | "dirty";
        readonly currentDirtyState: "clean" | "dirty";
        readonly branchMatches: boolean;
        readonly ledgerEvidencePresent: boolean;
        readonly leaseExpiresAt: string;
        readonly now: string;
        readonly expected: {
          readonly reason: string;
        };
      }>;
    }>("../../../fixtures/worktree/recovery/recovery-cases.json");
    const cleanupFixture = readFixture<{
      readonly gate: string;
      readonly cases: Array<{
        readonly expectedReason: string;
      }>;
    }>("../../../fixtures/worktree/cleanup/cleanup-cases.json");
    const raceFixture = readFixture<{
      readonly gate: string;
      readonly resourceId: string;
    }>("../../../fixtures/worktree/races/race-cases.json");

    expect(
      new Set([
        leaseFixture.gate,
        placementFixture.gate,
        recoveryFixture.gate,
        cleanupFixture.gate,
        raceFixture.gate,
      ]),
    ).toEqual(new Set([worktreeInterfaceFreezeGate]));

    const collision = evaluateBranchCollision({
      request: leaseFixture.sequentialContinue.request,
      activeLeases: [],
      previousSequentialCandidate: leaseFixture.sequentialContinue.candidate,
    });
    expect(collision.reason).toBe("sequential_continue_reuses_clean_worktree");

    for (const recoveryCase of recoveryFixture.cases) {
      const decision = evaluateStaleLeaseRecovery({
        lease: {
          id: recoveryCase.name,
          fencingToken: `token-${recoveryCase.name}`,
          repoId: "omniagent-plus",
          path: `/tmp/${recoveryCase.name}`,
          branchName: "feature/worktree",
          mode: "exclusive_write",
          holder: {
            processId: 4242,
            host: recoveryCase.holderHost,
          },
          acquiredAt: "2026-06-30T00:00:00.000Z",
          renewedAt: "2026-06-30T00:01:00.000Z",
          expiresAt: recoveryCase.leaseExpiresAt,
          dirtyState: recoveryCase.leaseDirtyState,
        },
        currentHost: recoveryCase.currentHost,
        now: recoveryCase.now,
        processLiveness: {
          state: recoveryCase.processState,
          processId: 4242,
          holderHost: recoveryCase.holderHost,
          currentHost: recoveryCase.currentHost,
          sameHost: recoveryCase.processState !== "different_host",
        },
        dirtyState: recoveryCase.currentDirtyState,
        branchMatches: recoveryCase.branchMatches,
        ledgerEvidencePresent: recoveryCase.ledgerEvidencePresent,
      });

      expect(decision.reason).toBe(recoveryCase.expected.reason);
    }

    const rootDir = await mkdtemp(join(tmpdir(), "worktree-phase-verify-"));
    const repoRoot = join(rootDir, "repo", "omniagent-plus");
    const mountRoot = join(rootDir, "mnt-workspace");
    await mkdir(repoRoot, { recursive: true });
    await mkdir(join(mountRoot, "worktrees"), { recursive: true });
    const placement = await resolveMountedWorkspacePlacement({
      ...placementFixture.mounted,
      repoRoot,
      workspaceMountRoot: mountRoot,
      workspaceMountExists: true,
    });

    expect(placement.path).toContain("/worktrees/");
    expect(cleanupFixture.cases.map((entry) => entry.expectedReason)).toContain(
      "dirty_worktree",
    );
    expect(raceFixture.resourceId).toContain("race");
  });
});
