# Phase roadmap v2

## Context

Remediate the audit merged in Consiliency/omniagent-plus#18. The disposition
matrix is `plans/audit-remediation-disposition-20260905.md`; it preserves all
55 named findings, qualifications, and cross-cutting integration gaps. Its
tracking issues carry progress. This is a new initiative; completed v1 plans
and the Omnigent release accommodation retain their history.

## Architecture North Star

An independently consumable provider, explicit runtime composition above it,
crash-consistent durable state, and a coordinator whose routing and leases
have tested ownership. Metadata exports must enforce their declared content
policy. The off-device lease store remains authoritative; inbox and audit
projections describe state without granting ownership.

## Assumptions

- Repository: `Consiliency/omniagent-plus`; ESM, pnpm, TypeScript, Vitest.
- The matrix distinguishes reproduced facts from historical or qualified
  findings. TRIAGE resolves design ambiguity before production edits.
- Use isolated worktrees. Preserve the primary checkout's dirty plans and v1
  `.phase-loop` state. This roadmap is not evidence of completed remediation.
- The fleet plan hub is `consiliency-portal/plans/unification/`, especially
  standardization/deconfliction and compute-offload documents; consume them
  read-only and verify current implementation before declaring dependencies.

### External Inputs

- Supported Omnigent authority: `v0.12.0`, commit
  `f04b0354fb5344c1ea8b92795ceb6760a9ad7595`, from the existing contract fixture.
- Published lease/channel schema input: `@consiliency/contract@0.6.3`.
- Published consumer baseline: runtime-provider and pipeline-provider-adapter
  `0.2.0`, omnigent-transport `0.7.0`. Recheck registries at release preparation.
- A newer official upstream release is a separate accommodation decision.

## Non-Goals

- No canon/authority crypto, spec/gp/Portal/harness runtime changes or copies.
- No hosted product, background fleet daemon, or automatic approval capability.
- No wholesale schema strictness, lease merger, unsafe TTL lock stealing,
  removal of preserved review evidence, or automatic non-idempotent retries.
- No license selection inferred from a dependency; no release during planning.

## Cross-Cutting Principles

- Preserve existing public behavior except documented, tested corrections.
- Repair destructive recovery before introducing stricter persistence checks.
- Shared schemas/locks have one owner; freeze them before dependent lanes.
- Tests prove crash ordering, time, ownership, content policy, and replay.
- Every finding gets an implemented acceptance result or an explicit justified
  disposition. Passing tests alone cannot close an unimplemented behavior.
- Each phase plan supplies machine-checkable commands and an effective
  `automation.suite_command`. No credentialed smoke result may be inferred
  from fake-server tests. Capture sanitized operational evidence separately.

## Top Interface-Freeze Gates

- IF-0-TRIAGE-1 - Finding dispositions, owners, and compatibility decisions.
- IF-0-GUARD-2 - Shared PR/release verification and honest readiness scope.
- IF-0-DATA-3 - Content, recovery, sequence, and durable projection contracts.
- IF-0-COORD-4 - Routing, cleanup, lease clocks, and settlement contracts.
- IF-0-WIRE-5 - Bounded transport and content-aware event behavior.
- IF-0-INTEG-6 - Durable operator lifecycle and replay after restart.
- IF-0-PREP-7 - Reviewed package candidates and release evidence.
- IF-0-SHIP-8 - Verified published artifacts and registry consumer receipt.

## Phases

### Phase 1 - Reconcile findings and ownership (TRIAGE)

**Objective**
Turn the matrix into an accepted implementation inventory.

**Exit criteria**
- [ ] EC-TRIAGE-1 - All 55 IDs and sections 3.1-3.4 map to owned issues, phase acceptance cases, or justified exclusions; N/Q claims have explicit checks/decisions.
- [ ] EC-TRIAGE-2 - Content export, corrupt-record handling, distinct lease APIs, established-session identity, and consumer supervision decisions are recorded.
- [ ] EC-TRIAGE-3 - Reviewer feedback is reconciled; license ownership, CI topology, and any actual external dependency are recorded without blocking independent work.

