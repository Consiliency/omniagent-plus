import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

interface ReadinessFixture {
  readonly forbiddenPatterns: string[];
  readonly negatedMentions: Array<{
    readonly file: string;
    readonly phrase: string;
    readonly requiredLineFragment: string;
  }>;
  readonly requiredPhrasesByFile: Record<string, string[]>;
}

function readFixture(): ReadinessFixture {
  return JSON.parse(
    readFileSync(
      new URL("../../../fixtures/hardening/readiness/docs-contract.json", import.meta.url),
      "utf8",
    ),
  ) as ReadinessFixture;
}

function readRepoText(relativePath: string): string {
  return readFileSync(new URL(`../../../${relativePath}`, import.meta.url), "utf8");
}

describe("hardening readiness", () => {
  it("keeps the alpha/local operator posture and required hardening evidence visible across README and readiness docs", () => {
    const fixture = readFixture();
    const contents: Record<string, string> = Object.fromEntries(
      Object.keys(fixture.requiredPhrasesByFile).map((file) => [
        file,
        readRepoText(file),
      ]),
    );

    for (const [file, phrases] of Object.entries(fixture.requiredPhrasesByFile)) {
      const content = contents[file];
      for (const phrase of phrases) {
        expect(content).toContain(phrase);
      }
    }

    for (const content of Object.values(contents)) {
      for (const pattern of fixture.forbiddenPatterns) {
        expect(content).not.toMatch(new RegExp(pattern, "i"));
      }
    }

    for (const assertion of fixture.negatedMentions) {
      const matchingLines = (contents[assertion.file] ?? "")
        .split("\n")
        .filter((line) => line.toLowerCase().includes(assertion.phrase));

      expect(matchingLines.length).toBeGreaterThan(0);
      for (const line of matchingLines) {
        expect(line.toLowerCase()).toContain(assertion.requiredLineFragment);
      }
    }
  });
});
