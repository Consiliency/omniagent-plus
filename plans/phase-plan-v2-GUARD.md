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
fresh four-seat review and the maintainer's Linux-only verification decision.
Do not execute newly added ownership until both are recorded. Historical
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
- Proposed process-custody prerequisite, pending amendment approval: Linux
  kernel >=5.3, Python >=3.10 with standard-library ctypes, os.pidfd_open and
  signal.pidfd_send_signal, permitted PR_SET_CHILD_SUBREAPER/GET and pidfd
  operations, and readable owned /proc task/children metadata. No pip/npm
  runtime dependency, privileged cgroup, global subreaper or host setting change.
  Check capabilities before any guarded payload, not just version strings.
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
  and current publish-helper/smoke digests. Preserve both dated records;
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
workers receive fixture parameters. Test zero fixture-environment leakage to
non-DB workers and descendants. Required setup/DB case IDs live in
tests/guard/required-cases.json, partitioned into setup and integration IDs;
dropped, renamed or skipped command-required IDs fail the gate.
The full gate asserts that the designated integration cases actually executed;
test:guard runs tooling plus setup and integration IDs; test:integration runs
only integration IDs, never destructive setup controls. Use distinct
*.setup.db.test.ts and *.integration.db.test.ts selectors. The manifest maps
each command to its required IDs; verify requires both partitions. Both focused runs are subsets of
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
    missing/mismatched identity before bootstrap. Do not propagate this installer
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
    status and cleanup. Its runtime output is the owned ignored run directory
    .phase-loop/guard/<run-id>/sql-setup.json, never a plans/evidence file.
    Parent SL-2 alone retains the final run's receipt at
    plans/evidence/v2/GUARD-sql-setup.json; no credentials or URLs are retained.
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
  - impl: Limit the four owned existing process suites to timeout, readiness and
    cleanup changes; DATA/COORD behavioral assertions remain unchanged.
    Freeze job timeout at 20 minutes, SQL connect at 5 seconds, statements
    at 10 seconds, readiness at 30 seconds and process operations at 15 seconds
    (test-level timeouts allow the documented number of operations). The hung
    child control uses a 250 ms budget, escalates test-owned groups after
    500 ms, and requires no live descendant within 2 seconds of escalation.
    Pull the exact image digest/platform in a separate 300-second bounded
    step before local/destructive container creation and the 30-second readiness
    clock. Hosted shared-service readiness follows the runner's image pull.
    Test a slow cold pull independently from readiness; failed pull fails setup.
    Local fixture cleanup handles SIGINT/SIGTERM and failure paths; SIGKILL
    cannot promise traps and leaves only a labeled disposable instance.
    Bound synchronous process tests and async readiness/exit waits; kill
    only test-owned process groups on cleanup, never external reviewers.
    Spawn POSIX children with detached:true and track owned group IDs before
    any group signal; assert the parent runner and unrelated processes survive.
    The pending Process Custody Amendment below supersedes group/poll-only
    ownership for guarded launches; it does not relax any timing bound.
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
    Record whether branch protection requires up-to-date branches, and retain
    the post-merge main verification run for the actual merged SHA; PR-head
    verification is not automatically proof of the distinct merge commit.

## Process Custody Amendment

Status: revised after four usable PARTIALLY AGREE reviews; pending a fresh
four-seat review and maintainer Linux-only decision. This is
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
  Retain pidfds for signal identity; serialize reaping and ownership updates.
  Traverse only owned ancestry/adopted children. Kernel reparenting preserves
  custody after intermediate exit, including double forks and new sessions.
  For non-adopted descendants, bind discovery to an opened /proc directory,
  parent/start identity, live owned ancestry and post-open pidfd fdinfo identity;
  never signal if any check differs. Direct/adopted children remain unreaped
  until identity-sensitive work is finished. Reap zombies without requiring a
  pidfd first; close descriptors on reap, and fail closed on resource exhaustion.