**Scope notes**
Interface-only preamble, single lane. Use the matrix and source; promote no
historical severity automatically. Name any actual missing dependency and
its owner. License selection can remain pending for PREP while fixes proceed.

**Non-goals**
Production changes, historical evidence deletion, or executing the audit verbatim.

**Key files**
- `plans/audit-remediation-disposition-20260905.md`
- `docs/code-review-2026-09-01.md`
- `docs/architecture.md`
- `docs/coordination-backend.md`

**Depends on**
- (none)

**Produces**
- IF-0-TRIAGE-1 - Accepted dispositions and ownership boundaries.

**Spec closeout policy**
schema: spec_delta_closeout.v1; decision: roadmap_amendment;
target_surfaces: specs/phase-plans-v2.md, plans/audit-remediation-disposition-20260905.md;
evidence_paths: plans/evidence/v2/TRIAGE.json;
redaction_posture: metadata_only; missing evidence: blocker_class=contract_bug.

### Phase 2 - Verification and readiness (GUARD)

**Objective**
Make reviewed behavioral changes pass the same effective checks before merge
and publication; correct current readiness claims.

**Exit criteria**
- [ ] EC-GUARD-1 - PR and release verification run frozen install, build, lint, typecheck, tests, and package smoke once; an injected failure makes the gate fail.
- [ ] EC-GUARD-2 - Full versus focused/integration commands have reliable exit codes, process-test timeouts, and documented execution topology; no skip-only green.
- [ ] EC-GUARD-3 - Docs distinguish implemented behavior from consumer obligations; HY-1/HY-5/HY-6 subclaims are implemented or explicitly deferred with evidence.

**Scope notes**
Decompose into 2 lanes: workflow/tooling; docs/test-boundary inventory. Reuse
fleet offload conventions where available. Preserve meaningful conformance
and ownership tests when replacing brittle prose assertions.

**Non-goals**
Provider upgrades, production credentials, coverage percentages as correctness proof.

**Key files**
- `.github/workflows/`
- `package.json`
- `eslint.config.mjs`
- `vitest.config.ts`
- `docs/hardening-readiness.md`

**Depends on**
- TRIAGE

**Produces**
- IF-0-GUARD-2 - Shared fail-propagating gate and truthful scope.

**Spec closeout policy**
schema: spec_delta_closeout.v1; decision: no_spec_delta;
target_surfaces: .github/workflows/, docs/hardening-readiness.md;
evidence_paths: plans/evidence/v2/GUARD.json;
redaction_posture: metadata_only; missing evidence: blocker_class=contract_bug.

### Phase 3 - Content and durable state (DATA)

**Objective**
Establish persistence that preserves valid records, recovers safely, and
enforces its declared content policy.

**Exit criteria**
- [ ] EC-DATA-1 - Shared corpus covers scanner entry points, safe lookalikes, nested fields, evidence refs, and direct packet/schema bypass; metadata versus content behavior is frozen.
- [ ] EC-DATA-2 - Crash injection proves monotonic sequences, safe incomplete-tail recovery, preserved schema-invalid records, owner-safe locks, and supported fsync ordering across processes.
- [ ] EC-DATA-3 - Read-only queries do not mutate; replay selects correctly scoped latest state; retention preserves dependencies and newer schema versions fail explicitly.
- [ ] EC-DATA-4 - Measured append/index changes preserve concurrency and recovery; required core fake-provider and identity-boundary cases pass without public contract drift.

**Scope notes**
Decompose into 3 lanes: core content/types and identity scanner; ledger/replay;
fault/corpus tests. First the ledger owner repairs invalid-tail handling,
then freeze shared content/release-record shapes before enabling stricter
validation. Ledger reads treat corruption explicitly, never as empty state.
Keep opt-in content available at the runtime boundary and sanitized at export.

