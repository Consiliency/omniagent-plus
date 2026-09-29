# INPUT-1: plans/phase-plan-v2-GUARD.md
SHA-256: bbaa004c4847b67fbb98d10f95ab60eac33d10f42b9f9ad2eeb450f286c1690a

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
inherited setting. Without that setting, pnpm test
remains deterministic and excludes only the separately named DB suite; with
it, a missing connection, empty DB collection or skipped required DB case fails.
The full gate asserts that the designated integration cases actually executed;
test:guard/test:integration select the same cases for focused diagnosis, not
different coverage. An orchestration falsifier suppressing DB suite collection
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
    Both jobs check out the immutable workflow github.sha, not a moving
    branch/tag lookup. Verification emits source SHA plus lockfile and public
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
    NPM_PUBLISH_DRY_RUN=1 path. Add --verified-artifact <manifest> <package-name>
    mode that never packs/builds; retain existing-version skips and fail on
    registry errors other than E404 in both modes. Within publish.yml, PR runs
    and workflow_dispatch default to dry-run. A separate no-id-token rehearsal
    job downloads the same run's verified artifact ID, validates all source,
    manifest and tarball identities, and invokes verified-artifact mode with
    NPM_PUBLISH_DRY_RUN=1. Only release-published or explicitly selected dispatch
    publish mode may run the separate id-token publication job. Test mode
    routing, tampered-artifact rejection and absence of npm mutation in rehearsal.
    Retain exact hosted rehearsal run/SHA/artifact identities in GUARD closeout;
    real OIDC exchange and registry acceptance remain SHIP evidence.
  - test: Real disposable database positive control, unreachable loopback port,
    invalid SQL/migration, missing role, unexpected privilege attributes, and
    missing function must fail actual setup. Fixture mutation uses a temporary
    migration directory, never production files. Mock commands alone do not
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
    Include top-level tooling/tests in lint/typecheck and test discovery.
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
    route. Reconcile any ambiguous prior external effect first. Then plan DATA
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

END-INPUT-1-GUARD-REVIEW-1e406952606442cb9cddb064619ac0a4

# INPUT-2: plans/evidence/v2/TRIAGE-closeout.json
SHA-256: e8101c4732d78e1e44efbe999c60d7d027d089854ad4349940298bc52b3ad777