- Admission: use dedicated control/status file descriptors, never payload
  stdout/stderr. The Node owner registers the supervisor and acknowledges its
  successful capability handshake before payload admission. Refuse absent
  Python, unsupported platform/kernel, denied capabilities, malformed/closed
  handshake, or cancellation before admission without launching the payload.
  Never silently fall back to polling or turn unsupported custody into a skip.
  Under the proposed Linux-only decision all GUARD verification commands,
  including pnpm test, require this backend; published runtime portability
  is unchanged. If the maintainer declines, revise this proposal before execution.
  Handshake silence consumes the existing operation budget, starting at spawn;
  it never earns an additional timeout. Admission commits when the supervisor
  receives the owner's single valid ADMIT frame after READY. Cancellation before
  that point forbids payload exec; cancellation afterward drains admitted work.
  Both endpoints exclusively own their respective control/status ends. Close
  all payload copies before exec, use CLOEXEC and close_fds, and verify this in
  a payload descriptor-leak falsifier. Version/nonce/sequence-bind every frame;
  reject duplicate, truncated, out-of-order and foreign-nonce records. Use a
  bounded, nonblocking status writer so a full pipe cannot stop kernel draining.
- Control/API freeze: protocol version 1 uses READY, ADMIT, FORWARD, SHUTDOWN,
  WORK_DRAINED and RESULT frame types. READY carries actual capability results;
  FORWARD names the signal without escalating; SHUTDOWN carries an epoch,
  cooperative/forced mode and immutable absolute deadlines. RESULT contains
  payload_pid, either exact exit code or signal (or typed not_started), typed
  spawn/custody errors, quiescent/unproven custody and adopted/force-killed counts.
  No argv/env/output content enters metadata. child.pid and native child events
  identify the supervisor, not the payload; the payload identity/status live
  in validated protocol state. waitExit/runProcess consume that state and
  require agreement with supervisor termination. signalOwned routes through
  the control protocol and never directly kills the last custodian. Existing
  test-only callers adapt lifecycle handling without changing behavioral asserts.
- Completion: preserve command argv/cwd/stdin/stdout/stderr and direct payload
  exit code or signal semantics. A payload exit starts descendant cleanup,
  even when that payload succeeded. Withhold successful completion until the
  supervisor has reaped all owned/adopted children. One serialized reaper saves
  the payload's raw wait status; never let Popen.wait/poll compete or substitute
  zero after ChildProcessError/ECHILD. Use waitpid(-1, WNOHANG | __WALL), with
  Linux __WALL=0x40000000 and SIGCHLD default/no automatic reaping. This avoids
  waitid(P_PIDFD)'s higher kernel floor. A wait result of zero is not exhaustion.
  Quiescence combines __WALL-inclusive ECHILD, empty per-thread children lists,
  and exit readiness of retained pidfds, re-evaluated after adoption/reaping.
  An empty /proc snapshot or a guardian exit alone is not proof. Require an owned-pipe final quiescence
  record and successful control-protocol completion; malformed/missing final
  evidence fails closed. Do not expose credentials or payloads in diagnostics.
  A missing payload status is a protocol fault unless admission never occurred.
  Write the final record before mirroring the payload exit/re-raised signal;
  successful payload plus failed custody is always failure. Adoption outside
  teardown starts the same bounded drain; SL-2 explicitly reviews unexpected
  adopted/forced counts instead of silently converting rescue into approval.
- Cancellation: the custody supervisor, not the Node owner, is the sole
  escalation owner for its payload subtree. Parent-requested teardown sends
  TERM to owned payloads, escalates at one absolute 500 ms deadline, and must
  reach kernel-confirmed quiescence within the following 2 seconds. Newly
  adopted descendants inherit those deadlines; they do not receive fresh grace.
  The 250 ms hung-operation, 15-second process-operation and other frozen
  budgets remain. Node must not kill its last custody supervisor at 500 ms.
  Reentrant teardown, controller-channel EOF and nested supervisor exit must
  share the same drain operation; descendants transfer to the living outer
  subreaper when an inner supervisor dies.
  Both owner and supervisor enforce the same absolute deadline, with protocol
  completion inside the existing two-second window, not extra grace afterward.
  On timeout the surviving owner records custody-unproven with supervisor
  PID/start identity, retains custody and never sends an emergency kill to a
  potentially live last keeper. Missing final evidence always fails. If all
  observers die, neither a final record nor cleanup can be promised.
