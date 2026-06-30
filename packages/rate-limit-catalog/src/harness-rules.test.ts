import { describe, expect, it } from "vitest";

import { loadHarnessFixtureCatalogs } from "./fixtures.js";
import { classifyHarnessSignal } from "./harness-rules.js";

describe("harness rules", () => {
  it("classifies every harness fixture and records harness hints", () => {
    for (const catalog of loadHarnessFixtureCatalogs()) {
      for (const fixture of catalog.fixtures) {
        const classification = classifyHarnessSignal(fixture.signal);

        expect(classification.type).toBe(fixture.expected.type);
        expect(classification.harness).toBe(fixture.signal.harness);
        expect(classification.notes?.join(" ")).toContain("Harness hint:");
      }
    }
  });
});