**Non-goals**
External canonical schema edits, universal secret-detection claims, final version bump.

**Key files**
- `packages/core-contracts/src/`
- `packages/state-ledger/src/`
- `packages/identity-isolation/src/secret-redaction.ts`
- `fixtures/state-ledger/`
- `docs/durable-state.md`

**Depends on**
- GUARD

**Produces**
- IF-0-DATA-3 - Content, crash recovery, and projection event interfaces.

**Spec closeout policy**
schema: spec_delta_closeout.v1; decision: canonical_spec_update;
target_surfaces: specs/agent-runtime-provider-omnigent-spec.md, docs/durable-state.md;
evidence_paths: plans/evidence/v2/DATA.json;
redaction_posture: metadata_only; missing evidence: blocker_class=contract_bug.
Canonical here means this repo's runtime spec, never the external canon package.

### Phase 4 - Routing and fleet lease safety (COORD)

**Objective**
Make routing, worktree mutation, and off-device ownership decisions accurate
under expiry, crash, clock skew, and backend failure.

**Exit criteria**
- [ ] EC-COORD-1 - Expired cooldowns unblock appropriately, unknown preferences are explicit, and send-turn checks the established session identity before dispatch.
- [ ] EC-COORD-2 - One bounded retry/settlement policy handles Retry-After dates, negatives, hard stops, and balanced active-turn counts; diagnostics follow DATA content rules.
- [ ] EC-COORD-3 - Cleanup proves managed path, registration, independent holder/fence, liveness, and dirty state; missing directories reconcile without arbitrary deletion; corrupt state cannot authorize acquisition.
- [ ] EC-COORD-4 - Local PostgreSQL proves server-time expiry, atomic concurrent hard acquire, holder-only renew/release, and crash-consistent event/projection replay; local/fleet lease contracts remain distinct.
- [ ] EC-COORD-5 - CLI dry-run/record/arbitrate effects and bounded inbox/query behavior are explicit; obsolete coordination APIs have a tested migration or retained ownership decision.

**Scope notes**
Decompose into 3 lanes: coordinator/rate limits; worktree registry/cleanup;
Supabase backend/migrations. One final integration lane owns shared CLI
commands. Consume DATA's frozen lock and record interfaces. Use forward
migrations; test only disposable worktrees/databases. Planning does not
authorize production database deployment.

**Non-goals**
Inbox authority, silent hard-to-soft fallback, or harness/Portal runtime edits.

**Key files**
- `packages/coordinator/src/`
- `packages/rate-limit-catalog/src/`
- `packages/worktree-leasing/src/`
- `packages/cli/src/commands/`
- `supabase/migrations/`

**Depends on**
- DATA

**Produces**
- IF-0-COORD-4 - Routing, clocks, cleanup, and settlement behavior.

**Spec closeout policy**
schema: spec_delta_closeout.v1; decision: no_spec_delta;
target_surfaces: docs/coordination-backend.md, docs/coordinator-routing.md;
evidence_paths: plans/evidence/v2/COORD.json;
redaction_posture: metadata_only; missing evidence: blocker_class=contract_bug.
External contract changes require a scoped amendment and owner routing first.

### Phase 5 - Transport reliability (WIRE)

**Objective**
Bound HTTP/SSE resources and preserve public lifecycle behavior.

**Exit criteria**
- [ ] EC-WIRE-1 - Prefixed URLs, request/body deadlines, typed CLI/HTTP failures, abort, UTF-8/chunk boundaries, CR framing, and oversize streams have behavioral tests.
- [ ] EC-WIRE-2 - Stream/history posture matches DATA policy; every upstream event has a documented mapping/drop disposition without added approval authority.
- [ ] EC-WIRE-3 - Session/cache cleanup and concurrent cold start are bounded while reconnect, late acknowledgement, idempotency, cancellation quarantine, and mutation fencing stay correct.
- [ ] EC-WIRE-4 - Frozen upstream fixtures and independent packed consumer checks pass; no ledger or harness dependency is added to transport.

