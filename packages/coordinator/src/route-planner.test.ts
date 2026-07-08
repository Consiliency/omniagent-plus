import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { buildIdentityPool, planRoute } from "./index.js";

interface RoutingFixture {
  readonly poolInput: Parameters<typeof buildIdentityPool>[0];
  readonly preferred: {
    readonly provider: string;
    readonly harness: string;
    readonly identityProfileId: string;
  };
}

function readRoutingFixture(): RoutingFixture {
  return JSON.parse(
    readFileSync(
      new URL(
        "../../../fixtures/coordinator/routing/fallback-cross-provider.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ) as RoutingFixture;
}

describe("route planner", () => {
  it("routes high-portability work to another provider family when policy allows", () => {
    const fixture = readRoutingFixture();
    const identityPool = buildIdentityPool(fixture.poolInput);

    const planned = planRoute({
      taskId: "task-high-portability",
      identityPool,
      preferredProvider: "openai",
      preferredHarness: "codex",
      preferredIdentityProfileId: fixture.preferred.identityProfileId,
      latestClassification: fixture.poolInput.classificationByProvider?.openai,
      capabilityFitByProfileId: fixture.poolInput.capabilityFitByProfileId,
      providerHealth: fixture.poolInput.providerHealth,
      portabilityInput: {
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
      },
      evidenceRefs: [
        {
          kind: "test",
          label: "fallback-cross-provider",
          path: "fixtures/coordinator/routing/fallback-cross-provider.json",
        },
      ],
    });

    expect(planned.candidate.profile.id).toBe("profile-google-primary");
    expect(planned.decision.selectedProvider).toBe("google");
    expect(planned.decision.fallbackUsed).toBe(true);
    expect(planned.decision.fallbackReason).toBe("fixed_window_usage_cap");
    expect(planned.decision.contextPortability).toBe("high");
    expect(planned.decision.launchGate?.action).toBe("allowed");
  });

  it("waits for reset when the preferred provider is blocked and portability is low", () => {
    const fixture = readRoutingFixture();
    const identityPool = buildIdentityPool(fixture.poolInput);

    const planned = planRoute({
      taskId: "task-low-portability",
      identityPool,
      preferredProvider: "openai",
      preferredHarness: "codex",
      preferredIdentityProfileId: fixture.preferred.identityProfileId,
      latestClassification: fixture.poolInput.classificationByProvider?.openai,
      capabilityFitByProfileId: fixture.poolInput.capabilityFitByProfileId,
      providerHealth: fixture.poolInput.providerHealth,
      portabilityInput: {
        sessionContinuation: true,
        rawHistoryAttached: true,
        localFilesystemDependency: true,
        allowCrossProviderMigration: false,
      },
    });

    expect(planned.candidate.profile.id).toBe("profile-openai-primary");
    expect(planned.decision.fallbackUsed).toBe(false);
    expect(planned.decision.contextPortability).toBe("low");
    expect(planned.decision.launchGate?.action).toBe("wait_for_reset");
  });

  it("blocks unavailable hard coordination but allows unavailable soft coordination", () => {
    const fixture = readRoutingFixture();
    const identityPool = buildIdentityPool(fixture.poolInput);
    const scope = {
      granularity: "path-set" as const,
      selector: ["packages/coordinator"],
    };

    const hard = planRoute({
      taskId: "task-hard-coordination",
      identityPool,
      preferredIdentityProfileId: "profile-google-primary",
      leaseArbitration: {
        status: "coordination_unavailable",
        mode: "hard",
        holder: "holder-a",
        scope,
      },
    });
    const soft = planRoute({
      taskId: "task-soft-coordination",
      identityPool,
      preferredIdentityProfileId: "profile-google-primary",
      leaseArbitration: {
        status: "coordination_unavailable",
        mode: "soft",
        holder: "holder-a",
        scope,
      },
    });

    expect(hard.decision.launchGate?.action).toBe("blocked");
    expect(soft.decision.launchGate?.action).toBe("allowed");
  });
});