{
  "schema": "manual-phase-closeout.v1",
  "phase": "TRIAGE",
  "status": "pending_amendment_review",
  "acceptance_route": "explicit_manual_alternative",
  "authority": "Maintainer instruction on 2026-09-12 to continue the roadmap with manual alternatives to broken Agent Harness automation",
  "roadmap": "specs/phase-plans-v2.md",
  "historical_record": "plans/evidence/v2/TRIAGE.json",
  "candidate_base": "8d6b7c177f8ce10164b89375e37d927b0a28ad83",
  "amended_candidate_sha256": {
    "specs/phase-plans-v2.md": "ee1f3152a5331e071042ed122e122143cc103544140a5ed8f4e849f6b649587c",
    "plans/phase-plan-v2-GUARD.md": "bbaa004c4847b67fbb98d10f95ab60eac33d10f42b9f9ad2eeb450f286c1690a",
    "plans/audit-remediation-disposition-20260905.md": "2ec237f5903c8ede6544feb35cb3948e5d762cef988acf05c4e8e1ff0bc4209d",
    "plans/evidence/v2/verify-triage.mjs": "26dae6d62d852b36f651826da6d484982300b775db5bf8f97b20104c228b8cb7",
    "plans/evidence/v2/TRIAGE.json": "b667636e69f1530aca1dc58d990a617fcbf6f83ea9073761888fc0c42c4495c0"
  },
  "current_import_inventory": {
    "scope": "Source inventory only; the TRIAGE checker verifies membership, not import syntax. GUARD adds AST enforcement. No source changes made.",
    "imported_type": "OmnigentProviderMode",
    "relative_target": "../../omnigent-transport/src/types.js",
    "verbatim_import_at_each_path": "import type { OmnigentProviderMode } from \"../../omnigent-transport/src/types.js\";",
    "source_lines": {
      "packages/identity-isolation/src/process-profile.ts": 2,
      "packages/identity-isolation/src/omnigent-isolation-policy.ts": 2,
      "packages/identity-isolation/src/types.ts": 11
    },
    "source_sha256": {
      "packages/identity-isolation/src/process-profile.ts": "0bd7cbeea1fff5c7c5554ccdc43a72032f068ba888379476fe2d423244f14ff8",
      "packages/identity-isolation/src/omnigent-isolation-policy.ts": "1c92c58f09b3a2c914016d32d742ca87976812f71721a0813dd9f9527dfe776c",
      "packages/identity-isolation/src/types.ts": "cda851d8201da68d54b9ad23ac98ebb54890aa8b2fd0ce7647f54fc909f3145b"
    },
    "exhaustive_literal_scan": {
      "observed_at": "2026-09-14",
      "command": "rg -n -F '../../omnigent-transport/src/types.js' packages --glob '*.ts' --glob '!**/dist/**' --glob '!**/node_modules/**'",
      "exit_code": 0,
      "output": [
        "packages/identity-isolation/src/process-profile.ts:2:import type { OmnigentProviderMode } from \"../../omnigent-transport/src/types.js\";",
        "packages/identity-isolation/src/omnigent-isolation-policy.ts:2:import type { OmnigentProviderMode } from \"../../omnigent-transport/src/types.js\";",
        "packages/identity-isolation/src/types.ts:11:import type { OmnigentProviderMode } from \"../../omnigent-transport/src/types.js\";"
      ],
      "limit": "Complete literal-target scan, not proof against alias/computed-source evasion; GUARD owns recursive AST controls."
    }
  },
  "tooling_incident": {
    "issue": "https://github.com/Consiliency/agent-harness/issues/831",
    "failure": "Clean awaiting_phase_closeout attempts an empty commit instead of verification",
    "alternative": "Run original structural suite directly, independently review source-grounded EC decisions and content hashes, panel the amended closeout procedure, then record coordinator acceptance",
    "runner_state_modified": false,
    "runner_verification_claimed": false
  },
  "verification": [
    {
      "command": "node plans/evidence/v2/verify-triage.mjs",
      "exit_code": 0,
      "scope": "55 finding IDs, 28 N/Q cases, 4 cross-cutting cases, 6 negative controls, 8 valid roadmap phases, staged/unstaged whitespace",
      "warning": "Installed roadmap validator reports agent-harness#819 closeout import warning; roadmap validation is not FAB closeout validation"
    }
  ],
  "reviewed_merged_core_sha256": {
    "plans/audit-remediation-disposition-20260905.md": "fc7142c943a1305989838d1106c7860fdddf94408e23118a3a4c8f5eb2bf0192",
    "specs/phase-plans-v2.md": "b70e823737d4bf6a24700b83c1507ea4ea0f383344953780b327b8bf0fe4fd93",
    "plans/phase-plan-v2-TRIAGE.md": "69484fbac85b4d574463e7bf264fe942d44b8e4a225dd0dce92dc0c9e176cfee",
    "plans/evidence/v2/verify-triage.mjs": "26dae6d62d852b36f651826da6d484982300b775db5bf8f97b20104c228b8cb7"
  },
  "review": {
    "historical": "plans/evidence/v2/reviews/TRIAGE-round-9.json",
    "reconciliation": "plans/evidence/v2/TRIAGE-reviews.md",
    "independent_source_audit": "Read-only agent Faraday confirmed exact committed core hashes, finding ownership, source boundaries and no blocking TRIAGE content gap on 2026-09-12",
    "amendment_panel": "2026-09-14 amended candidate awaits fresh four-seat review. Round 3 Fable succeeded; targeted Grok follow-up resolved its missing input. Prior reviews do not approve these changed bytes.",
    "current_reconciliation": "plans/evidence/v2/GUARD-plan-reviews.md",
    "closeout_self_hash": "Each external panel record hashes the exact receipt supplied to it; no impossible self-referential digest is embedded in this file",
    "material_amendment_is_not_covered_by_historical_review": true,
    "prior_results": [
      "plans/evidence/v2/reviews/GUARD-plan-round3.json",
      "plans/evidence/v2/reviews/GUARD-grok-followup.json"
    ]
  },
  "criteria": {
    "EC-TRIAGE-1": "Substantive check passed: complete inventory, explicit cases and owners; not implementation acceptance",
    "EC-TRIAGE-2": "Substantive check passed: content/path, nondestructive recovery, distinct lease APIs, established-session identity and supervisor boundaries recorded",
    "EC-TRIAGE-3": "Substantive check passed: four usable historical reviews and reconciled feedback, license owner and hosted CI topology identified; current manual amendment awaits review"
  },
  "produced_if_gates": [],
  "product_baseline": {
    "scope": "Recorded 2026-09-12 unchanged-product baseline, not a new 2026-09-14 run and not GUARD acceptance or SQL/RPC proof",
    "cwd": "/mnt/workspace/worktrees/omniagent-plus-v2-guard-20260912",
    "source_base": "8d6b7c177f8ce10164b89375e37d927b0a28ad83",
    "ordered_commands": [
      {
        "command": "pnpm install --frozen-lockfile",
        "exit_code": 0
      },
      {
        "command": "pnpm build",
        "exit_code": 0
      },
      {
        "command": "pnpm lint",
        "exit_code": 0
      },
      {
        "command": "pnpm typecheck",
        "exit_code": 0
      },
      {
        "command": "pnpm test --reporter=json --outputFile=.phase-loop/baseline-tests.json",
        "exit_code": 0,
        "passed": 348,
        "failed": 0,
        "skipped": 1
      },
      {
        "command": "pnpm --filter @consiliency/omnigent-transport test:pack",
        "exit_code": 0
      }
    ],
    "ordering_scope": "Dependency order for reproduction; lint was observed before build and typecheck alongside the post-build test run",
    "skipped_case": "packages/omnigent-transport/src/live-omnigent-smoke.test.ts: live Omnigent smoke collects metadata_only live evidence only when explicitly enabled",
    "json_report_sha256": "08a947e04844d4f096d64f1553522b93a70302ccfb9f02031196bfe6935660ff",
    "initial_diagnostic": "A pre-build test attempt failed package export resolution; after the prerequisite build the full baseline passed. No product fix was inferred."
  },
  "remaining_work": [
    "All runtime audit findings remain assigned to omniagent-plus#19 through omniagent-plus#27",
    "License choice is required before PREP exit, not before GUARD",
    "Historical phase-loop state remains pending until supported reconciliation"
  ],
  "publication": {
    "documentation_pr": "https://github.com/Consiliency/omniagent-plus/pull/28",
    "state": "MERGED",
    "merge_commit": "8d6b7c177f8ce10164b89375e37d927b0a28ad83",
    "npm_release_required_for_triage": false
  },
  "acceptance_recording_contract": {
    "decision": "pending; no acceptance inferred before current-input panel and coordinator reconciliation",
    "reviewed_input_digest": "Stored externally in each exact-input panel report; receipt contains no self digest",
    "binding_path": "plans/evidence/v2/TRIAGE-acceptance-binding.json",
    "owner": "parent coordinator; outside implementation lanes",
    "allowed_recording_only_json_paths": [
      "status",
      "review.amendment_panel",
      "review.current_panel",
      "criteria.EC-TRIAGE-3",
      "produced_if_gates",
      "accepted_at"
    ],
    "required_checks": [
      "Record pre-acceptance and post-acceptance SHA-256, changed JSON paths and reviewed artifact hashes in the external binding",
      "Reject any changed JSON path outside the allowlist; required candidate inputs remain exactly reviewed",
      "Record panel/reconciliation result and explicit EC-TRIAGE decisions before status=accepted or producing IF-0-TRIAGE-1",
      "No GUARD implementation acceptance or IF-0-GUARD-2 is produced by accepting TRIAGE"
    ],
    "material_change_rule": "Any other change to plan, source, ownership, criteria or acceptance procedure requires fresh review; do not label it recording-only",
    "historical_triage_plan_sha256": "69484fbac85b4d574463e7bf264fe942d44b8e4a225dd0dce92dc0c9e176cfee",
    "historical_triage_plan_unchanged": true
  },
  "amendment_summary": {
    "previous_receipt_sha256": "5adf920834f96231f7ee7821af3bb6bf2dd4a947a6d2516335d2fd3a1a961a2e",
    "previous_guard_plan_sha256": "792ab83dcad1953d802ec5b8224b28a08befe95e1875f2a925938e91ba1cad66",
    "roadmap_and_matrix_unchanged_since_round3": true,
    "guard_changes": [
      "SL-0 explicitly owns existing transport smoke and binds it to retained tarballs",
      "Digest-pinned SQL fixture; scrub libpq/Supabase environment; dedicated read-only probe connection",
      "Standalone focused fixture ownership; pre-collection DB selector exclusion; gate-set required-integration mode",
      "No-id-token hosted artifact-transfer dry run; compatible publish script modes; explicit public package identities",
      "Signal/null-status, isolated process-group, AST type-query/reference and workflow-secret negative controls",
      "Parent-owned metadata SQL receipt; exact-head GitHub PR merge route; planning CLI remains out of product gate"
    ],
    "receipt_changes": [
      "Current GUARD digest and actual prior review status",
      "Complete literal-target scan",
      "Recording-only field/digest contract"
    ],
    "migration_inspection": {
      "path": "supabase/migrations/20260708215513_coordination_leases.sql",
      "sha256": "9457176ceb3c71220c13c22bd4ec222ed57ae3104c42c73c96d23f03b680d224",
      "scope": "Read-only source inspection; no database/migration run. Query function is stable SELECT returning leases and accepts {}. Acquire is signature-only in GUARD. No auth schema/extension references; roles are explicit prerequisites."
    }
  }
}

