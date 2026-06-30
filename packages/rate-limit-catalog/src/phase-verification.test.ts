import { describe, expect, it } from "vitest";

import {
  classifyFixture,
  loadHarnessFixtureCatalogs,
  loadNegativeFixtureCatalogs,
  loadProviderFixtureCatalogs,
  loadUnknownFixtureCatalogs,
} from "./fixtures.js";
import type { RateLimitFixture } from "./types.js";

const allowedSameProviderSwitchValues = new Set([
  "forbidden",
  "manual_confirmation_required",
  "allowed_by_policy",
]);

function expectFixtureMatch(fixture: RateLimitFixture): void {
  const classification = classifyFixture(fixture);

  expect(classification.type).toBe(fixture.expected.type);
  expect(classification.scope).toBe(fixture.expected.scope);

  if (fixture.expected.retryAfterSeconds !== undefined) {
    expect(classification.retryAfterSeconds).toBe(
      fixture.expected.retryAfterSeconds,
    );
  }

  if (fixture.expected.resetAt !== undefined) {
    expect(classification.resetAt).toBe(fixture.expected.resetAt);
  }

  if (fixture.expected.confidenceMin !== undefined) {
    expect(classification.confidence).toBeGreaterThanOrEqual(
      fixture.expected.confidenceMin,
    );
  }

  if (fixture.expected.sameProviderAccountSwitch !== undefined) {
    expect(classification.routingAction.sameProviderAccountSwitch).toBe(
      fixture.expected.sameProviderAccountSwitch,
    );
  }

  expect(
    allowedSameProviderSwitchValues.has(
      classification.routingAction.sameProviderAccountSwitch,
    ),
  ).toBe(true);
}

describe("phase verification", () => {
  it("maps every fixture to an expected LimitClassification and bounds sameProviderAccountSwitch", () => {
    const catalogs = [
      ...loadProviderFixtureCatalogs(),
      ...loadHarnessFixtureCatalogs(),
      ...loadNegativeFixtureCatalogs(),
      ...loadUnknownFixtureCatalogs(),
    ];

    for (const catalog of catalogs) {
      for (const fixture of catalog.fixtures) {
        expectFixtureMatch(fixture);
      }
    }
  });
});
