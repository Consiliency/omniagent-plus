---
phase_loop_plan_version: 1
phase: GUARD
roadmap: specs/phase-plans-v2.md
roadmap_sha256: ee1f3152a5331e071042ed122e122143cc103544140a5ed8f4e849f6b649587c
automation:
  suite_command: pnpm verify
---

# GUARD: Shared Verification and Honest Readiness

## Context

Implements the GUARD section of the v2 roadmap and omniagent-plus#20.
The user authorizes execution, four-agent reviews, reconciled merges and later
release, including explicit manual alternatives to broken orchestration.
TRIAGE substantive checks pass; its manual amendment and this plan require
current-candidate panel acceptance before implementation. Preserve all
historical runner state. Do not repair agent-harness as a prerequisite.

Recorded 2026-09-12 baseline: frozen install, build, lint and typecheck pass; after build the
root suite passes 348 tests with one explicitly opt-in live-provider skip.
Running tests before build fails package exports resolution: preserve the
build-before-test prerequisite. No PostgreSQL or packed-consumer proof is
inferred from this baseline.

Hosted Ubuntu is the initial full-gate topology. The fleet offload docs are
historical context, no Dagger gate exists here, and a live repo runner query
returned zero registrations on 2026-09-12. Do not add infrastructure or assume organization
offload credentials. PostgreSQL client and Docker are available locally.
The GUARD inventory discovered a third pre-existing ID-1 import in types.ts;
the accompanying explicit CASE-HY-6 amendment baselines exactly three edges,
subject to this panel. No runtime dependency/source repair is moved from PREP. The three source
files and verify-triage.mjs are included as review inputs. The TRIAGE checker
checks case membership, not import syntax; source inventory is reviewed
separately and SL-0's recursive AST controls enforce it.

## External Inputs

- Disposable SQL fixture, linux/amd64:
  `postgres@sha256:45cd22f8d32e189d245403954882f88e7a8714301fda80dab6da90f1265b25a3`.
  Registry metadata for postgres:17.6-bookworm verified on 2026-09-14.
  Pin the same digest and platform in local launcher and workflow and test
  their equality. Do not assume the image is already cached.
  This is test infrastructure only, not a production PostgreSQL recommendation.
- Existing pnpm11.1.1 and Node24 toolchain; dependency lockfile unchanged unless
  declared test-only tooling requires an explicit lockfile update.

## Interface Freeze Gates

- [ ] IF-0-GUARD-2 - One full fail-propagating verification command, shared by
  PR/main and release, with deterministic tests, mandatory disposable SQL
  setup, packed consumer smoke and evidence-scoped readiness.

