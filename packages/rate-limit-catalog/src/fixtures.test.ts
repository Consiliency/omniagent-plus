import { describe, expect, it } from "vitest";

import {
  classifyFixture,
  loadAllRateLimitFixtures,
  loadHarnessFixtureCatalogs,
  loadNegativeFixtureCatalogs,
  loadProviderFixtureCatalogs,
  loadUnknownFixtureCatalogs,
} from "./fixtures.js";

describe("fixture loader", () => {
  it("loads the full provider and harness corpus", () => {
    expect(loadProviderFixtureCatalogs().map((catalog) => catalog.family)).toEqual([
      "anthropic-api",
      "generic-openai-compatible",
      "google-api",
      "minimax",
      "openai-api",
      "zai",
    ]);
    expect(loadHarnessFixtureCatalogs().map((catalog) => catalog.family)).toEqual([
      "claude-code",
      "codex",
      "gemini-antigravity",
      "opencode",
      "pi",
    ]);
    expect(loadNegativeFixtureCatalogs()).toHaveLength(1);
    expect(loadUnknownFixtureCatalogs()).toHaveLength(1);
    expect(loadAllRateLimitFixtures().length).toBeGreaterThan(10);
  });

  it("classifies loaded fixtures through the correct helper", () => {
    const fixture = loadProviderFixtureCatalogs()[0]?.fixtures[0];

    expect(fixture).toBeTruthy();
    if (!fixture) {
      return;
    }

    const classification = classifyFixture(fixture);
    expect(classification.type).toBe(fixture.expected.type);
  });
});
