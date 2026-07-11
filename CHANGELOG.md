# Changelog

All notable changes to the public `@consiliency/*` seam packages are documented
here. These packages were never published under any other scope.

## [Unreleased] — seam scope rename: `@omniagent-plus/*` → `@consiliency/*`

Rename the three **public** seam packages from the `@omniagent-plus/*` scope to
our `@consiliency/*` npm org, before first publish. `omniagent` / `omniagent-plus`
is a Databricks-owned upstream dependency; these packages are wrappers, so the old
scope wrongly implied ownership of that name. Pre-first-publish rename — the
`@omniagent-plus` npm scope was never created and nothing was published under it.

### Changed
- `@omniagent-plus/core-contracts` → `@consiliency/runtime-provider`
- `@omniagent-plus/governed-pipeline-adapter` → `@consiliency/pipeline-provider-adapter`
- `@omniagent-plus/omnigent-transport` → `@consiliency/omnigent-transport`
- Every internal import / `dependencies` reference to the three above was updated
  across `packages/**` src, tests, fixtures, docs, and plan specs.
- The `./conformance` export subpath on `@consiliency/pipeline-provider-adapter`
  is preserved and its `conformance.v0.1.json` bytes are unchanged (IF-0-CONFORM-1;
  byte-identical to agent-harness's vendored golden).
- Added `.github/workflows/publish.yml`: tokenless npm OIDC trusted publishing for
  the three packages under `@consiliency/*` (repo `ViperJuice/omniagent-plus`).
- Removed `@consiliency/omnigent-transport`'s dependency on the private,
  unpublished `@omniagent-plus/state-ledger` package. Its capability store now
  accepts a public structural ledger interface backed by runtime-provider
  record types, so the packed transport installs independently.
- Made the publish workflow skip exact package versions already present on npm,
  allowing topological releases to continue to packages that still need
  publication instead of failing on an earlier unchanged version.

### Notes
- The seven **private** workspace packages (`@omniagent-plus/{cli,coordinator,
  state-ledger,identity-isolation,rate-limit-catalog,worktree-leasing,
  agent-harness-adapter}`) keep the `@omniagent-plus/*` scope — they are never
  published, so npm-scope ownership does not apply to them.
- Package directory names under `packages/` are unchanged; only the npm `name`
  fields and importers changed.

## [0.2.0] — 2026-07-10 — PUBHARDEN: consumable seam packages

Make the three seam packages consumable end-to-end (GP-adapter roadmap, PUBHARDEN
phase / IF-0-PUBHARDEN-1). Packaging + distribution only — no provider interface or
governance behavior change.

### Changed
- `@omniagent-plus/core-contracts`, `@omniagent-plus/governed-pipeline-adapter`,
  `@omniagent-plus/omnigent-transport`: removed `"private": true`; bumped to `0.2.0`;
  each now builds to `dist/` via a per-package `tsconfig.build.json` (`tsc`, emit on,
  `*.test.ts` excluded) and its `exports` map points at `./dist/*.js` + `./dist/*.d.ts`
  (was `./src/*.ts`). `files` is `["dist"]` (plus `conformance.v0.1.json` on the adapter).
- `@omniagent-plus/governed-pipeline-adapter`: **preserves the `./conformance` export
  subpath** (IF-0-CONFORM-1) through the `dist` rewrite (single-writer note honored).

### Added
- `@omniagent-plus/core-contracts`: export the failure-vocabulary arrays
  (`runtimeFailureCategories`, `runtimeFailureActors`, `runtimeFailureScopes`) from the
  package index. Additive — exposes existing constants so a consumer (and the TS-vs-golden
  gate) can validate against the contract's error vocabulary. No symbol renamed or removed.
- `test_ts_conformance.test.ts` (adapter): the load-bearing **TS-vs-golden** gate — asserts
  the TS contract conforms to the IF-0-CONFORM-1 golden across all four invariant tables
  (methods via the mapping + a compile-time `keyof AgentRuntimeProvider` bind; events from the
  zod discriminated union; terminal states from the transition tables; error categories from
  the exported array). A one-string golden mutation and an undeclared method spelling both fail.
- `scripts/smoke-fake-provider.mjs` (P0a): a standalone consumer importing ONLY
  `@omniagent-plus/core-contracts` that drives one `createSession → sendTurn → closeSession`
  `FakeAgentRuntimeProvider` turn and exits 0 (proven from a scratch `npm install`).

### Notes
- The live `OmnigentHttpProvider` HTTP transport is NOT wired into any consumer (non-goal);
  `omnigent-transport` is publish-hardened for consumability and accepts a structural
  capability-ledger interface backed by `@consiliency/runtime-provider` record types. It
  does not depend on the private `@omniagent-plus/state-ledger` package; a real
  `AuditLedger` remains structurally compatible when used inside this workspace.
