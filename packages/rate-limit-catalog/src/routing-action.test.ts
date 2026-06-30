import { describe, expect, it } from "vitest";

import { createRoutingActionForLimitType } from "./routing-action.js";

describe("routing action matrix", () => {
  it("keeps hard caps out of burst-style retry behavior", () => {
    const burst = createRoutingActionForLimitType("burst_rate_limit");
    const quota = createRoutingActionForLimitType("monthly_spend_or_quota_cap");

    expect(burst.retrySameSession).toBe(true);
    expect(quota.retrySameSession).toBe(false);
    expect(quota.routeNewWorkElsewhere).toBe(true);
    expect(quota.sameProviderAccountSwitch).toBe(
      "manual_confirmation_required",
    );
  });

  it("allows explicit policy overrides for sameProviderAccountSwitch only through the frozen enum", () => {
    const action = createRoutingActionForLimitType("fixed_window_usage_cap", {
      sameProviderAccountSwitch: "allowed_by_policy",
    });

    expect(action.sameProviderAccountSwitch).toBe("allowed_by_policy");
  });
});
