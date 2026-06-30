import { describe, expect, it } from "vitest";

import { loadProviderFixtureCatalogs } from "./fixtures.js";
import { classifyProviderSignal } from "./provider-rules.js";

describe("provider rules", () => {
  it("classifies every provider fixture and records provider-family hints", () => {
    for (const catalog of loadProviderFixtureCatalogs()) {
      for (const fixture of catalog.fixtures) {
        const classification = classifyProviderSignal(fixture.signal);

        expect(classification.type).toBe(fixture.expected.type);
        expect(classification.provider).toBe(fixture.signal.provider);
        expect(classification.notes?.join(" ")).toContain(
          "Provider-family hint:",
        );
      }
    }
  });
});