Freeze these commands: `pnpm verify` runs frozen install, build, lint,
workspace and tooling typecheck, boundary checks, mandatory PostgreSQL setup,
one root test suite and transport pack smoke. `pnpm test` remains the
noncredentialed deterministic suite with opt-in live smoke excluded.
`pnpm test:guard` owns a disposable fixture and runs tooling falsifiers,
including SQL setup positive/negative controls. `pnpm test:integration` owns
one when run standalone. Neither accepts ambient credentials. The full gate
reuses one admitted fixture and one root suite. Name all live-SQL-dependent
cases tests/guard/*.db.test.ts; non-DB pnpm test excludes that selector before
collection, never by runtime skips.
The root test configuration collects package tests plus tests/guard; the full
gate launches it exactly once with the admitted GUARD_TEST_DATABASE_URL and
an explicit integration-required setting set by the gate after clearing the
inherited setting. Plain pnpm test unconditionally clears DB enablement and
connection variables and excludes the DB selector even when those values are
pre-set. Only verify/test:guard/test:integration may enable DB collection after
fixture admission; test hostile ambient enablement through plain pnpm test.
In admitted runs, a missing connection, empty DB collection or skipped required
DB case fails.
The full gate isolates DB/non-DB workers within one root invocation; only DB
workers receive fixture parameters. Test zero fixture-environment leakage to
non-DB workers and descendants. Required setup/DB case IDs live in
tests/guard/required-cases.json; dropped, renamed or skipped IDs fail the gate.
The full gate asserts that the designated integration cases actually executed;
test:guard runs tooling/setup falsifiers and the designated *.db.test.ts cases;
test:integration runs those same DB cases only. Both are focused subsets of
verify's single full-root suite, not substitutes for it. An orchestration falsifier suppressing DB suite collection
must make the real gate fail, not rely on a separate focused success.
Focused selectors never replace the full gate. Network upstream monitoring
remains separate via the existing OpenAPI delta script.

## Lane Index & Dependencies

SL-0 — Shared gate and tooling
  Depends on: (none)
  Blocks: SL-1, SL-2
  Parallel-safe: no

SL-1 — Readiness and claim inventory
  Depends on: SL-0
  Blocks: SL-2
  Parallel-safe: no

SL-2 — Integrated acceptance and docs sweep
  Depends on: SL-0, SL-1
  Blocks: (none)
  Parallel-safe: no

## Lanes

### SL-0 - Shared gate and tooling

- **Scope**: Establish effective release/PR verification without changing product semantics.
- **Owned files**: `package.json`, `pnpm-lock.yaml`, `vitest.config.ts`,
  `eslint.config.mjs`, `tsconfig.json`, `tsconfig.guard.json`,
  `.github/workflows/ci.yml`, `.github/workflows/verify.yml`,
  `.github/workflows/publish.yml`, `scripts/verify.mjs`,
  `scripts/prepare-test-postgres.mjs`, `scripts/check-dependency-boundaries.mjs`,
  `scripts/pack-verified-packages.mjs`, `scripts/verify-publish-artifacts.mjs`,
  `scripts/publish-package-if-needed.sh`, `scripts/smoke-packed-omnigent-transport.mjs`,
  `tests/guard/**`, `tests/helpers/guard-process.ts`,
  `tests/helpers/guard-postgres.ts`, `tests/helpers/guard-stages.ts`,
  `packages/state-ledger/src/cross-process.test.ts`,
  `packages/worktree-leasing/src/locks.test.ts`,
  `packages/worktree-leasing/src/race-proof.test.ts`,
  `packages/worktree-leasing/src/supabase-lease-store.test.ts`.
- **Interfaces provided**: GUARD commands; SQL setup receipt; bounded child helper.
- **Interfaces consumed**: Existing pnpm workspace scripts (pre-existing); package exports (pre-existing);
  CASE-HY-5/6 (pre-existing); all `supabase/migrations/*.sql` (pre-existing, read-only).
- **Parallel-safe**: no; one worker in its assigned worktree.
- **Tasks**:
  - test: Add path-entered controls through the real gate orchestration: each
    stage exits nonzero in turn, later stages do not run, success runs each once.
    Exercise spawn errors, failed children and signal termination: null exit
    status must fail, never compare as numeric zero. Dependency injection
    for tests must not expose a CI environment bypass or production skip flag.
    Test workflow topology: PR/main and release call the same gate; publishing
    needs verification, with id-token only on real publication. Assert
    verification inherits no secrets and references no repository secrets.
    Freeze tested_source_sha from event context inside verify.yml and each
    consumer job: pull_request uses github.event.pull_request.head.sha; release,
    push and workflow_dispatch use github.sha. No caller-supplied ref/branch/tag is
    accepted. Record github.sha, PR head/base SHAs when present, and the tested
    source separately; use tested_source_sha throughout checkout, manifests,
    rehearsal and closeout. Test push routing, distinct synthetic-merge/head SHAs, rejected
    caller refs and mismatched identity bindings. Do not use pull_request_target. Verification emits source SHA plus lockfile and public
    package manifest digests; publishing checks equality before npm effects.
    Mutated checkout SHA or manifest/lockfile digests must block publication.
    Verification packs these three public packages once from the verified build:
    @consiliency/runtime-provider (packages/core-contracts),
    @consiliency/pipeline-provider-adapter (packages/governed-pipeline-adapter),
    @consiliency/omnigent-transport (packages/omnigent-transport), in that order.
    Reject unexpected/private identities. It
    writes a manifest binding each tarball SHA-256/name/version to source and
    dependency inputs, and uploads only that artifact set. Publication downloads
    that same run's artifact ID, checks all digests and package identities and
    publishes those exact tarballs without reinstalling, rebuilding or repacking.
    The id-token job needs that producing verify job and invokes only
    --verified-artifact; no caller-supplied artifact ID. Test these constraints.
    A tampered tarball with unchanged HEAD and manifest/lockfile identities
    must fail the artifact check before any npm mutation. Existing versions
    retain their registry skip behavior; no version is changed in GUARD.
    Add --tarball <absolute-path> to the existing transport smoke. The full
    gate installs that retained verified tarball without repacking; preserve
    no-argument standalone behavior. Check its hash before/after smoke and
    before upload/publication. Preserve existing assertions without expanding
    it into PREP's all-package fixture/declaration/independent-consumer proof.
    GUARD verifies artifact transfer integrity, not closure of CASE-HY-4.
  - impl: Add a reusable verification workflow with read-only permissions,
    hosted Ubuntu, Node24, pnpm11.1.1, frozen lockfile, a version-pinned PostgreSQL
    service from External Inputs, client installation, bounded readiness and job timeout. Keep npm
    publication order/OIDC unchanged; no agent-harness/FABPUB dependency.
    Preserve publish-package-if-needed.sh <package-directory> and its existing
    NPM_PUBLISH_DRY_RUN=1 path. Add mutually exclusive --verified-artifact
    <manifest> <package-name> mode that never packs/builds; retain existing-version skips and fail on
    registry errors other than E404 in both modes. Within publish.yml, PR runs
    and workflow_dispatch default to dry-run. A separate no-id-token rehearsal
    job downloads the same run's verified artifact ID, validates all source,
    manifest and tarball identities, and invokes verified-artifact mode with
    NPM_PUBLISH_DRY_RUN=1. Only release-published or explicitly selected dispatch
    publish mode may run the separate id-token publication job. Test mode
    routing, tampered-artifact rejection and absence of npm mutation in rehearsal.
    Add a stub NPM_CLI falsifier that returns E404 and proves the non-skip
    verified-artifact path passes the retained tarball to npm, never pnpm pack;
    compare its digest and reject tampering. Existing-version hosted skips alone
    do not prove this path. Retain exact rehearsal run/SHA/artifact identities in GUARD closeout;
    real OIDC exchange and registry acceptance remain SHIP evidence.
  - test: Real disposable database positive control, unreachable loopback port,
    invalid SQL/migration, missing role, unexpected privilege attributes, and
    missing function must fail actual setup. Fixture mutation uses a temporary
    migration directory, never production files. Run destructive setup controls
    serially in separate owned disposable instances, never the admitted shared
    integration fixture. Their required case IDs must execute in verify;
    dropping them fails its real orchestration. Mock commands alone do not
    establish SQL acceptance.
  - impl: Reject missing/non-disposable DB configuration before any write. The
    test launcher owns a fresh PostgreSQL container/service with loopback
    binding, a dedicated omniagent_guard database and synthetic credentials.
    Do not accept ambient DATABASE_URL or remote hosts. Strip all inherited PG*
    and SUPABASE_* variables, DATABASE_URL and GUARD_TEST_DATABASE_URL before
    spawning installer/test children; inject only complete owned-fixture
    connection parameters. Disable ambient service/pgpass lookup using explicit
    nonexistent fixture-owned service/pass files; constrain libpq options and
    disable SSL for loopback. This includes PGHOSTADDR, PGSERVICEFILE, PGPASSFILE,
    PGOPTIONS and PGSSLMODE. Never log connection strings. Test hostile ambient
    host/service/options settings: use only the owned fixture or fail before
    bootstrap writes. Explicitly pass the
    fixture port and credentials from that owned service; read-only admission
    checks current_database, server identity and installer role before bootstrap.
    A reachable fixture with a different database name/host or unexpected
    identity must fail with zero role-creation/migration calls. A local
    launcher records its owned container ID/port and cleans only that instance.
    Hosted configuration uses the workflow-owned service, never production
    secrets. Implement the local launcher inside prepare-test-postgres.mjs;
    verify.yml is the reusable workflow. No additional launcher/workflow
    paths are implicitly owned. No ineligibility flag can waive these checks. Use `psql -X` and
    `ON_ERROR_STOP=1`, bounded connection/statement times, sorted complete
    migration set, and unmodified migration bytes. Bootstrap anon/authenticated
    as NOLOGIN NOSUPERUSER NOBYPASSRLS and service_role as NOLOGIN NOSUPERUSER
    BYPASSRLS, with no CREATEDB/CREATEROLE/REPLICATION. The installer is the
    disposable postgres superuser; verify attributes. Create a distinct
    guard_client LOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT test role with none
    of CREATEDB/CREATEROLE/REPLICATION, grant service_role membership and
    use its explicit GUARD_TEST_DATABASE_URL for integration, never the
    installer URL. Assert session_user=guard_client and non-superuser before
    SET ROLE service_role; superuser test credentials must fail admission.
    Never export installer credentials as DATABASE_URL; remove inherited
    DATABASE_URL from test child environments. The default test identity is
    guard_client with no inherited BYPASSRLS; SET ROLE service_role is limited
    to a dedicated GUARD probe connection, closed in finally on success/failure
    and never returned to a pool. Assert fresh default connections have
    current_user=session_user=guard_client. COORD must select/test its own
    caller roles rather than inherit this probe's role. Keep synthetic
    credentials scoped to this disposable instance. Resolve
    coordination_acquire_lease(jsonb) by signature only, never execute it.
    Execute only coordination_query_leases('{}'::jsonb) in a read-only
    transaction as service_role using SET ROLE; separately assert current
    caller identity and execute grants. SECURITY DEFINER execution is not
    general RLS or hosted Supabase proof. COORD owns RPC/behavioral tests.
    The sole current migration uses public tables, core gen_random_uuid(),
    PL/pgSQL and the named roles; no auth schema or extension is referenced.
    No stubs or migration rewrites are authorized. Changed prerequisites fail
    and require a scoped amendment. SL-0's producer emits a metadata-only SQL
    receipt: image/platform, admitted role attributes, migration hashes, probe
    status and cleanup. Parent SL-2 alone retains the final run's receipt at
    plans/evidence/v2/GUARD-sql-setup.json; no credentials or URLs are retained.
  - test: Add TypeScript AST-based recursive production source import controls:
    public exports pass, new relative source escapes fail, dynamic import,
    re-export, import-type, type-query import("...") expressions, triple-slash
    path references and tsconfig path-alias forms cannot evade inspection.
    Include an alias-to-another-package-source negative control. Baseline only
    the exact three type-only OmnigentProviderMode imports in CASE-HY-6;
    changing name/target/kind or adding another edge fails. Fail stale unused
    exceptions so PREP removes the baseline with source repair.
  - impl: Retain existing dependency/conformance tests. Type-aware lint adds
    no-floating-promises to a documented initial tooling/test scope with
    positive awaited and negative floating cases. Production-wide rollout is
    explicitly deferred to owned behavioral phases if it requires semantic
    fixes; do not add arbitrary void suppressions or mutate production logic.
    Preserve existing lint coverage; new type-aware lint/typecheck overrides
    include only SL-0-owned scripts, tests/guard/** and the three owned guard
    helpers via tsconfig.guard.json. The four process suites retain existing
    lint rules; new promise rules do not widen their allowed edits. No wider
    glob or unowned source fix is authorized without an ownership amendment.
  - test: Prove a deliberate hung child and descendant terminate within their
    bound, report nonzero, and leave no live child. Preserve real lock/race
    assertions. Missing command/readiness failure follows cleanup too.
  - impl: Limit the four owned existing process suites to timeout, readiness and
    cleanup changes; DATA/COORD behavioral assertions remain unchanged.
    Freeze job timeout at 20 minutes, SQL connect at 5 seconds, statements
    at 10 seconds, readiness at 30 seconds and process operations at 15 seconds
    (test-level timeouts allow the documented number of operations). The hung
    child control uses a 250 ms budget, escalates test-owned groups after
    500 ms, and requires no live descendant within 2 seconds of escalation.
    Local fixture cleanup handles SIGINT/SIGTERM and failure paths; SIGKILL
    cannot promise traps and leaves only a labeled disposable instance.
    Bound synchronous process tests and async readiness/exit waits; kill
    only test-owned process groups on cleanup, never external reviewers.
    Spawn POSIX children with detached:true and track owned group IDs before
    any group signal; assert the parent runner and unrelated processes survive.
    Avoid broad test-pool changes or arbitrary coverage thresholds; record
    current timing and clearly defer coverage instrumentation if unsupported.
  - verify: `pnpm test:guard`, `pnpm test:integration`, `pnpm lint`,
    `pnpm typecheck`, then `pnpm verify` with disposable SQL available.

### SL-1 - Readiness and claim inventory

- **Scope**: Replace unsupported operational claims with evidence-scoped wording.
- **Owned files**: `README.md`, `docs/hardening-readiness.md`,
  `fixtures/hardening/readiness/docs-contract.json`,
  `packages/cli/src/hardening-readiness.test.ts`.
- **Interfaces provided**: Audit section-6 claim inventory and truthful current commands.
- **Interfaces consumed**: GUARD commands; SQL setup receipt; audit findings (pre-existing);
  disposition ownership (pre-existing); provider cleanup/retry APIs (pre-existing, read-only).
- **Parallel-safe**: no; a separate worker/worktree after SL-0 freezes commands.
- **Tasks**:
  - test: Preserve alpha/not-production/not-public-beta/not-multi-user posture
    and metadata-only/live opt-in requirements. Update phrase-based tests only
    where necessary while retaining equivalent scope/ownership assertions.
  - impl: Inventory all section-6 claims, tie each to implemented primitive
    and test evidence or DATA/COORD/WIRE/INTEG/PREP owner. Distinguish
    caller-driven retries, process cleanup, heartbeat/renewal and scheduling
    from an automatic supervisor; no component-test-to-end-to-end inference.
    Explain durable state and content restrictions accurately pending fixes.
    Report backoff/confidence claims and HY-1/HY-5/HY-6 delivered/deferred
    subclaims explicitly. Keep license selection pending PREP.
  - verify: `pnpm exec vitest run packages/cli/src/hardening-readiness.test.ts`.

### SL-2 - Integrated acceptance and docs sweep

- **Scope**: Independently verify and review the combined candidate before landing.
- **Owned files**: `plans/evidence/v2/GUARD.json`,
  `plans/evidence/v2/GUARD-closeout.json`, `plans/evidence/v2/GUARD-sql-setup.json`,
  `plans/evidence/v2/GUARD-reviews.md`,
  `plans/evidence/v2/reviews/GUARD-*.json`.
- **Interfaces provided**: IF-0-GUARD-2 only after acceptance.
- **Interfaces consumed**: GUARD commands; SQL setup receipt; Audit section-6 claim inventory and truthful current commands;
  exact-input panel results (pre-existing).
- **Parallel-safe**: no; parent-only reducer.
- **Tasks**:
  - test: Re-run the full gate from clean integrated candidate, positive and
    negative controls, and hosted CI on the PR head. Record exact commands,
    exits, test counts/skips, hashes and environment/tool versions.
  - impl: Reconcile four-agent production CR on the integrated content;
    material fixes trigger fresh review. No unavailable/refusing seat counts
    as approval; Fable must use the subscription TUI route. Record every
    deferred finding/owner without closing unresolved audit issues.
  - verify: Match reviewed content to PR head, passing shared CI, no unrelated
    runtime/migration/version changes, and explicit manual closeout if runner
    remains broken. Use GitHub PR merge on the exact accepted head after
    required checks/protections pass, not direct main push or fabricated FABPUB
    success. Record PR URL, reviewed/merged SHA, checks and the explicit manual
    route. CI exposes the stable required check guard-required: it runs after
    shared verification and fails for skipped/cancelled/failed verification.
    SL-0 owns its workflow wiring and falsifiers; SL-2 records the observed
    check context and verifies protection requires it. Protection changes stay
    maintainer-owned, never silently waived. Reconcile ambiguous prior effects first. Then plan DATA
    on main; GUARD dispatches no release.

## Execution Notes

The coordinator assigns one isolated worktree per worker, records actual
paths/branch/base in ignored scheduling evidence and verifies disjoint changed
paths against this ownership list before integration. Lanes execute serially;
no concurrent-writer authority is inferred from prose or native subagents.
The parent owns roadmap/plan/TRIAGE-amendment records separately from execution
lanes, including manifest/handoff updates. Any newly required source ownership
is amended and reviewed before implementation.

SL-2 records no_doc_delta for README/CHANGELOG/release notes: SL-1 owns the
README/readiness changes and SL-2 checks those outputs without rewriting them.
GUARD does not dispatch a release or change package versions. The validator's
release-shaped heuristic warning does not authorize a SHIP action here.

## Verification

- Operator planning check: `node plans/evidence/v2/verify-triage.mjs` includes
  phase-loop roadmap validation; do not add it to the hosted product gate.
- Inventory-only: `node plans/evidence/v2/verify-triage.mjs --inventory-only`
  needs Node only. Neither form grants acceptance; do not silently skip failed
  roadmap validation when its command is unavailable.
- `pnpm verify`
- `pnpm test:guard`
- `pnpm test:integration`
- `git diff --check`

Tests may use fake stages for failure propagation, but the full gate must also
run every real stage. SQL-only proof is not hosted Supabase proof. The one live
provider smoke remains explicitly opt-in and is not part of GUARD acceptance;
missing required integration setup may never become skip-only green.

## Acceptance Criteria

- [ ] EC-GUARD-1 - Proven by `pnpm verify`, gate falsifiers and hosted PR
  verification; falsified by a suppressed exit, missing stage or bypassable
  release dependency.
- [ ] EC-GUARD-2 - Proven by `pnpm test:guard` and `pnpm test:integration`;
  falsified by skipped DB setup, altered migration, unexpected caller/role,
  leaked stalled child or empty focused execution passing.
- [ ] EC-GUARD-3 - Proven by `pnpm exec vitest run packages/cli/src/hardening-readiness.test.ts` plus source-grounded review of
  section-6 inventory; falsified by unsupported automatic supervision or
  unowned/deceptively completed HY subclaims.

## Spec Closeout Plan

- schema: `spec_delta_closeout.v1`
- decision: `no_spec_delta`
- target surfaces: `.github/workflows/`, `docs/hardening-readiness.md`
- evidence paths: `plans/evidence/v2/GUARD.json`
- redaction posture: `metadata_only`
- downstream handling: `none`
