import { describe, expect, it } from "vitest";

import {
  classifyFixture,
  loadNegativeFixtureCatalogs,
  loadUnknownFixtureCatalogs,
} from "./fixtures.js";

describe("negative fixtures", () => {
  it("keeps non-limit 429s, auth failures, policy blocks, and outages out of quota and burst buckets", () => {
    const fixtures = loadNegativeFixtureCatalogs().flatMap(
      (catalog) => catalog.fixtures,
    );

    for (const fixture of fixtures) {
      const classification = classifyFixture(fixture);
      expect(classification.type).toBe(fixture.expected.type);

      if (fixture.id === "non-limit-429-validation") {
        expect([
          "burst_rate_limit",
          "fixed_window_usage_cap",
          "monthly_spend_or_quota_cap",
        ]).not.toContain(classification.type);
      }
    }
  });

  it("maps malformed or low-confidence limit-like signals to unknown_limit", () => {
    const fixtures = loadUnknownFixtureCatalogs().flatMap(
      (catalog) => catalog.fixtures,
    );

    for (const fixture of fixtures) {
      const classification = classifyFixture(fixture);
      expect(classification.type).toBe("unknown_limit");
      expect([
        "burst_rate_limit",
        "fixed_window_usage_cap",
        "monthly_spend_or_quota_cap",
      ]).not.toContain(classification.type);
    }
  });
});
