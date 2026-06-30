import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { evaluateStaleLeaseRecovery } from "./index.js";

interface RecoveryFixture {
  readonly cases: Array<{
    readonly name: string;
    readonly currentHost: string;
    readonly holderHost: string;
    readonly processState: "alive" | "missing" | "different_host";
    readonly leaseDirtyState: "clean" | "dirty";
    readonly currentDirtyState: "clean" | "dirty";
    readonly branchMatches: boolean;
    readonly ledgerEvidencePresent: boolean;
    readonly leaseExpiresAt: string;
    readonly now: string;
    readonly expected: {
      readonly reusable: boolean;
      readonly cleanupAllowed: boolean;
      readonly reason: string;
    };
  }>;
}

function readFixture(): RecoveryFixture {
  return JSON.parse(
    readFileSync(
      new URL("../../../fixtures/worktree/recovery/recovery-cases.json", import.meta.url),
      "utf8",
    ),
  ) as RecoveryFixture;
}

describe("stale recovery", () => {
  it("requires process, host, dirty-state, branch, expiration, and ledger checks before reuse or cleanup", () => {
    const fixture = readFixture();

    for (const recoveryCase of fixture.cases) {
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

      expect(decision.reusable).toBe(recoveryCase.expected.reusable);
      expect(decision.cleanupAllowed).toBe(
        recoveryCase.expected.cleanupAllowed,
      );
      expect(decision.reason).toBe(recoveryCase.expected.reason);
    }
  });
});
