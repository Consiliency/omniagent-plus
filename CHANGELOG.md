# Changelog

All notable changes to the public `@consiliency/*` seam packages are documented
here. These packages were never published under any other scope.

## [0.5.0] - 2026-08-12 - Omnigent v0.9 tagged-wire correction

### Changed
- Freeze official Omnigent `v0.9.0` at
  `cc4720a79fbdf9ccee56724bf571e7d48e1d9ac2`, preserving 97 operations and
  exactly 52 stream events while recording the six additive schema changes.
- Correct HTTP create, message, epoch/session, cursor-page, persisted-history,
  acknowledgement, policy-denial, and tagged-SSE handling to the official wire.
- Preserve indexed terminal-observed text chunks, seed and clear reconnect
  response context, keep replay sequence after the caller cursor, dedupe live
  overlap by persisted item identity or an identity-free persisted text prefix,
  dedupe tool overlap by call identity, prevent metadata-only history rows from
  creating lifecycle, retain bare turn frames as metadata-only, validate
  external session/page rows against distinct parent/child schemas, preserve
  parent and child IDs on `session.created`, require official session/list
  `agent_id` and list `updated_at`, distinguish snapshot status from the
  SSE-only `launching` transition, preserve the official routing-decision
  fields, preserve provisional turn correlation across ambiguous native idle
  edges, map status-only setup failures, and enforce the named-agent-only
  resolver boundary.
- Add process-local create/send idempotency and provisional accepted turn
  identity without inventing upstream response fields.
- Classify `omnigent server start` as a hidden deprecated alias while retaining
  `omnigent server --background` as the sole production start command.

### Notes
- No neutral event, routing, approval, authority, lease, lock, child-create, or
  harness-override capability is added.
- Upstream v0.9 does not contain the later bundle-root isolation fix; this
  release does not claim parity with development main.
- Only `@consiliency/omnigent-transport` advances to `0.5.0`.

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
- Package the authoritative Omnigent fixture tree under `dist/fixtures` during
  build and run a clean packed-install capability probe in release verification.
- Made the publish workflow skip exact package versions already present on npm,
  allowing topological releases to continue to packages that still need
  publication instead of failing on an earlier unchanged version. Only an
  explicit npm `E404` enters the publish path; other registry probe failures
  retain diagnostics and fail closed.

### Notes
- The seven **private** workspace packages (`@omniagent-plus/{cli,coordinator,
  state-ledger,identity-isolation,rate-limit-catalog,worktree-leasing,
  agent-harness-adapter}`) keep the `@omniagent-plus/*` scope — they are never
  published, so npm-scope ownership does not apply to them.
- Package directory names under `packages/` are unchanged; only the npm `name`
  fields and importers changed.

## [0.4.1] — 2026-07-31 — isolated declaration consumer fix

### Fixed
- Declare `@types/node` as a transport dependency because the public
  declarations expose Node process signals, and reference that type through an
  explicit `node:child_process` type import plus an emitted Node type reference.
- Run the packed declaration smoke with TypeScript installed and invoked inside
  the isolated consumer with automatic ambient types disabled so
  workspace-only or implicitly discovered type packages cannot mask a missing
  published dependency.

### Notes
- `0.4.1` supersedes `0.4.0`, whose runtime surface is usable but whose public
  declarations do not compile in a consumer without an independently installed
  `@types/node`.
- The Omnigent v0.7 authority and all runtime behavior remain unchanged.

## [0.4.0] — 2026-07-30 — Omnigent v0.7.0 contract maintenance

Move `IF-0-CONTRACT-1` from official Omnigent `v0.6.0` to `v0.7.0` at tag
commit `35519fb04743f66b30cac8a40695d5d72fa163ea`.

### Changed
- `@consiliency/omnigent-transport`: replace the removed local-server start
  subcommand with `omnigent server --background`, accept its human-readable
  output, and read direct machine status through `omnigent server status --json`.
- Type optional session project identity and native model-picker options and
  export the additive response types from the package root.
- Record project, usage, credential, installation, model-option, MCP-header,
  and expanded import surfaces as optional upstream administration metadata,
  not new neutral runtime-provider capabilities.
- Refresh source, HTTP, CLI, capability, and fake-server authority fixtures
  while preserving the exact 52-event vocabulary and event mapping behavior.

### Notes
- `@consiliency/runtime-provider` and
  `@consiliency/pipeline-provider-adapter` remain at `0.2.0` and are not
  republished by this transport-only release.
- Upstream v0.7 telemetry configuration remains an explicit operator choice;
  the transport does not mutate process environments.
- No lease/lock, child-creation, reconnect, terminal-event, or neutral event
  semantics changed.

## [0.3.0] — 2026-07-24 — Omnigent v0.6.0 contract maintenance

Move `IF-0-CONTRACT-1` from official Omnigent `v0.5.1` to `v0.6.0` at tag
commit `375f540421baf3ad46fae0805b78063682f281de`.

### Changed
- `@consiliency/omnigent-transport`: accept
  `browser.action_request` and `response.function_call_output.delta` as known
  raw metadata events while preserving the neutral-runtime no-op boundary.
- Type optional `parent_session_id` lineage on session snapshots without
  changing provider-owned root-session semantics.
- Record import and automatic-title routes as optional upstream surfaces, not
  new `AgentRuntimeProvider` or HTTP-client methods.
- Refresh source, HTTP, CLI, capability, event, and fake-server fixtures; drive
  both v0.6 events through parser, mapper, HTTP-client, provider, conformance,
  and packed-consumer verification.
- Point transport package metadata and trusted-publisher instructions at
  `Consiliency/omniagent-plus`.

### Notes
- `@consiliency/runtime-provider` and
  `@consiliency/pipeline-provider-adapter` remain at `0.2.0` and are not
  republished by this transport-only release.
- Upstream v0.6 telemetry configuration remains an explicit operator choice;
  the transport does not mutate process environments.
- No lease/lock, child-creation, reconnect, terminal-event, or neutral event
  semantics changed.

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
