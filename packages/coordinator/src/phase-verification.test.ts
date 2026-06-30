import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import * as coordinator from "./index.js";
import {
  buildIdentityPool,
  evaluateFailurePolicy,
  planRoute,
  replayTaskRouting,
} from "./index.js";

interface RoutingFixture {
  readonly poolInput: Parameters<typeof buildIdentityPool>[0];
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

describe("phase verification", () => {
  it("covers the public coordinator surface and frozen gate", async () => {
    const routingFixture = readRoutingFixture();
    const classification = routingFixture.poolInput.classificationByProvider
      ?.openai;
    if (classification === undefined) {
      throw new Error("routing fixture is missing the openai classification");
    }

    const pool = buildIdentityPool(routingFixture.poolInput);
    const route = planRoute({
      taskId: "phase-verification",
      identityPool: pool,
      preferredProvider: "openai",
      preferredHarness: "codex",
      preferredIdentityProfileId: "profile-openai-primary",
      latestClassification: classification,
      providerHealth: routingFixture.poolInput.providerHealth,
      capabilityFitByProfileId: routingFixture.poolInput.capabilityFitByProfileId,
      portabilityInput: {
        handoffEvidence: true,
        allowCrossProviderMigration: true,
      },
    });
    const failure = evaluateFailurePolicy({
      observedAt: "2026-06-30T11:00:00.000Z",
      failure: {
        schema: "runtime_failure.v0.1",
        actor: "provider",
        category: "rate_limit",
        message: "Daily cap reached",
        retryable: false,
        scope: "provider_family",
      },
      classification,
      repeatedFailures: 1,
    });
    const docs = readFileSync(
      new URL("../../../docs/coordinator-routing.md", import.meta.url),
      "utf8",
    );

    expect(coordinator.coordinatorInterfaceFreezeGate).toBe(
      "IF-0-COORDINATOR-9",
    );
    expect(route.decision.launchGate?.routeDecisionPersisted).toBe(false);
    expect(route.decision.silentDowngrade).toBe(false);
    expect(failure.action).toBe("pause_provider_family");
    expect(docs).toContain("metadata_only");
    expect(docs).toContain("persisted before launch");
    expect("sanitizeMetadataText" in coordinator).toBe(false);
    expect(typeof replayTaskRouting).toBe("function");
  });
});
