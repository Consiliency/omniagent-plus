import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

interface ReadinessFixture {
  readonly auditClaims: Array<{
    readonly id: string;
    readonly claim: string;
    readonly owners: string[];
    readonly references: string[];
    readonly requiredScope: string[];
  }>;
  readonly hygieneSubclaims: Array<{
    readonly id: string;
    readonly status: "delivered locally" | "deferred";
    readonly owner: string;
    readonly references: string[];
    readonly requiredScope: string[];
  }>;
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
  it("inventories every section-6 audit claim in source order without omissions or duplicates", () => {
    const auditSection = readRepoText("docs/code-review-2026-09-01.md")
      .split("## 6. Documentation claims that do not match the code")[1]!
      .split("## 7.")[0]!;
    const claims = auditSection.split("\n")
      .filter((line) => line.startsWith("| ") && !line.startsWith("| Document |"))
      .map((line) => line.split("|")[2]!.trim());
    const fixture = readFixture();
    expect(claims).toHaveLength(16);
    expect(fixture.auditClaims.map(({ claim }) => claim)).toEqual(claims);
    const ids = fixture.auditClaims.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
    const rows = readRepoText("docs/hardening-readiness.md").split("\n")
      .filter((line) => line.startsWith("| S6-"));
    expect(rows.map((line) => line.split("|")[1]!.trim())).toEqual(ids);
  });

  it("keeps evidence limits and downstream ownership attached to each audit claim", () => {
    const doc = readRepoText("docs/hardening-readiness.md");
    for (const claim of readFixture().auditClaims) {
      const row = doc.split("\n").find((line) => line.startsWith(`| ${claim.id} |`));
      expect(row, claim.id).toBeDefined();
      for (const phrase of [...claim.owners, ...claim.requiredScope]) {
        expect(row, claim.id).toContain(phrase);
      }
      for (const path of claim.references) {
        expect(readRepoText(path).length, path).toBeGreaterThan(0);
        expect(row, claim.id).toContain(`](../${path})`);
      }
    }
  });

  it("separates locally delivered HY subclaims from deferred acceptance and source repair", () => {
    const fixture = readFixture();
    const rows = readRepoText("docs/hardening-readiness.md").split("\n")
      .filter((line) => line.startsWith("| HY-"));
    expect(rows.map((line) => line.split("|")[1]!.trim()))
      .toEqual(fixture.hygieneSubclaims.map(({ id }) => id));
    for (const subclaim of fixture.hygieneSubclaims) {
      const row = rows.find((line) => line.startsWith(`| ${subclaim.id} |`));
      for (const phrase of [subclaim.status, subclaim.owner, ...subclaim.requiredScope]) {
        expect(row, subclaim.id).toContain(phrase);
      }
      for (const path of subclaim.references) {
        expect(readRepoText(path).length, path).toBeGreaterThan(0);
        expect(row, subclaim.id).toContain(`](../${path})`);
      }
    }
    for (const finding of ["HY-1", "HY-5", "HY-6"]) {
      const subclaims = fixture.hygieneSubclaims.filter(({ id }) => id.startsWith(`${finding}/`));
      expect(subclaims.map(({ status }) => status)).toContain("delivered locally");
      expect(subclaims.map(({ status }) => status)).toContain("deferred");
    }
  });

  it("documents build-before-test and a separate explicit live invocation, never a pnpm test opt-in", () => {
    const readme = readRepoText("README.md");
    expect(readme).toContain("pnpm verify");
    expect(readme).not.toContain("phase-loop validate-roadmap specs/phase-plans-v1.md");
    expect(readme).not.toContain("pnpm test -- --run");
    const doc = readRepoText("docs/omnigent-live-smoke.md");
    const liveBlock = doc.match(/```bash\n([^`]*OMNIAGENT_PLUS_LIVE_OMNIGENT=1[^`]*)```/)?.[1];
    expect(liveBlock).toBeDefined();
    expect(liveBlock).toContain("pnpm build");
    expect(liveBlock).toContain("pnpm exec vitest run packages/omnigent-transport/src/live-omnigent-smoke.test.ts");
    expect(liveBlock!.indexOf("pnpm build")).toBeLessThan(liveBlock!.indexOf("pnpm exec vitest run"));
    expect(liveBlock).not.toMatch(/pnpm test\b/);
    expect(doc).toContain("pnpm test never enables live smoke");
  });

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
