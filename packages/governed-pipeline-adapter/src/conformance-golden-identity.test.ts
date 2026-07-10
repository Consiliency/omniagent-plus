import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * IF-0-CONFORM-1 distribution guard.
 *
 * The conformance golden has TWO on-disk locations that MUST stay byte-identical:
 *   - the human-facing canonical at repo `examples/governed-pipeline/conformance.v0.1.json`
 *     (referenced by the gp fixtures dir + the phase spec evidence paths), and
 *   - the package-local copy `packages/governed-pipeline-adapter/conformance.v0.1.json`,
 *     exported as the `./conformance` subpath.
 *
 * The package copy is required because a Node package `exports` target cannot escape
 * the package root (`../../examples/...` throws ERR_INVALID_PACKAGE_TARGET), yet gp
 * (GPBRANCH) must resolve the golden from the *published* package. This test is the
 * drift guard that keeps the two copies from silently diverging.
 */

const packageCopyUrl = new URL("../conformance.v0.1.json", import.meta.url);
const examplesCanonicalUrl = new URL(
  "../../../examples/governed-pipeline/conformance.v0.1.json",
  import.meta.url,
);

const packageJsonUrl = new URL("../package.json", import.meta.url);

describe("conformance golden distribution (IF-0-CONFORM-1)", () => {
  it("keeps the package copy byte-identical to the examples canonical", () => {
    const packageCopy = readFileSync(fileURLToPath(packageCopyUrl));
    const examplesCanonical = readFileSync(fileURLToPath(examplesCanonicalUrl));
    expect(packageCopy.equals(examplesCanonical)).toBe(true);
  });

  it("exposes the golden via the ./conformance package export subpath", () => {
    const packageJson = JSON.parse(readFileSync(fileURLToPath(packageJsonUrl), "utf8")) as {
      exports: Record<string, unknown>;
      files: string[];
    };
    expect(packageJson.exports["./conformance"]).toBe("./conformance.v0.1.json");
    // The export target must be shipped in the published tarball.
    expect(packageJson.files).toContain("conformance.v0.1.json");
  });

  it("carries the conformance.v0.1 schema id and the four invariant tables", () => {
    const golden = JSON.parse(readFileSync(fileURLToPath(packageCopyUrl), "utf8")) as {
      schema: string;
      methodNames: string[];
      methodNameMapping: Array<{ ts: string; py: string }>;
      eventTypes: string[];
      terminalStates: { turn: string[]; session: string[] };
      errorCategories: string[];
    };
    expect(golden.schema).toBe("conformance.v0.1");
    expect(golden.methodNames.length).toBe(8);
    expect(golden.methodNameMapping.length).toBe(golden.methodNames.length);
    expect(golden.eventTypes.length).toBe(13);
    expect(golden.terminalStates.turn).toEqual([
      "completed",
      "failed",
      "cancelled",
      "timed_out",
    ]);
    expect(golden.terminalStates.session).toEqual(["closed", "failed"]);
    expect(golden.errorCategories.length).toBe(20);
  });
});