**Scope notes**
Decompose into 3 disjoint lanes: client/SSE; mapper/provider lifecycle;
CLI/process manager. Freeze shared `types.ts` edits before parallel work and
serialize final exports. COORD can execute concurrently with WIRE; neither
may silently edit DATA's frozen public schemas.

**Non-goals**
Automatic mutation retries, upstream dev-tag adoption, or persistence composition.

**Key files**
- `packages/omnigent-transport/src/`
- `fixtures/omnigent/`
- `scripts/smoke-packed-omnigent-transport.mjs`
- `docs/omnigent-transport.md`

**Depends on**
- DATA

**Produces**
- IF-0-WIRE-5 - Bounded public transport behavior.

**Spec closeout policy**
schema: spec_delta_closeout.v1; decision: no_spec_delta;
target_surfaces: docs/omnigent-transport.md, docs/lifecycle-and-events.md;
evidence_paths: plans/evidence/v2/WIRE.json;
redaction_posture: metadata_only; missing evidence: blocker_class=contract_bug.

### Phase 6 - Durable operator integration (INTEG)

**Objective**
Exercise the actual provider-to-ledger-to-CLI lifecycle across restart.

**Exit criteria**
- [ ] EC-INTEG-1 - An explicit opt-in composition records sessions, turns, and events; CLI list/show/snapshot replay from persisted state after restart with no fixture seeding.
- [ ] EC-INTEG-2 - Duplicate delivery, recording failure, interrupted append, cancellation, and retry settlement preserve identity, terminal uniqueness, and metadata export policy.
- [ ] EC-INTEG-3 - Scoped process cleanup, lease renewal, cooldown transition, and retry ownership are implemented or explicitly consumer-owned with a tested reference path and accurate docs.

**Scope notes**
Decompose into 2 lanes: reference/operator composition above the transport;
end-to-end tests and lifecycle documentation. Prefer existing coordinator/CLI
boundaries; a decorator may be added only where composition requires it.
Choose a concrete invocation during planning; no implicit daemon. Approval
records may be replayed but never fabricated from upstream operator events.

**Non-goals**
Full product runtime, new authority, or tightly coupling transport to the ledger.

**Key files**
- `packages/cli/src/`
- `packages/coordinator/src/`
- `packages/state-ledger/src/replay.ts`
- `docs/architecture.md`
- `docs/hardening-readiness.md`

**Depends on**
- COORD
- WIRE

**Produces**
- IF-0-INTEG-6 - Durable lifecycle and restart replay proof.

**Spec closeout policy**
schema: spec_delta_closeout.v1; decision: canonical_spec_update;
target_surfaces: specs/agent-runtime-provider-omnigent-spec.md, docs/architecture.md;
evidence_paths: plans/evidence/v2/INTEG.json;
redaction_posture: metadata_only; missing evidence: blocker_class=contract_bug.

### Phase 7 - Package and release preparation (PREP)

**Objective**
Produce reviewed, consumable release candidates with complete finding disposition.

**Exit criteria**
- [ ] EC-PREP-1 - License choice is recorded by the owner; distribution files/metadata and independent JS/TypeScript imports pass for each affected public package.
- [ ] EC-PREP-2 - Runtime dependencies remain available; test-only distribution is removed only where supported; evidence retention and measured performance/retention work are reconciled.
- [ ] EC-PREP-3 - Full gate, contract vectors, packed consumers, version/dependency/changelog updates, and publish dry-run pass; every A-priority finding is resolved for affected release paths.
- [ ] EC-PREP-4 - Review feedback and all remaining issue dispositions are recorded; release target/packages/workflow and rollback limitations are explicit.

**Scope notes**
Decompose into 2 lanes: package exports/dependencies/license implementation;
retention/evidence/docs and verification. Serialize versions, lockfile, and
changelog after integration. Registries determine occupied versions; changed
public packages and their consumers require appropriate coordinated bumps.

