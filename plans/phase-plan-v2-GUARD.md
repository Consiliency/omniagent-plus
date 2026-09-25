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
TRIAGE and the prior GUARD plan were accepted after round 9. Production review
found repairable GUARD defects; the process-custody amendment below is pending
fresh four-seat review. On 2026-09-15 the maintainer approved the recommended
Linux-only GUARD verification scope by responding "Continue as recommended"
to that explicit question; published runtime portability remains unchanged.
On 2026-09-24 the maintainer explicitly selected Claude Opus 5.5 instead of
Fable for the new plan and production panels; historical Fable rounds remain
historical evidence.
Do not execute newly added ownership until fresh review is reconciled. Historical
TRIAGE/round-9 bindings remain immutable evidence, not approval of this amendment.
Preserve historical runner state. Do not repair agent-harness as a prerequisite.

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
files and verify-triage.mjs were included in earlier code-review inputs. This
amendment's plan-only board does not claim source or SL-2 code coverage. The TRIAGE checker
checks case membership, not import syntax; source inventory is reviewed
separately and SL-0's recursive AST controls enforce it.

## External Inputs

- Disposable SQL fixture, linux/amd64:
  `postgres@sha256:45cd22f8d32e189d245403954882f88e7a8714301fda80dab6da90f1265b25a3`.
  Registry metadata for postgres:17.6-bookworm verified on 2026-09-14.
  Pin the same digest and platform in local launcher and workflow and test
  their equality. Do not assume the image is already cached.
  This is test infrastructure only, not a production PostgreSQL recommendation.
  Local clone/syscall controls require x86_64 Linux; another architecture
  needs a separately reviewed equivalent fixture, not a passing skip. Record
  the effective Linux/x86_64 scope in the platform receipt and SL-1 command
  docs; do not describe plain pnpm test as architecture-neutral.
- Existing pnpm11.1.1 and Node24 toolchain; dependency lockfile unchanged unless
  declared test-only tooling requires an explicit lockfile update.
- Proposed process-custody prerequisite, pending amendment approval: Linux
  kernel >=5.3, Python >=3.10 with standard-library ctypes, os.pidfd_open and
  signal.pidfd_send_signal, permitted PR_SET_CHILD_SUBREAPER/GET and pidfd
  operations, and readable owned /proc task/children metadata. No pip/npm
  runtime dependency, privileged cgroup, global subreaper or host setting change.
  Check capabilities before any guarded payload, not just version strings;
  the fdinfo `Pid:` identity field is capability-gated rather than assumed
  solely from the >=5.3 kernel floor.
  Establish these prerequisites in verification and artifact-consumer jobs.
- Pre-SL-0 inventory: `plans/evidence/v2/reviews/GUARD-pre-SL0-inventory-20260915.json`
  covers all 213 tracked package source files (all .ts), static/dynamic literal
  imports, exports, type queries and references. Exactly the three CASE-HY-6
  edges were found; tsconfigs contain no path aliases. The one computed require
  in core-contracts/coordination-contract.ts has the fixed published-package
  prefix @consiliency/contract/, not a relative source prefix. This is inventory,
  not evasion-proof enforcement. Supplement it with the parent-owned
  GUARD-pre-SL0-inventory-20260915-r2.json: package subtree equality between
  receipt base and inventory HEAD, working-byte checks, import maps, symlinks,
  and current publish-helper/smoke digests. Characterize process-spawning
  package tests in a detection-only pre-SL-0 run; record adopted descendants
  without turning rescue into a passing custody test. Preserve both dated records;
  subsequent inventories use new filenames, never overwrite reviewed evidence.
  That inventory's then-current sole workflow was publish.yml,
  with all three publish-helper calls. Recheck before SL-0; newly discovered
  unowned edges or publishing workflows require an ownership amendment.

## Interface Freeze Gates

- [ ] IF-0-GUARD-2 - One full fail-propagating verification command, shared by
  PR/main and release, with deterministic tests, mandatory disposable SQL
  setup, packed consumer smoke and evidence-scoped readiness.

