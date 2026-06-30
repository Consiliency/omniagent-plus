import { describe, expect, it } from "vitest";

import { deriveProviderFamilyCooldown, evaluateCooldownState } from "./index.js";

describe("cooldown policy", () => {
  it("derives provider-family cooldowns from hard usage caps", () => {
    const cooldown = deriveProviderFamilyCooldown(
      {
        schema: "limit_classification.v0.1",
        type: "fixed_window_usage_cap",
        scope: "provider_family",
        confidence: 0.99,
        provider: "openai",
        harness: "codex",
        resetAt: "2026-07-01T09:00:00.000Z",
        rawSignal: {
          statusCode: 429,
        },
        routingAction: {
          retrySameSession: false,
          reduceConcurrency: true,
          routeNewWorkElsewhere: true,
          migrateExistingPortableWork: true,
          requireManualReview: false,
          sameProviderAccountSwitch: "manual_confirmation_required",
        },
      },
      "2026-06-30T09:00:00.000Z",
    );

    expect(cooldown).toEqual({
      schema: "provider_family_cooldown.v0.1",
      provider: "openai",
      scope: "provider_family",
      active: true,
      reason: "fixed_window_usage_cap",
      observedAt: "2026-06-30T09:00:00.000Z",
      resetAt: "2026-07-01T09:00:00.000Z",
      source: "limit_classification",
    });
  });

  it("merges provider and identity cooldown state without allowing same-provider hopping", () => {
    const cooldownState = evaluateCooldownState({
      profile: {
        id: "profile-openai-primary",
        provider: "openai",
        harness: "codex",
        authMode: "local_subscription",
        isolation: "isolated_home",
        maxOpenSessions: 2,
        maxActiveTurns: 3,
      },
      status: {
        schema: "identity_profile_status.v0.1",
        profileId: "profile-openai-primary",
        provider: "openai",
        harness: "codex",
        status: "cooldown",
        checkedAt: "2026-06-30T09:01:00.000Z",
        activeSessions: 0,
        activeTurns: 0,
        reason: "fixed_window_usage_cap",
        cooldown: {
          active: true,
          reason: "fixed_window_usage_cap",
          resetAt: "2026-07-01T09:00:00.000Z",
        },
      },
      providerCooldown: {
        schema: "provider_family_cooldown.v0.1",
        provider: "openai",
        scope: "provider_family",
        active: true,
        reason: "fixed_window_usage_cap",
        observedAt: "2026-06-30T09:00:00.000Z",
        resetAt: "2026-07-01T09:00:00.000Z",
        source: "limit_classification",
      },
      classification: {
        schema: "limit_classification.v0.1",
        type: "fixed_window_usage_cap",
        scope: "provider_family",
        confidence: 0.99,
        provider: "openai",
        harness: "codex",
        rawSignal: {
          statusCode: 429,
        },
        routingAction: {
          retrySameSession: false,
          reduceConcurrency: true,
          routeNewWorkElsewhere: true,
          migrateExistingPortableWork: true,
          requireManualReview: false,
          sameProviderAccountSwitch: "manual_confirmation_required",
        },
      },
    });

    expect(cooldownState.blocked).toBe(true);
    expect(cooldownState.providerFamilyBlocked).toBe(true);
    expect(cooldownState.identityBlocked).toBe(true);
    expect(cooldownState.sameProviderAccountSwitch).toBe(
      "manual_confirmation_required",
    );
    expect(cooldownState.resetAt).toBe("2026-07-01T09:00:00.000Z");
  });
});
