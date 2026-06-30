import { readdirSync, readFileSync } from "node:fs";

import type { LimitClassification } from "@omniagent-plus/core-contracts";

import { classifyLimitSignal } from "./classifier.js";
import { classifyHarnessSignal } from "./harness-rules.js";
import { classifyProviderSignal } from "./provider-rules.js";
import type {
  FixtureCategory,
  RateLimitFixture,
  RateLimitFixtureCatalog,
} from "./types.js";

const rateLimitFixtureRoot = new URL("../../../fixtures/rate-limits/", import.meta.url);

function readFixtureCatalog(relativePath: string): RateLimitFixtureCatalog {
  return JSON.parse(
    readFileSync(new URL(relativePath, rateLimitFixtureRoot), "utf8"),
  ) as RateLimitFixtureCatalog;
}

function listCatalogFiles(category: FixtureCategory): string[] {
  return readdirSync(new URL(`${category}/`, rateLimitFixtureRoot), {
    withFileTypes: true,
  })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => `${category}/${entry.name}`)
    .sort();
}

export function loadFixtureCatalogs(
  category: FixtureCategory,
): RateLimitFixtureCatalog[] {
  return listCatalogFiles(category).map((relativePath) =>
    readFixtureCatalog(relativePath),
  );
}

export function loadProviderFixtureCatalogs(): RateLimitFixtureCatalog[] {
  return loadFixtureCatalogs("providers");
}

export function loadHarnessFixtureCatalogs(): RateLimitFixtureCatalog[] {
  return loadFixtureCatalogs("harnesses");
}

export function loadNegativeFixtureCatalogs(): RateLimitFixtureCatalog[] {
  return loadFixtureCatalogs("negative");
}

export function loadUnknownFixtureCatalogs(): RateLimitFixtureCatalog[] {
  return loadFixtureCatalogs("unknown");
}

export function loadAllRateLimitFixtures(): RateLimitFixture[] {
  return [
    ...loadProviderFixtureCatalogs(),
    ...loadHarnessFixtureCatalogs(),
    ...loadNegativeFixtureCatalogs(),
    ...loadUnknownFixtureCatalogs(),
  ].flatMap((catalog) => catalog.fixtures);
}

export function classifyFixture(fixture: RateLimitFixture): LimitClassification {
  if (fixture.signal.provider) {
    return classifyProviderSignal(fixture.signal);
  }

  if (fixture.signal.harness) {
    return classifyHarnessSignal(fixture.signal);
  }

  return classifyLimitSignal(fixture.signal);
}