Freeze these commands: `pnpm verify` runs frozen install, build, lint,
workspace and tooling typecheck, boundary checks, mandatory PostgreSQL setup,
one root test suite and transport pack smoke. `pnpm test` remains the
noncredentialed deterministic suite with opt-in live smoke excluded.
`pnpm test` launches its root suite under the same custody helper, without a
fixture. `pnpm test:guard` owns a disposable fixture and runs tooling falsifiers,
including SQL setup positive/negative controls. `pnpm test:integration` owns
one when run standalone. Neither accepts ambient credentials. The full gate
reuses one admitted fixture and one root suite. Name all live-SQL-dependent
cases tests/guard/*.db.test.ts; non-DB pnpm test excludes that selector before
collection, never by runtime skips.
The root test configuration collects package tests plus tests/guard; the full
gate launches it exactly once under guarded process custody. An internal
`scripts/verify.mjs` suite-runner mode receives admitted fixture parameters
over private stdin, never as root Vitest environment or argv. The runner uses
the pinned Vitest 3 Node API to provide fixture parameters only to the
`guard-db` project; DB tests consume them through `inject`, not process.env.
No root/global provide or non-DB project context contains those parameters.
Plain pnpm test unconditionally clears DB enablement and
connection variables and excludes the DB selector even when those values are
pre-set. Only verify/test:guard/test:integration may enable DB collection after
fixture admission; test hostile ambient enablement through plain pnpm test.
In admitted runs, a missing connection, empty DB collection or skipped required
DB case fails.
Both plain test and every GUARD launcher remove OMNIAGENT_PLUS_LIVE_OMNIGENT*,
OMNIGENT_*, and provider credential/route variables from child environments;
build them from a tested noncredentialed allowlist, never inherit process.env
wholesale. Test hostile live opt-in, endpoint, bearer and provider-key values:
no live smoke or provider call may occur. Fixture parameters are injected only
after admission. Preserve separately documented explicit live-smoke invocation
outside GUARD: after build, an operator may run
`pnpm exec vitest run packages/omnigent-transport/src/live-omnigent-smoke.test.ts`
with the existing explicit live environment gate. SL-1 documents this direct
invocation; pnpm test never enables it. The full-root skip set must equal exactly the named live case
in packages/omnigent-transport/src/live-omnigent-smoke.test.ts; additional
skipped/todo cases fail. Focused GUARD/integration runs permit no skipped cases.
The full gate isolates DB/non-DB workers within one root invocation; only DB
workers receive fixture parameters. Test zero fixture-environment leakage at
worker start and in descendants, and deny non-DB workers access through
`inject` as well as process.env. Required setup/DB case IDs live in
tests/guard/required-cases.json, partitioned into setup and integration IDs;
dropped, renamed or skipped command-required IDs fail the gate.
Add a tooling partition binding each required custody ID to the exact
tests/guard/process.test.ts path: GUARD-CUSTODY-immediate-orphan,
GUARD-CUSTODY-double-fork, GUARD-CUSTODY-clone-reap,
GUARD-CUSTODY-thread-leader-exit, GUARD-CUSTODY-hung-child and
GUARD-CUSTODY-legacy-positive. verify and test:guard require this partition;
test:integration remains DB-only. Preserve existing setup/integration mappings.
Adapt checkResults to these explicit tooling file/ID bindings; never infer a
*.tooling.db.test.ts filename. Missing, renamed, skipped, duplicated or wrong-file
custody cases fail even when SQL passes. Add suppression controls through the
real verifier, not only synthetic success reports.
The full gate asserts that the designated integration cases actually executed;
test:guard runs tooling plus setup and integration IDs; test:integration runs
only integration IDs, never destructive setup controls. Use distinct
*.setup.db.test.ts and *.integration.db.test.ts selectors. The manifest maps
each command to its required IDs; verify requires setup, integration and tooling partitions. Both focused runs are subsets of
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
  `tests/helpers/guard-supervisor.py`,
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
    needs verification, with id-token:write only at the real publication job
    level, never workflow-level or inherited by verification/rehearsal. Assert
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
    Emit artifact_manifest_sha256 as a producer job output, outside the uploaded
    artifact. Rehearsal/publication consume only that producing job's output and
    reject a downloaded manifest with a different digest before reading tarball
    entries. Test replacement of both manifest and tarball together; internally
    consistent replacement cannot bypass the independent expected digest.
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
    <manifest> <package-name> --expected-manifest-sha256 <digest> mode that
    requires the producing job's independent digest, checks it inside the
    helper before manifest entries or any registry operation, and never
    packs/builds. Missing/mismatched digest and replaced manifest-plus-tarball
    controls must exercise this same helper entrypoint. Retain existing-version skips and fail on
    registry errors other than E404 in both modes. Within publish.yml, PR runs
    and workflow_dispatch default to dry-run. A separate no-id-token rehearsal
    job downloads the same run's verified artifact ID, validates all source,
    manifest and tarball identities, and invokes verified-artifact mode with
    NPM_PUBLISH_DRY_RUN=1. Only release-published or explicitly selected dispatch
    publish mode may run the separate id-token publication job. Dispatch publish
    additionally requires github.ref to equal the repository's default-branch
    ref and github.ref_protected=true; reject other refs before starting that
    job. Protection remains maintainer-owned and SL-2 verified. Release-published
    routing remains unchanged. Assert rehearsal/publication set no NPM_CLI
    override; stubs are local test-only inputs. Test mode
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
    hosted destructive controls also use the local Docker launcher for their
    own containers; the workflow service remains only the shared integration
    fixture. Missing Docker support fails, never skips those controls.
    Dropping required controls fails the real orchestration. Mock commands alone do not
    establish SQL acceptance.
  - impl: Reject missing/non-disposable DB configuration before any write. The
    test launcher owns a fresh PostgreSQL container/service with loopback
    binding, a dedicated omniagent_guard database and synthetic credentials.
    Do not accept ambient DATABASE_URL or remote hosts. Strip all inherited PG*
    and SUPABASE_* variables, DATABASE_URL and GUARD_TEST_DATABASE_URL before
    spawning installer/test children; pass only complete owned-fixture
    connection parameters over the suite runner's private stdin into the
    `guard-db` project context. Disable ambient service/pgpass lookup using explicit
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
    secrets. Freeze --fixture-mode local|github-service (default local).
    Local mode ignores all ambient GUARD_FIXTURE_* values. The explicit hosted
    mode requires GitHub Actions and the workflow-provided tuple
    GUARD_FIXTURE_CONTAINER_ID (job.services.postgres.id), GUARD_FIXTURE_PORT
    (the mapped service port), GUARD_FIXTURE_DATABASE=omniagent_guard,
    GUARD_FIXTURE_INSTALLER_USER=postgres and GUARD_FIXTURE_INSTALLER_PASSWORD
    (synthetic workflow-service password, never a repo secret). Host is fixed
    to 127.0.0.1. Configure the hosted Docker port mapping explicitly with
    127.0.0.1 as HostIp, not Docker's default all-interface binding; assert the
    workflow mapping and runtime metadata agree. Read-only Docker metadata must match that exact owned service's
    pinned image/platform and loopback mapping before SQL admission; reject
    missing/mismatched identity before bootstrap. The first hosted run must
    demonstrate that GitHub accepts this HostIp mapping and that
    `job.services.postgres.ports['5432']` supplies the mapped host port; prove
    the loopback HostIp separately from Docker metadata. A mismatch stops for an amendment,
    not an all-interface fallback. Do not propagate this installer
    tuple to test workers. Test forged/missing mode inputs and ambient URLs.
    Implement the local launcher inside prepare-test-postgres.mjs;
    verify.yml is the reusable workflow. No additional launcher/workflow
    paths are implicitly owned. No ineligibility flag can waive these checks. Use `psql -X` and
    `ON_ERROR_STOP=1`, bounded connection/statement times, sorted complete
    migration set, and unmodified migration bytes. Bootstrap anon/authenticated
    as NOLOGIN NOSUPERUSER NOBYPASSRLS and service_role as NOLOGIN NOSUPERUSER
    BYPASSRLS, with no CREATEDB/CREATEROLE/REPLICATION. The installer is the
    disposable postgres superuser; verify attributes. Create a distinct
    guard_client LOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT test role with none
    of CREATEDB/CREATEROLE/REPLICATION, grant service_role membership with
    explicit ADMIN FALSE, INHERIT FALSE and SET TRUE options, assert those
    membership attributes, and
    inject the guard_client connection only into the guard-db project, never
    the installer URL or the root Vitest environment. Assert session_user=guard_client and non-superuser before
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
    status and cleanup. Every hosted run also records the workflow-mapped
    host port, Docker HostIp/host-port metadata, their agreement and the
    separate non-loopback refusal control; the first run is not the only
    evidence. For a hosted runner-owned service, record cleanup as
    runner-owned/unobserved, not removed-owned-container; upload the metadata
    receipt before the job ends. Its runtime output is the owned ignored run
    directory .phase-loop/guard/<run-id>/sql-setup.json, never a plans/evidence file.
    Parent SL-2 alone retains the final integrated PR-head hosted run's
    receipt at plans/evidence/v2/GUARD-sql-setup.json; retain post-merge
    evidence separately. No credentials or URLs are retained.
  - test: Add TypeScript AST-based recursive production source import controls:
    public exports pass, new relative source escapes fail, dynamic import,
    re-export, literal require, TypeScript import-equals, import-type,
    type-query import("...") expressions, triple-slash path references,
    package.json imports maps and tsconfig path-alias forms cannot evade inspection.
    Resolve mapped paths and tracked symlink targets before owner comparison;
    reject unsupported source extensions or unresolved module-loader forms.
    Computed import/require fails closed except the exact existing
    loadCoordinationContractArtifact call in core-contracts/coordination-contract.ts,
    require(`@consiliency/contract/${path}`), with its current createRequire
    binding. Pin that single source location and AST shape, not a blanket
    computed-prefix exemption. Preserve the published-contract loader without
    rewriting it. Positive control: that existing call passes. Negative controls:
    a computed relative prefix, new computed call, changed prefix/binding,
    literal cross-package require/import-equals, mapped or symlink source escape.
    This is a source-boundary rule, not a general JavaScript sandbox.
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
  - impl: Limit the four owned existing process suites to timeout, readiness,
    cleanup and explicitly constructed synthetic child-environment changes;
    DATA/COORD behavioral assertions remain unchanged.
    Freeze job timeout at 20 minutes, SQL connect at 5 seconds, statements
    at 10 seconds, readiness at 30 seconds and process operations at 15 seconds
    (test-level timeouts allow the documented number of operations). The
    workflow records a CLOCK_MONOTONIC stamp in its first step and passes an
    internal cutoff at stamp+17 minutes explicitly to later steps and workers;
    this budgets nominal three-minute headroom for the largest 112.5-second
    reservation and receipt upload under the 20-minute external job limit.
    The external runner clock may start before that first step; never infer a
    guaranteed receipt from the internal stamp. Check remaining time before
    every resource effect; insufficient funding fails before admission. An
    external runner kill before a receipt is unproven failure, never a claimed
    cleanup success. Standalone `pnpm test` declares a 15-minute root lifetime
    from entry and reserves its forced-drain tail within that bound, without
    accepting an ambient deadline override. The hung
    child control uses a 250 ms budget from supervisor spawn, but must first
    prove validated ADMIT, payload start and a live descendant; `not_started`
    fails the control rather than passing vacuously. Record handshake latency
    in the immediate-exit series; an untenable 250 ms bound needs a reviewed
    amendment, not a quiet timeout increase. It escalates custody-owned payloads after
    500 ms, and requires no live descendant within 2 seconds of escalation.
    Run the 250 ms timing control without concurrent test files; no runner
    scheduling jitter may turn `not_started` into a passing result.
    Pull the exact image digest/platform in a separate 300-second bounded
    step before local/destructive container creation and the 30-second readiness
    clock. Hosted shared-service readiness follows the runner's image pull.
    Test a slow cold pull independently from readiness; failed pull fails setup.
    Local fixture cleanup handles SIGINT/SIGTERM and failure paths; SIGKILL
    cannot promise traps and leaves only a labeled disposable instance.
    Bound synchronous process tests and async readiness/exit waits; cleanup
    uses only the kernel custody protocol in the amendment below, never
    external reviewers or raw-PID/PGID signaling. Assert the parent runner and
    unrelated processes survive. This replaces the historical detached/group
    and polling-only path for every guarded launch without relaxing timing.
    Avoid broad test-pool changes or arbitrary coverage thresholds; record
    current timing and clearly defer coverage instrumentation if unsupported.
  - verify: `pnpm test:guard`, `pnpm test:integration`, `pnpm lint`,
    `pnpm typecheck`, then `pnpm verify` with disposable SQL available.

### SL-1 - Readiness and claim inventory

- **Scope**: Replace unsupported operational claims with evidence-scoped wording.
- **Owned files**: `README.md`, `docs/hardening-readiness.md`, `docs/omnigent-live-smoke.md`,
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
    as approval; Opus 5.5 must use the subscription TUI route. Record every
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
    Record whether branch protection requires up-to-date branches, and retain
    the post-merge main verification run for the actual merged SHA; PR-head
    verification is not automatically proof of the distinct merge commit.

## Process Custody Amendment

Status: revised after custody rounds 1 through 5; pending complete review of
these amended bytes. A tiny native Fable transport probe succeeded, but the
full-plan-only round 5 again stalled without Fable review text. Codex/Gemini
returned AGREE and Grok returned PARTIALLY AGREE with explicit full-plan
coverage; no source-code coverage was claimed. Verified round-5 clarifications
are incorporated below without transferring votes. Maintainer Linux-only approval
is recorded in Context. This is
an SL-0 tooling repair, not an automatic product supervisor. No change to
packages/omnigent-transport/src/process-manager.ts or other product runtime,
package versions, migrations, authority crypto, published contract or release
dispatch is authorized. Existing SL-1/SL-2 ownership and serial execution stay
unchanged. Only tests/helpers/guard-supervisor.py is newly owned; its callers,
workflow prerequisites and tests are already SL-0-owned. SL-1 may update its
existing command/prerequisite documentation after the helper is verified.

Reason: production review identified interrupted detached children. The first
repair's 20 ms ancestry polling still misses children whose parent exits
immediately; the coordinator's repeated control observed 8 escapes in 10
trials, then cleaned every marked probe child using its own PID/start identity.
The existing 100 ms-delay positive is insufficient. Passing ordinary suites
does not supersede this counterexample. Preserve both failed review and probe
evidence; do not shorten polling intervals or add readiness sleeps as the fix.

- Custody: launch a dedicated, unprivileged Linux subreaper supervisor per
  owned command. Set and read back kernel subreaper status before spawning the
  payload. The supervisor is the sole fork/exec parent of the payload; Node
  never launches a sibling payload. Use isolated Python (-I -S -B), standard library only, shell-free
  argv, and the existing explicit environment/cwd policy. No global process
  enumeration or signaling based only on matching names, labels or stale PIDs.
  The Node custody client must load before frozen install and in artifact
  consumers that do not reinstall: use dependency-free Node 24-loadable code
  (`.mjs`, or erasable-only TS with explicit `.ts` specifiers and `node:` imports),
  not built package output or tsconfig-dependent resolution. Test verify's
  entrypoint and the artifact verifier in a disposable checkout with no
  `node_modules`; READY and admission must precede install/pnpm effects.
  Retain pidfds for signal identity; serialize reaping and ownership updates.
  Signal direct/adopted children only, holding them unreaped during pidfd
  acquisition and parent/start/fdinfo checks. Do not signal non-child descendants:
  terminate an owned intermediate and let the kernel adopt its children.
  Kernel reparenting preserves custody after intermediate exit, including
  double forks and new sessions. There is no raw-PID/PGID signaling fallback
  or Node polling backup. Zombies can be reaped immediately without pidfds;
  their children were already reparented before they became reapable. Preserve
  raw status before retiring identity, close descriptors on reap, and fail
  unproven on resource exhaustion. A thread-leader Z state alone is not process
  death; live non-leader threads remain capable of creating children.
- Admission: use dedicated control/status file descriptors, never payload
  stdout/stderr. The Node owner registers the supervisor and acknowledges its
  successful capability handshake before payload admission. Refuse absent
  Python, unsupported platform/kernel, denied capabilities, malformed/closed
  handshake, or cancellation before admission without launching the payload.
  Never silently fall back to polling or turn unsupported custody into a skip.
  Under the approved Linux-only decision all GUARD verification commands,
  including pnpm test, require this backend; published runtime portability
  is unchanged. Native macOS/Windows process containment is deferred.
  Handshake silence consumes the existing operation budget, starting at spawn;
  it never earns an additional timeout. Admission authorization linearizes at
  the owner: after READY, synchronously check cancellation and enqueue the one
  ADMIT record with no intervening await. Cancellation before authorization
  forbids ADMIT; after authorization the payload may start and must drain.
  Authorization is not proof of supervisor admission or payload execution.
  The owner drains according to validated protocol state: a matching terminal
  not_started with proven probe quiescence is valid after an authorized write
  if the supervisor canceled before validation. Missing or contradictory final
  evidence remains unproven; neither write completion nor EOF proves no exec.
  The supervisor may exec only after validating ADMIT. Do not promise that an
  owner-side cancellation can overtake an already buffered record; test buffered
  ADMIT followed by cancellation/EOF explicitly. A failed/partial write is a
  protocol failure, never evidence that payload execution was impossible.
  Install INT/TERM/HUP handlers before READY and before capability probe children.
  In the supervisor's serialized admission state, an OS INT/TERM/HUP or control EOF
  observed before validated ADMIT latches cancellation: never fork the payload,
  reject any later buffered ADMIT, and emit RESULT not_started if the protocol
  remains usable. not_started describes the payload only: terminate and reap
  any already-created capability probe children with the same serialized __WALL
  reaper, close their pidfds, and prove quiescence before reporting successful
  admission cleanup. If probe drain is unproven, preserve not_started plus failed
  custody; never exit claiming success while a probe survives. Probe teardown
  stays inside the original admission/forced-drain budgets, not new grace.
  After ADMIT, use started-and-drain semantics even when fork
  has not completed; do not assert that owner cancellation overtakes buffered
  admission. Death during interpreter startup before READY is a failed admission,
  never successful cleanup; missing final protocol evidence still fails closed.
  Node's supervisor spawn always clears options.signal so AbortSignal cannot
  kill the custodian outside the protocol. Test pre-READY, READY-before-ADMIT,
  validated-ADMIT and partial-write signal/EOF interleavings separately.
  Both endpoints exclusively own their respective control/status ends. Close
  all payload copies before exec, use CLOEXEC and close_fds, and verify this in
  payload and nested-supervisor descriptor-leak falsifiers. Do not assume Node
  exposes a JS-level CLOEXEC setter: each Node spawn passes only declared
  stdio, and the Python child closes every non-payload protocol descriptor
  before exec. A nested supervisor retaining its launcher's lifecycle endpoint
  fails the control; if the owned helpers cannot prevent it, stop for an
  ownership amendment. Version/nonce/sequence-bind every frame;
  reject duplicate, truncated, out-of-order and foreign-nonce records. Use a
  bounded, nonblocking status writer so a full pipe cannot stop kernel draining.
- Control/API freeze: protocol version 1 uses UTF-8 JSON-line frames, one JSON
  object per newline, at most 64 KiB including delimiter; oversized input fails
  before payload admission. Each direction has its own strictly increasing
  sequence from zero, a fixed version and a per-launch nonce. Frame types are
  READY, ADMIT, FORWARD, SHUTDOWN, DRAIN_NOTICE, WORK_DRAINED and RESULT.
  BEGIN_DRAIN is accepted only on the cooperative payload's separate lifecycle
  channel described below. ADMIT carries command,
  argv, cwd, an explicit already-scrubbed environment map, inherited umask,
  stdin/stdout/stderr descriptor mapping, operation deadline and pre-admitted
  cooperative cleanup ceiling (slots, child reservation and completion deadline).
  Build the ADMIT environment owner-side from cleanEnvironment plus explicit
  synthetic test fields. Installer/psql commands may receive their own admitted
  fixture fields, but the root Vitest suite runner receives no fixture secret
  in ADMIT env; it gets the private stdin payload described above. Never treat
  options.env as permission to pass ambient values wholesale. The four owned process suites
  replace their process.env spreads with the clean base plus their existing
  literal STATE_LEDGER_ROOT/ACTION/PAYLOAD, LOCK_ROOT/RESOURCE_ID/HOLDER/
  HOLD_OPEN/TIMEOUT_MS, STATE_ROOT, LEASE_REQUEST/OPTIONS, HOLD_OPEN, HOLDER and
  SELECTOR fields as applicable. Values remain caller-created test data, not
  inherited defaults. Preserve these exact fields in the already-built ADMIT
  map; do not re-filter them out in Python. No prefix-wide ambient allowlist.
  Neither endpoint reads ambient env as an extra source. Test that synthetic
  payloads survive while hostile live-provider, DB, loader and supervisor-routing
  variables do not reach the child; fixture injection retains its worker boundary. ADMIT is private transport,
  not a log or evidence payload; never retain its argv/env values as metadata.
  READY carries actual capability results;
  FORWARD names the signal without escalating; SHUTDOWN carries an epoch,
  cooperative/forced mode and immutable absolute deadline upper bounds, not
  a second independently selected effective cutoff. The supervisor alone
  selects and reports the cutoff, never later than those bounds, the admitted
  ceiling or its applicable drain budget. RESULT contains
  payload_pid, either exact exit code or signal (or typed not_started), typed
  spawn/custody errors, quiescent/unproven custody and adopted/force-killed counts.
  No argv/env/output content enters metadata. child.pid and native child events
  identify the supervisor, not the payload; the payload identity/status live
  in validated protocol state. waitExit/runProcess consume that state and
  require agreement with supervisor termination. signalOwned routes through
  the control protocol and never directly kills the last custodian. Existing
  test-only callers adapt lifecycle identity/status handling without weakening
  lock, race or exit-outcome assertions. Normal waitExit uses the payload result,
  not a bare supervisor close code; missing RESULT or mismatched supervisor
  termination fails. A cooperative-completion wait uses the selected effective
  shutdown deadline reported below, never a fresh caller-relative timeout. Successful custody
  mirrors the payload code/signal after RESULT; failed custody cannot mirror
  payload success. signalOwned(supervisorPid, signal) sends FORWARD, never a
  raw kill to the custodian. Direct OS INT/TERM to the supervisor are explicitly
  handled as cooperative forwarding after admission; they cannot use Python's
  default exit while a payload is owned. Pre-admission handling is defined above.
  Freeze spawn-time lifetime declarations for direct spawnOwned callers:
  runProcess charges handshake/execution to its existing operation timeout;
  holders spanning readiness, a competing operation and stdin release declare
  that composite lifetime before ADMIT within their existing enclosing test
  budget. The SQL launcher separately accounts for its existing image-pull,
  readiness and suite allocations. A later waitReady/waitExit cannot retroactively
  create or renew the admitted operation deadline. Cooperative cleanup uses only
  its separately reserved ceiling, never an increased ordinary operation budget.
- Completion: preserve command argv/cwd/stdin/stdout/stderr and direct payload
  exit code or signal semantics. A payload exit starts descendant accounting
  and passive wait until the admitted operation deadline, even when that
  payload succeeded. Withhold successful completion until the
  supervisor has reaped all owned/adopted children. One serialized reaper saves
  the payload's raw wait status. Spawn via fork/exec or posix_spawn, never a
  Popen object whose destructor or wait/poll can compete. Before payload exec,
  restore the intended child signal mask and default dispositions for signals
  the Python supervisor ignores or handles, including SIGPIPE and INT/TERM;
  do not leak the keeper's handlers, ignored signals or blocked mask. Add a native
  broken-pipe payload and masked-signal control against direct-launch semantics.
  Never substitute
  zero after ChildProcessError/ECHILD. Use waitpid(-1, WNOHANG | __WALL), with
  Linux __WALL=0x40000000 and SIGCHLD default/no automatic reaping. This avoids
  waitid(P_PIDFD)'s higher kernel floor. A wait result of zero is not exhaustion.
  Quiescence combines __WALL-inclusive ECHILD, empty per-thread children lists,
  and exit readiness of retained pidfds, re-evaluated after adoption/reaping.
  An empty /proc snapshot or a guardian exit alone is not proof. Require an owned-pipe final quiescence
  record and successful control-protocol completion; malformed/missing final
  evidence fails closed. Capability admission checks that pidfd fdinfo exposes
  the `Pid:` field used for identity validation. Do not expose credentials or payloads in diagnostics.
  A missing payload status is a protocol fault unless admission never occurred.
  Write the final record before mirroring the payload exit/re-raised signal;
  successful payload plus failed custody is always failure. An adopted
  non-payload child first seen in owned task children lists or returned by
  waitpid before the payload pidfd is exit-ready is unexpected, whether live
  or zombie: re-poll the pidfd immediately after the scan, and classify as
  pre-exit only if it remains unreadable. Mark a confirmed pre-exit launch
  failed and start the same bounded drain of the entire owned payload subtree,
  not only the adoptee. The serialized reaper checks owned per-thread children
  lists on SIGCHLD/other protocol wakes and on a periodic wake no more than
  50 ms apart while the payload runs; the scan detects adoption, but only
  kernel reaping plus final protocol proof establishes quiescence. If an
  unowned package test creates such an orphan, fail the root suite and request
  an ownership amendment rather than allowlist or silently rescue it. Adoption
  first observed after payload pidfd exit-readiness is normal-completion drain:
  mirror payload success only after every adopted child reaches proven
  quiescence by the admitted operation deadline. Wait passively for post-exit
  adoptees; do not signal them before that deadline. A child requiring a
  supervisor signal fails the launch, then enters the original forced drain
  within T. A post-exit service child still live at the deadline fails; no
  survivor is allowlisted. SL-2
  explicitly reviews unexpected adopted/forced counts instead of silently
  converting rescue into approval.
- Cancellation: the custody supervisor, not the Node owner, is the sole
  escalation owner for its payload subtree. Parent-requested teardown sends
  TERM to owned payloads, escalates with SIGKILL through retained pidfds at one
  absolute 500 ms deadline, and must
  reach kernel-confirmed quiescence within the following 2 seconds. Newly
  adopted descendants inherit those deadlines; they do not receive fresh grace.
  The 250 ms hung-operation, 15-second process-operation and other frozen
  budgets remain. Node must not kill its last custody supervisor at 500 ms.
  Reentrant teardown, controller-channel EOF, SIGHUP and nested supervisor exit must
  share the same drain operation. Descendants transfer only to a living
  ancestor subreaper when an inner supervisor dies, never to a sibling keeper.
  An outer forced drain retains its original absolute deadlines even if a
  nested launcher's local TERM handler requests cooperative cleanup. That
  local request cannot extend the outer drain; subsequent adoption and forced
  escalation use the outer deadline and proven ancestor custody. Do not infer
  cooperative/forced authority from a signal's apparent sender identity.
  Last/sibling keeper loss without a proven owned ancestor is unproven and
  potentially unreclaimable; do not infer adoption from ProcessScope membership.
  After ADMIT, SIGHUP follows the forced controller-EOF path, not Python's
  default termination or a renewed cooperative reservation.
  For ordinary/forced subtree drain, both owner and supervisor enforce the same
  absolute deadline, with protocol completion inside the existing two-second
  post-escalation window, not extra grace afterward. This does not shorten an
  admitted cooperative launcher to T: its final RESULT is due by the selected
  DRAIN_NOTICE cutoff after its reserved callbacks, as specified below.
  On timeout the surviving owner records custody-unproven with supervisor
  PID/start identity, retains custody and never sends an emergency kill to a
  potentially live last keeper. Missing final evidence always fails. If all
  observers die, neither a final record nor cleanup can be promised. A hung
  last keeper can leave local work alive past the deadline: record failure
  and retained identity, not bounded-cleanup success. No detached/group setting
  alone proves custody, and hosted cgroup teardown is not a GUARD receipt.
- Interruption/resource ordering: distinguish forwarding an external
  SIGINT/SIGTERM to a cooperative launcher from a parent's explicit forced
  teardown request, so the launcher can drain its children and run bounded
  fixture cleanup before exit. Test both paths. Preserve the existing rule
  that SIGKILL cannot guarantee container traps; never claim process custody
  proves cleanup of an external Docker daemon's resources. Loss of the final
  custodian, unavailable kernel operations, or deadline exhaustion produces
  unproven cleanup/failure evidence, never success or broad emergency kills.
  The root Vitest suite is ordinary work under a forced verify drain: nested
  cooperative launchers may be cut off before Docker callbacks. Record
  cleanup as unproven and retain the owned disposable container label/ID for
  operator inspection and manual removal; do not claim a successful SQL
  cleanup receipt. Test this interruption outcome. Nested launchers receive
  the inherited absolute job/scope ceiling through explicit runner-to-worker
  test metadata, separate from fixture secrets and ambient user configuration;
  missing or insufficient funding fails before resource effects.
  Repeated FORWARD requests do not become forced requests or reset deadlines.
  Freeze the routing matrix: external INT/TERM forwards cooperatively to the
  launcher; its ProcessScope shuts down ordinary work using one forced epoch,
  then executes bounded resource callbacks. Explicit parent forced close/abort
  and controller EOF use forced drain, not renewed cooperative reservations.
  The caller declares maximum cleanup slots/child reservation in ADMIT before
  payload exec. ProcessScope registers callbacks locally within that ceiling,
  before resource effects; it has no supervisor-control descriptor and cannot
  dynamically increase the parent's allowance. Propagate the admitted ceiling
  explicitly through known launcher calls, not ambient user configuration.
  A cooperative payload receives a separate, launch-owned lifecycle notification
  channel, never either exclusive owner-control/status endpoint. Its only outbound
  request is BEGIN_DRAIN for its own admitted reservation (normal completion,
  local failure or local interruption); it cannot supply a later deadline, alter
  slots, signal another process or authorize work. The supervisor also initiates
  this transition on external FORWARD. The first transition selects one epoch
  and effective absolute completion cutoff; subsequent cooperative requests
  reuse it. The supervisor sends DRAIN_NOTICE to the owning Node status reader
  and cooperative payload with the same version, launch nonce, epoch, mode and
  selected deadline. Each channel direction has its own sequence starting at
  zero; envelope sequence numbers need not match between status and lifecycle
  channels. BEGIN_DRAIN is payload-to-supervisor only; DRAIN_NOTICE is
  supervisor-to-payload on lifecycle and supervisor-to-owner on status. No
  FORWARD acknowledgment or unlisted frame is implied. Writers are nonblocking
  and bounded.
  Only the declared cooperative launcher inherits the lifecycle descriptor;
  it closes it for every child exec, and descendants never inherit its authority.
  Inspect nested supervisors' actual descriptor tables as well as final
  payloads under pinned Node 24; a JS-level CLOEXEC assumption is not proof.
  All deadlines use one checked Linux CLOCK_MONOTONIC domain, encoded as integer
  nanosecond strings; Node and Python must establish compatible clock origins
  during capability admission and refuse unproven mappings. Wall-clock changes
  or notification delivery delay cannot renew a cutoff.
  ProcessScope may cancel ordinary work immediately, but it must receive and
  validate DRAIN_NOTICE before admitting resource callbacks or cleanup children.
  A delayed signal handler uses the received cutoff, never local now+E. Missing,
  malformed, closed or backpressured lifecycle transport prevents further resource
  admissions and fails cleanup; kernel draining continues. Callback admission
  checks the remaining allocation including reserved parent tail synchronously
  before enqueueing its child ADMIT. Forced takeover/EOF may interrupt already
  admitted work and preserves failure; it cannot grant extra callback time.
  Ordinary payloads receive no lifecycle descriptor. Known cooperative launcher
  calls explicitly opt in and pass the bounded reservation at spawn, including
  test launcher scripts; registration cannot retrofit a cooperative admission.
  A top-level CLI ProcessScope with no enclosing supervisor uses its explicitly
  declared root lifetime/reservation and selects the same immutable cutoff locally.
  Supply and validate those immutable limits when constructing/arming the root
  scope, before starting work or Docker creation; callbacks register within the
  ceiling before their resource effects, never retrospectively. Cancellation
  before root-scope arming prevents work admission, not an implicit unfunded
  cleanup mode. This standalone mode is chosen by the entrypoint, never as recovery from a
  missing or broken lifecycle channel in an admitted cooperative payload.
  No registered allowance means ordinary-work custody only. With T=2.5 seconds and
  U=15+T=17.5 seconds per cleanup command, reserve
  E(node)=T+max(E(children),0)+U*remaining_cleanup_slots; ordinary work has E=T.
  A known-ID fixture requires one slot; creation recovery requires at most three
  (ps, inspect, rm), with multiple candidate IDs failing closed before removal.
  With an ordinary work child E=T, this yields 22.5/57.5-second maximum
  single-launcher shutdown reservations; with no child the figures are 20/55.
  Two nested three-slot owners over ordinary work require 112.5 seconds total.
  T is already each node's final tail; do not add it twice. Normal operation
  deadlines remain unchanged. Reserve a separate absolute shutdown-completion
  ceiling at admission, within inherited job/scope limits; cancellation chooses
  the earlier of that ceiling and now+E at the supervisor's serialized transition,
  and distributes that exact cutoff in DRAIN_NOTICE, never a reset allowance.
  Inability to
  fund a declared reservation is failure before resource effects, not extension.
  Adapt cooperative test wait bounds to the selected deadline rather than
  guessing 15/30-second replacements or increasing ordinary operation budgets.
  Delegate time to children only after reserving the parent's own slots and
  final T tail. Forced takeover consumes the existing remaining allocation.
  Require WORK_DRAINED for ordinary subtrees before resource callbacks. The
  WORK_DRAINED frame is child-supervisor-to-Node-owner status only, bound to
  that child's launch and drain epoch; it is never a lifecycle success token.
  It cannot replace final RESULT and supervisor completion.
  The payload's ProcessScope forms this local barrier from the validated quiescent
  WORK_DRAINED/RESULT records and completion of each ordinary child supervisor
  it owns; an empty set is trivially drained. It does not wait for a lifecycle
  WORK_DRAINED from its enclosing supervisor. Failed or missing child proof
  makes the aggregate unproven. Requiring whole-launcher ECHILD before its own
  callback would be circular. An ordinary child already complete with a
  quiescent RESULT before the drain epoch satisfies this barrier without a
  second drain frame. Cleanup commands get fresh supervisors under the
  remaining reserved deadline, not an unlimited context escape. The final command proof follows callbacks and
  launcher exit. If ordinary-work drain is unproven, any bounded best-effort
  resource callback must preserve unproven ordering/cleanup and fail the launcher;
  it cannot establish successful WORK_DRAINED. Inner failure remains failure
  even if outer rescue succeeds. Lost Docker creation acknowledgment plus an
  empty recovery lookup is unproven unless a terminal daemon outcome is known:
  a submitted create may finish after the CLI and lookup exit. Failed or
  unconfirmed removal likewise writes an unproven SQL receipt, never
  removed-owned-container. Test delayed creation crossing the empty lookup.
- Tests: in tests/guard/process.test.ts and the existing orchestration,
  environment, artifacts and fixture.setup.db tests, remove the artificial
  parent delay and run at least 100 immediate-exit trials locally and hosted,
  requiring zero escapes/reap failures. Retain the old probe and its executable
  method as a failing positive control: at least ten trials must observe at
  least one marked child absent from the legacy tracker's set before rescue.
  Force the historical interleaving by starting the legacy poll only after
  the probe parent's exit is pidfd-confirmed; retain the old detection method.
  Run this control under its own test-owned subreaper, not the root-suite
  custodian. That subreaper holds adoptees unreaped through observation and
  then drains via pidfds, never raw PID/PGID signals. A zero-escape legacy
  probe fails the control. The required double-fork case holds the payload
  alive past a full adoption scan after its intermediate exits; it requires
  launch failure plus proven subtree drain. The required immediate-orphan
  case includes a self-exiting post-exit adoptee (success after passive drain)
  and a long-lived post-exit adoptee (failure, never rescue-to-success), as
  well as 100 zero-escape trials. Add immediate double-fork/new-session,
  normal-success-with-orphans (successful only after post-exit drain),
  signal/nonzero/spawn failures, concurrent/reentrant cleanup, control EOF,
  denied/missing capability with no payload effect, and malformed/missing
  completion controls. Test pidfd identity rejection and clone-child exhaustion
  semantics. Include nested supervisors with competing cancellation deadlines,
  inner custodian loss under an outer owner, build interruption and admitted
  root-suite interruption. Assert children are quiescent before fixture cleanup
  and launcher exit, the parent/unrelated process survives, and real lock/race
  assertions are unchanged. Fault controls must retain their own cleanup custody.
  Include clone children with zero/non-SIGCHLD exit signals, non-leader-thread
  creation and leader exit while non-leader threads continue forking,
  discovery-to-pidfd identity rejection/disappearance, descriptor churn,
  stalled handshake transitions, controller death, stdin EOF, SIGHUP,
  foreground-process-group SIGINT (including direct and forwarded delivery),
  trailing/high-volume
  stdout/stderr and backpressure. Reaping assertions require process absence,
  not merely zombie tolerance. Remove obsolete Darwin/Windows fallback tests
  under the recorded Linux-only decision; replace them with no-launch refusals.
  Include sibling/last-keeper loss and explicit unproven results, buffered
  ADMIT cancellation, OS-signal/protocol routing, declarative cleanup ceilings,
  SIGCHLD automatic-reaping refusal and delayed Docker creation. Add delayed
  signal-handler/notification controls where a callback no longer fits: its
  payload must never start. Verify normal-close BEGIN_DRAIN, external FORWARD,
  duplicate notices, descriptor leakage and channel EOF cannot reset deadlines
  or manufacture WORK_DRAINED. Exercise different status/lifecycle sequence
  histories, cancellation while a capability probe is live, and standalone
  reservation-before-resource-effects ordering. Test an outer forced drain
  of a nested launcher whose TERM handler requests
  cooperative cleanup: the original outer deadline must not move. Bind the
  six mandatory custody IDs above to the immediate-orphan, double-fork,
  clone-reaping, live-thread-leader-exit, hung-child and legacy-positive controls;
  suppressing any of them
  must fail verify and test:guard even with all required SQL cases present.
  Test hostile ambient environment values alongside
  all four package suites' explicit synthetic inputs. Fault-injection
  tests use a real outer custodian for their own cleanup; that rescue is never
  evidence of the deliberately failed inner keeper. Foreign PID namespace
  containment is outside this test backend's claimed proof and fails unproven.
- Verification: Node/Vitest remains the test runner. Run focused process,
  orchestration, environment, artifact and SQL setup controls; check the Python
  helper with isolated standard-library compilation and behavioral tests (no
  host/global bytecode writes). Then build, lint, workspace/tooling typecheck,
  CI=true plain suite, focused GUARD/integration and clean integrated full verify,
  followed by hosted CI/rehearsal and a fresh complete production panel. Record
  timings without broad pool changes, new skips or arbitrary timeout increases.
  SL-0 must update verify.yml and both publish.yml consumer jobs for Python
  and actual admission; SL-1's Linux-only command docs land in the same integrated
  candidate, never as a later post-merge correction. Capability admission
  actually executes subreaper set/readback, self pidfd
  open/signal-zero, owned children-file access and a probe child reaped with
  __WALL. Record interpreter/kernel metadata, not credentials. Artifact consumers
  do need this admission because their Node verifier calls guarded git/tar.
  Validate -I/-S isolation with a local shadow-module control; Python 3.10 already
  excludes the script directory under -I. No new 3.11 floor is justified by it.
  Keep process custody quiescent/unproven separate from actual Docker cleanup
  status; failed or unconfirmed removal gets an explicit unproven SQL receipt.
- Approval/evidence: preserve the old accepted plan bytes in Git and its
  immutable TRIAGE binding. A new GUARD review/amendment receipt binds this
  exact plan hash, prior accepted hash, scoped ownership, source/probe hashes,
  four usable reviewer results, reconciled dispositions and actual operator
  platform decision. No vote transfer; plan approval is not code acceptance.
  For both the plan and SL-2 production panels, record each seat's model ID,
  subscription CLI/TUI route, session or invocation ID, final verdict and
  transcript/output digest. The Claude seat is `claude-opus-5-5` via the
  subscription TUI; a generic Claude label is insufficient route evidence.
  Existing main-protection and post-merge proof gates remain, and GUARD does
  not publish a product release.

## Execution Notes

Plan-budget exception: the plan exceeds 3000 words to retain exact, panel-requested
database, credential, artifact-binding and ownership constraints. Trimming
those constraints to meet 3000 words would make the execution boundary ambiguous.
The process-custody amendment adds explicit failure/ownership contracts after
a reproduced race; it is not permission to expand product runtime scope.

The coordinator assigns one isolated worktree per worker, records actual
paths/branch/base in ignored scheduling evidence and verifies disjoint changed
paths against this ownership list before integration. Lanes execute serially;
no concurrent-writer authority is inferred from prose or native subagents.
The parent owns roadmap/plan/TRIAGE-amendment records separately from execution
lanes, including manifest/handoff updates. Any newly required source ownership
is amended and reviewed before implementation.

Phase documentation status is docs_updated via SL-1's README/readiness/live-smoke
changes; SL-2 records no additional doc delta and checks those outputs without
rewriting them. CHANGELOG/release notes need no delta.
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
- [ ] EC-GUARD-2 - Proven by `pnpm test:guard` (required custody and SQL controls)
  and `pnpm test:integration` (required DB controls);
  falsified by skipped DB setup, altered migration, unexpected caller/role,
  leaked stalled child, escaped immediate orphan, unreaped descendant or empty
  focused execution passing.
- [ ] EC-GUARD-3 - After build, proven by `pnpm exec vitest run packages/cli/src/hardening-readiness.test.ts` plus source-grounded review of
  section-6 inventory; falsified by unsupported automatic supervision or
  unowned/deceptively completed HY subclaims. This focused documentation test
  is not a custody invocation and does not substitute for `pnpm verify`.

## Spec Closeout Plan

- schema: `spec_delta_closeout.v1`
- decision: `no_spec_delta`
- target surfaces: `.github/workflows/`, `docs/hardening-readiness.md`
- evidence paths: `plans/evidence/v2/GUARD.json`
- redaction posture: `metadata_only`
- downstream handling: `none`