- Interruption/resource ordering: distinguish forwarding an external
  SIGINT/SIGTERM to a cooperative launcher from a parent's explicit forced
  teardown request, so the launcher can drain its children and run bounded
  fixture cleanup before exit. Test both paths. Preserve the existing rule
  that SIGKILL cannot guarantee container traps; never claim process custody
  proves cleanup of an external Docker daemon's resources. Loss of the final
  custodian, unavailable kernel operations, or deadline exhaustion produces
  unproven cleanup/failure evidence, never success or broad emergency kills.
  Repeated FORWARD requests do not become forced requests or reset deadlines.
  Before resource effects, a cooperative launcher registers finite cleanup
  slots and its existing operation/job deadline. With T=2.5 seconds and
  U=15+T=17.5 seconds per cleanup command, reserve
  E(node)=T+max(E(children),0)+U*remaining_cleanup_slots; ordinary work has E=T.
  A known-ID fixture requires one slot; creation recovery requires at most three
  (ps, inspect, rm), with multiple candidate IDs failing closed before removal.
  This yields 22.5/57.5-second maximum single-launcher shutdown reservations,
  including the final forced tail; two nested worst-case owners require 112.5
  seconds total, not reset allowances. Clamp all reservations to already
  admitted operation/job deadlines; inability to fit is failure, not extension.
  Delegate time to children only after reserving the parent's own slots and
  final T tail. Forced takeover consumes the existing remaining allocation.
  Require WORK_DRAINED for ordinary subtrees before resource callbacks; requiring
  whole-launcher ECHILD before its own callback would be circular. Cleanup
  commands get fresh supervisors under the remaining reserved deadline, not
  an unlimited context escape. The final command proof follows callbacks and
  launcher exit. Inner failure remains failure even if outer rescue succeeds.
- Tests: in tests/guard/process.test.ts and the existing orchestration,
  environment, artifacts and fixture.setup.db tests, remove the artificial
  parent delay and run at least 100 immediate-exit trials locally and hosted,
  requiring zero escapes/reap failures. Retain the old probe and its executable
  method as a failing positive control, with independent rescue excluded from
  the pre-cleanup observation. Add immediate double-fork/new-session, normal-success-with-orphans,
  signal/nonzero/spawn failures, concurrent/reentrant cleanup, control EOF,
  denied/missing capability with no payload effect, and malformed/missing
  completion controls. Test pidfd identity rejection and clone-child exhaustion
  semantics. Include nested supervisors with competing cancellation deadlines,
  inner custodian loss under an outer owner, build interruption and admitted
  root-suite interruption. Assert children are quiescent before fixture cleanup
  and launcher exit, the parent/unrelated process survives, and real lock/race
  assertions are unchanged. Fault controls must retain their own cleanup custody.
  Include clone children with zero/non-SIGCHLD exit signals, non-leader-thread
  creation, discovery-to-pidfd PID reuse/disappearance, descriptor churn,
  stalled handshake transitions, controller death, stdin EOF, trailing/high-volume
  stdout/stderr and backpressure. Reaping assertions require process absence,
  not merely zombie tolerance. Remove obsolete Darwin/Windows fallback tests
  only after the Linux-only decision; replace them with no-launch refusals.
- Verification: Node/Vitest remains the test runner. Run focused process,
  orchestration, environment, artifact and SQL setup controls; check the Python
  helper with isolated standard-library compilation and behavioral tests (no
  host/global bytecode writes). Then build, lint, workspace/tooling typecheck,
  CI=true plain suite, focused GUARD/integration and clean integrated full verify,
  followed by hosted CI/rehearsal and a fresh complete production panel. Record
  timings without broad pool changes, new skips or arbitrary timeout increases.
  Capability admission actually executes subreaper set/readback, self pidfd
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
- [ ] EC-GUARD-2 - Proven by `pnpm test:guard` and `pnpm test:integration`;
  falsified by skipped DB setup, altered migration, unexpected caller/role,
  leaked stalled child, escaped immediate orphan, unreaped descendant or empty
  focused execution passing.
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