END-INPUT-2-GUARD-REVIEW-1e406952606442cb9cddb064619ac0a4

# INPUT-3: .phase-loop/guard-source-evidence.md
SHA-256: 0b048e9cbe58a6b0f27a21985e22e05aaecd22a9f21ebc7a69fd4ae04d4373e4

# GUARD Source Evidence (2026-09-14)

Source excerpts are explicitly bounded; this is not an implementation result.
Plan/receipt amendments are the review candidate; the existing roadmap sequence
and disposition matrix are unchanged. Historical tests are dated September 12.

## S1: Manual roadmap amendment
Read command: `sed -n '431,464p' specs/phase-plans-v2.md`

### Manual Execution and Closeout Amendment (2026-09-12)

The maintainer authorized continuing this roadmap with manual alternatives
when Agent Harness automation fails. The harness is development tooling, not
a product dependency or a prerequisite of this repository's npm workflow.
Use working automation first; do not repair adjacent-repository tooling as a
prerequisite when the same obligation can be met directly here.

For a broken orchestration/closeout step, record the failed command or existing
incident, the exact alternative commands, exit results, candidate content
hashes, each EC/IF decision, independent review and feedback reconciliation in
`plans/evidence/v2/<PHASE>-closeout.json`. Preserve historical runner events and
snapshots; do not fabricate a runner verdict or mutate its state to passed.
An accepted manual record is the downstream prerequisite under this amendment;
it is explicitly not a successful run of the broken automation. Reconcile the
runner later only through a supported operation. TRIAGE's historical plan and
review hashes remain historical inputs, not current-plan freshness claims.

