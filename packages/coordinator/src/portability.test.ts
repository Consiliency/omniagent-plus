import { describe, expect, it } from "vitest";

import { scoreTaskPortability } from "./index.js";

describe("portability scoring", () => {
  it("allows high-portability work to migrate across providers", () => {
    const score = scoreTaskPortability({
      sessionContinuation: false,
      handoffEvidence: true,
      worktreeLease: {
        id: "lease-1",
        fencingToken: "token-1",
        repoId: "ViperJuice/omniagent-plus",
        path: "/mnt/workspace/worktrees/omniagent-plus-main",
        branchName: "main",
        mode: "exclusive_write",
        holder: {
          processId: 1234,
          host: "local",
        },
        acquiredAt: "2026-06-30T00:00:00.000Z",
        renewedAt: "2026-06-30T00:00:00.000Z",
        expiresAt: "2026-06-30T01:00:00.000Z",
        dirtyState: "clean",
      },
      allowCrossProviderMigration: true,
    });

    expect(score.level).toBe("high");
    expect(score.migrateAcrossProviders).toBe(true);
    expect(score.score).toBeGreaterThanOrEqual(0.75);
  });

  it("keeps low-portability work on the current provider by default", () => {
    const score = scoreTaskPortability({
      sessionContinuation: true,
      handoffEvidence: false,
      rawHistoryAttached: true,
      localFilesystemDependency: true,
      allowCrossProviderMigration: false,
    });

    expect(score.level).toBe("low");
    expect(score.migrateAcrossProviders).toBe(false);
    expect(score.score).toBeLessThan(0.4);
  });
});
