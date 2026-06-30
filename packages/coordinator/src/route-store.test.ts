import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { AuditLedger } from "@omniagent-plus/state-ledger";

import { listPersistedRouteDecisions, persistRouteDecision } from "./index.js";

describe("route store", () => {
  it("persists sanitized route decisions through the audit ledger", async () => {
    const ledger = await AuditLedger.open({
      rootDir: await mkdtemp(join(tmpdir(), "coordinator-route-store-")),
    });

    const persisted = await persistRouteDecision(ledger, {
      schema: "route_decision.v0.1",
      taskId: "task-1",
      selectedProvider: "google",
      selectedHarness: "codex",
      selectedIdentityProfileId: "profile-google-primary",
      preferredProvider: "openai",
      preferredHarness: "codex",
      preferredTarget: {
        provider: "openai",
        harness: "codex",
        identityProfileId: "profile-openai-primary",
      },
      fallbackUsed: true,
      fallbackReason: "fixed_window_usage_cap",
      capabilityFit: 0.96,
      providerHealth: 0.91,
      currentCapacity: 0.67,
      contextPortability: "high",
      portabilityScore: 0.9,
      activeTurnTarget: 2,
      cooldownState: {
        providerFamilyBlocked: false,
        identityBlocked: false,
        sameProviderAccountSwitch: "forbidden",
      },
      launchGate: {
        action: "allowed",
        reason: "  persisted before launch  ",
        routeDecisionPersisted: false,
        labelsMatch: true,
        manualConfirmationProvided: false,
      },
      routeReason: "provider_cooldown",
      silentDowngrade: false,
      evidenceRefs: [
        {
          kind: "test",
          label: "  coordinator route proof  ",
          path: "./fixtures/coordinator/routing/fallback-cross-provider.json",
          excerpt: "  metadata_only replay-safe explanation  ",
        },
      ],
    });

    const stored = await listPersistedRouteDecisions(ledger, "task-1");

    expect(persisted.launchGate?.routeDecisionPersisted).toBe(true);
    expect(persisted.evidenceRefs?.[0]).toEqual({
      kind: "test",
      label: "coordinator route proof",
      path: "fixtures/coordinator/routing/fallback-cross-provider.json",
      excerpt: "metadata_only replay-safe explanation",
    });
    expect(stored).toEqual([persisted]);
  });
});