Plans and production changes still require the named four-agent panel and
reconciliation against the actual candidate. Fable uses the subscription TUI;
unavailable/refusing seats are not approvals or permission to substitute.
Working board invocations provide review evidence; the coordinator records
acceptance explicitly without claiming an unavailable automated ratification.
Material amendments require fresh review. Manual execution uses bounded,
disjoint ownership and separate worktrees; reducer/integration writes are
serial, with fresh combined verification before merge.

This amendment does not waive product decisions, tests, conformance, credential
requirements, branch protection, or registry integrity. It does not authorize
replaying ambiguous publication effects, overriding FABPUB authority, or
credentialed manual npm publication. Reconcile any existing external effect
before attempting another; the existing GitHub Actions npm release remains
the SHIP route. A failed behavioral check remains a real failed check.

END-S1

## S2: CASE-HY-6 source ownership
Read command: `rg -n 'CASE-HY-6' plans/audit-remediation-disposition-20260905.md`

127:| ID-1 | C / B | Relative imports cross into transport source. Use a supported public type export and independent package resolution; keep identity dependency direction intact. GUARD defaults to the three exact existing type-only edges specified by CASE-HY-6; no forward source edit is authorized. PREP owns the source fix, independent packaging proof and removal of the baseline under omniagent-plus#27. | PREP |
134:| HY-6 | Q / C | Some source/doc checks enforce real boundaries. Replace only with equivalent assertions and keep conformance; dependency rules must catch new relative escapes. GUARD records only the three exact existing ID-1 edges in CASE-HY-6 with positive/negative controls; PREP fixes them and removes the baseline. No broad exemption or failing full gate is deferred until PREP. | GUARD |
351:| HY-6 | CASE-HY-6 | New/altered relative source edges fail; public imports pass. GUARD baselines only the existing `OmnigentProviderMode` type imports from `packages/identity-isolation/src/process-profile.ts`, `packages/identity-isolation/src/omnigent-isolation-policy.ts`, and `packages/identity-isolation/src/types.ts` to `../../omnigent-transport/src/types.js`, with positive/negative controls. PREP/omniagent-plus#27 fixes all three and removes the baseline; moving the fix earlier requires a separately reviewed ownership amendment. The third edge was omitted from the prior inventory and is explicitly corrected by the 2026-09-12 amendment, not silently exempted. No broad exemption or failed full gate. Keep equivalent boundary assertions, conformance and separate network monitoring. |