**Non-goals**
Deleting all audit history, guessing a license, or dispatching publication.

**Key files**
- `packages/*/package.json`
- `pnpm-lock.yaml`
- `scripts/`
- `CHANGELOG.md`
- `plans/audit-remediation-disposition-20260905.md`

**Depends on**
- INTEG

**Produces**
- IF-0-PREP-7 - Approved candidate and dry-run evidence.

**Spec closeout policy**
schema: spec_delta_closeout.v1; decision: no_spec_delta;
target_surfaces: CHANGELOG.md, package distribution metadata;
evidence_paths: plans/evidence/v2/PREP.json;
redaction_posture: metadata_only; missing evidence: blocker_class=contract_bug.

### Phase 8 - Publish and verify consumers (SHIP)

**Objective**
Publish the prepared candidate through the existing trusted workflow.

**Exit criteria**
- [ ] EC-SHIP-1 - Clean source matches the reviewed prepared candidate; approved release dispatch completes through npm OIDC without credential leakage.
- [ ] EC-SHIP-2 - Registry versions/integrity and exact-pin external imports match the prepared package set; unchanged packages are not republished.
- [ ] EC-SHIP-3 - Release evidence and issue acceptance are reconciled; only clean completed worktrees are pruned.

**Scope notes**
Single lane because registry publication is a serialized external mutation.
Downstream plan must set `phase_loop_mutation: release_dispatch`. No repair,
version edits, or workflow edits during dispatch; return those to PREP.
Keep preparation evidence and external publication receipts distinct.

**Non-goals**
Manual credentialed npm publication or production database migration.

**Key files**
- `.github/workflows/publish.yml`
- `scripts/publish-package-if-needed.sh`
- `plans/evidence/v2/SHIP.json`

**Depends on**
- PREP

**Produces**
- IF-0-SHIP-8 - Registry and consumer receipt.

**Spec closeout policy**
schema: spec_delta_closeout.v1; decision: no_spec_delta;
target_surfaces: release evidence;
evidence_paths: plans/evidence/v2/SHIP.json;
redaction_posture: metadata_only; missing evidence: blocker_class=contract_bug.

## Phase Dependency DAG

```text
TRIAGE -> GUARD -> DATA -> COORD --+
                         WIRE ---+-> INTEG -> PREP -> SHIP
```

Both COORD and WIRE depend on DATA. No phase acceptance is inferred from
another phase's status.

## Execution Notes

TRIAGE is the next phase to plan. Each later `codex-plan-phase` produces the
detailed lane plan and references stable EC IDs. Keep plans near execution
so accepted interface decisions do not drift. COORD/WIRE may run in separate
worktrees after DATA; shared manifests, docs, and exports merge serially.
Use explicit file ownership and fresh integrated validation after merging
lanes. Review plans and implementation before their respective acceptance.
Fable reviews use the canonical subscription TUI adapter when requested.

Planning must not run builds, tests, migrations, or release dispatch. A
missing or inaccessible live environment is evidence-pending, not a passing
gate; inspect safe access metadata before escalating. Operational proxy
evidence requires a runner-stamped roadmap amendment before acceptance.

## Verification

Authoring checks (run now):

```sh
phase-loop validate-roadmap specs/phase-plans-v2.md
git diff --check
```

Implementation baseline (capture here; run in downstream phases):

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @consiliency/omnigent-transport test:pack
node scripts/check-omnigent-openapi-delta.mjs
NPM_PUBLISH_DRY_RUN=1 bash scripts/publish-package-if-needed.sh packages/omnigent-transport
```

GUARD defines the shared non-skipping suite entrypoint. DATA adds fault and
corpus suites; COORD adds disposable PostgreSQL/skew/race probes; WIRE adds
stream/idempotency boundary tests; INTEG adds restart replay; PREP extends
packed consumer checks to every changed public package. Each plan names
exact commands, expected failures, evidence paths, and its suite command.
