import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { evaluateBranchCollision } from "./index.js";

interface BranchFixture {
  readonly exclusiveWrite: {
    readonly request: {
      readonly repoId: string;
      readonly branchName: string;
      readonly taskId: string;
      readonly mode: "exclusive_write";
      readonly requestedTtlSeconds: number;
    };
  };
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
}

function readFixture(): BranchFixture {
  return JSON.parse(
    readFileSync(
      new URL("../../../fixtures/worktree/leases/lease-cases.json", import.meta.url),
      "utf8",
    ),
  ) as BranchFixture;
}

describe("branch collision policy", () => {
  it("fails closed for branch collisions and allows explicit clean sequential continuation reuse", () => {
    const fixture = readFixture();
    const blocked = evaluateBranchCollision({
      request: fixture.exclusiveWrite.request,
      activeLeases: [
        {
          id: "lease-active",
          fencingToken: "token-active",
          repoId: fixture.exclusiveWrite.request.repoId,
          path: "/tmp/worktree-active",
          branchName: fixture.exclusiveWrite.request.branchName,
          mode: "exclusive_write",
          holder: {
            processId: 1,
            host: "display",
          },
          acquiredAt: "2026-06-30T00:00:00.000Z",
          renewedAt: "2026-06-30T00:00:00.000Z",
          expiresAt: "2026-06-30T00:10:00.000Z",
          dirtyState: "clean",
        },
      ],
    });
    const allowed = evaluateBranchCollision({
      request: fixture.sequentialContinue.request,
      activeLeases: [],
      previousSequentialCandidate: fixture.sequentialContinue.candidate,
    });

    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toBe("branch_collision_active_lease");
    expect(allowed.allowed).toBe(true);
    expect(allowed.reason).toBe("sequential_continue_reuses_clean_worktree");
    expect(allowed.reusePath).toBe(fixture.sequentialContinue.candidate.path);
  });
});