END-S2

## S3: Import source: process-profile.ts lines 1-12
Read command: `sed -n '1,12p' packages/identity-isolation/src/process-profile.ts`

import type { IdentityProfile } from "@consiliency/runtime-provider";
import type { OmnigentProviderMode } from "../../omnigent-transport/src/types.js";

import {
  IdentityIsolationError,
  type OmnigentProcessProfile,
  type ResolvedProfileEnvironment,
} from "./types.js";

export function buildOmnigentProcessProfile(
  profile: IdentityProfile,
  environment: ResolvedProfileEnvironment,

END-S3

## S4: Import source: omnigent-isolation-policy.ts lines 1-12
Read command: `sed -n '1,12p' packages/identity-isolation/src/omnigent-isolation-policy.ts`

import type { IdentityProfile } from "@consiliency/runtime-provider";
import type { OmnigentProviderMode } from "../../omnigent-transport/src/types.js";

import { buildOmnigentProcessProfiles } from "./process-profile.js";
import type {
  OmnigentIsolationDecision,
  ResolvedProfileEnvironment,
  SharedHttpIsolationEvidence,
} from "./types.js";

export interface EvaluateOmnigentIsolationPolicyOptions {
  readonly providerMode: OmnigentProviderMode;

END-S4

## S5: Import source: types.ts lines 1-12
Read command: `sed -n '1,12p' packages/identity-isolation/src/types.ts`

import {
  createRuntimeFailure,
  type IdentityProfile,
  type IdentityProfileStatus,
  type RedactedConfigValue,
  type RuntimeFailure,
  type RuntimeFailureActor,
  type RuntimeFailureCategory,
  type RuntimeFailureScope,
} from "@consiliency/runtime-provider";
import type { OmnigentProviderMode } from "../../omnigent-transport/src/types.js";

END-S5

## S6: Existing publish helper (complete)
Read command: `cat scripts/publish-package-if-needed.sh`

#!/usr/bin/env bash
set -euo pipefail

package_dir=${1:?usage: publish-package-if-needed.sh <package-directory>}
npm_cli=${NPM_CLI:-npm}

package=$(node -p "require('./${package_dir}/package.json').name")
version=$(node -p "require('./${package_dir}/package.json').version")

set +e
view_output=$($npm_cli view "$package@$version" version 2>&1)
view_status=$?
set -e

if [[ $view_status -eq 0 ]]; then
  echo "::notice::$package@$version is already published; skipping"
  exit 0
fi

if ! grep -Eq 'E404|404 Not Found' <<<"$view_output"; then
  printf '%s\n' "$view_output" >&2
  exit "$view_status"
fi

echo "::notice::$package@$version is not published; publishing"
pack_dir=$(mktemp -d)
trap 'rm -rf "$pack_dir"' EXIT
tarball=$(pnpm --dir "$package_dir" pack --pack-destination "$pack_dir" | tail -n1)
publish_args=("$tarball" --access public)
if [[ ${NPM_PUBLISH_DRY_RUN:-0} == 1 ]]; then
  publish_args+=(--dry-run)
fi
$npm_cli publish "${publish_args[@]}"

END-S6

## S7: Existing transport pack smoke: first 50 lines
Read command: `sed -n '1,50p' scripts/smoke-packed-omnigent-transport.mjs`

#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const packageDir = join(repoRoot, "packages/omnigent-transport");
const scratch = mkdtempSync(join(tmpdir(), "omnigent-transport-pack-"));
const consumer = join(scratch, "consumer");

try {
  mkdirSync(consumer);
  writeFileSync(
    join(consumer, "package.json"),
    JSON.stringify({ private: true, type: "module" }),
  );
  execFileSync("pnpm", ["pack", "--pack-destination", scratch], {
    cwd: packageDir,
    stdio: "pipe",
  });
  const tarballName = readdirSync(scratch).find((name) => name.endsWith(".tgz"));
  if (tarballName === undefined) {
    throw new Error("pnpm pack produced no tarball");
  }

  execFileSync(
    "npm",
    ["install", "--prefix", consumer, join(scratch, tarballName), "--ignore-scripts"],
    { stdio: "pipe" },
  );
  const installedPackage = JSON.parse(
    readFileSync(
      join(
        consumer,
        "node_modules",
        "@consiliency",
        "omnigent-transport",
        "package.json",
      ),
      "utf8",
    ),

END-S7

## S8: Existing query function: migration lines 364-393
Read command: `sed -n '364,393p' supabase/migrations/20260708215513_coordination_leases.sql`

create or replace function public.coordination_query_leases(request jsonb default '{}'::jsonb)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'leases',
    coalesce(jsonb_agg(payload order by lease_id), '[]'::jsonb)
  )
  from public.coordination_current_leases
  where state = 'active'
    and (
      request->>'include_expired' = 'true'
      or coalesce((request->>'now')::timestamptz, now()) < heartbeat_at + make_interval(secs => ttl_seconds)
    )
    and (request->>'lease_id' is null or lease_id = request->>'lease_id')
    and (
      request->'scope' is null
      or public.coordination_scope_overlaps(
        scope_kind,
        scope_selector,
        request #>> '{scope,granularity}',
        array(select jsonb_array_elements_text(request #> '{scope,selector}'))
      )
    );
$$;

create or replace function public.coordination_send_message(message jsonb)

END-S8

## S9: TRIAGE checker (complete)
Read command: `cat plans/evidence/v2/verify-triage.mjs`

import assert, { AssertionError } from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
assert.ok(
  args.length === 0 || (args.length === 1 && args[0] === "--inventory-only"),
  "Usage: node plans/evidence/v2/verify-triage.mjs [--inventory-only]",
);

const audit = readFileSync("docs/code-review-2026-09-01.md", "utf8");
const matrix = readFileSync("plans/audit-remediation-disposition-20260905.md", "utf8");

function verifyInventory(source, candidate) {
  const ids = [...source.matchAll(/^\*\*((?:SL|CC|TR|CO|CLI|WL|ID|HY)-\d+) /gm)]
    .map((match) => match[1]).sort();
  const rows = [...candidate.matchAll(/^\| ((?:SL|CC|TR|CO|CLI|WL|ID|HY)-\d+) \| ([RCQNIS]) \/ /gm)];
  assert.equal(ids.length, 55, "Historical finding inventory changed");
  assert.equal(new Set(ids).size, 55, "Duplicate historical finding");
  assert.deepEqual(rows.map((match) => match[1]).sort(), ids, "Finding membership drift");

  const expected = rows.filter((match) => /[NQ]/.test(match[2]))
    .map((match) => match[1]).sort();
  const caseRows = [...candidate.matchAll(/^\| ((?:SL|CC|TR|CO|CLI|WL|ID|HY)-\d+) \| CASE-((?:SL|CC|TR|CO|CLI|WL|ID|HY)-\d+) \|/gm)];
  const cases = caseRows.map((match) => match[1]).sort();
  assert.deepEqual(cases, expected, "N/Q acceptance membership drift");
  for (const match of caseRows) assert.equal(match[1], match[2]);
  const crossCutting = [...candidate.matchAll(/^\| (3\.[1-4]) \| CASE-(3\.[1-4]) \|/gm)];
  assert.deepEqual(crossCutting.map((match) => match[1]).sort(), ["3.1", "3.2", "3.3", "3.4"]);
  for (const match of crossCutting) assert.equal(match[1], match[2]);
  return { findings: ids.length, nqCases: cases.length, crossCutting: crossCutting.length };
}

const inventory = verifyInventory(audit, matrix);
const invalidCandidates = [
  ["missing finding", matrix.replace(/^\| SL-1 \| C \/ B .*\n/m, "")],
  ["missing N/Q case", matrix.replace(/^\| SL-7 \| CASE-SL-7 .*\n/m, "")],
  ["missing cross-cutting case", matrix.replace(/^\| 3\.1 \| CASE-3\.1 .*\n/m, "")],
  ["duplicate N/Q case", `${matrix}\n| SL-7 | CASE-SL-7 | duplicate |\n`],
  ["duplicate cross-cutting case", `${matrix}\n| 3.1 | CASE-3.1 | duplicate |\n`],
  ["mismatched case ID", matrix.replace("| SL-7 | CASE-SL-7 |", "| SL-7 | CASE-WL-5 |")],
];
for (const [label, candidate] of invalidCandidates) {
  assert.notEqual(candidate, matrix, `Negative control did not change input: ${label}`);
  assert.throws(() => verifyInventory(audit, candidate), AssertionError, label);
}
console.log(JSON.stringify({ ...inventory, negativeControls: invalidCandidates.length }));

if (args.length === 0) {
  for (const [command, ...commandArgs] of [
    ["phase-loop", "validate-roadmap", "specs/phase-plans-v2.md"],
    ["git", "diff", "--check"],
    ["git", "diff", "--cached", "--check"],
  ]) {
    execFileSync(command, commandArgs, { stdio: "inherit" });
  }
}
console.log("TRIAGE structural verification passed; content review and phase acceptance remain separate.");

END-S9

## Coordinator validation observations

Planner literal validator returned zero findings. Installed validate_plan_doc.py
accepted three serial lanes; it warns that the semicolon interface list is
one unmatched name and that future publication wiring looks release-shaped.
These do not authorize dispatch; the plan explicitly prohibits GUARD release.
No build, runtime suite, database, migration or publish was run in this planning turn.
The complete amended plan stays below 3000 words.

END-SOURCE-EVIDENCE

END-INPUT-3-GUARD-REVIEW-1e406952606442cb9cddb064619ac0a4

END-BUNDLE-GUARD-REVIEW-1e406952606442cb9cddb064619ac0a4
