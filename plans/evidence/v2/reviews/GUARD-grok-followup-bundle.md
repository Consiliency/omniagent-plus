# Grok Follow-up: Missing Evidence Only

Correlation: GUARD-GROK-bda6010af2c8
Candidate GUARD plan SHA-256: 792ab83dcad1953d802ec5b8224b28a08befe95e1875f2a925938e91ba1cad66
This is a fresh single-seat follow-up, not a resumed session or a new full panel.
Your prior response reported truncation inside SL-1 and missing manual amendment,
CASE-HY-6 source evidence, and TRIAGE receipt. This bundle supplies those omissions
verbatim or as explicitly labelled excerpts. It is deliberately not the full
55-finding audit corpus or full SL-0 text. Earlier substantive findings remain
open unless you explicitly withdraw them with a source-grounded reason.
The plan has not been amended since round 3. The pending receipt is intentionally
still the reviewed pre-acceptance file; its older panel-history fields are not
a current claim that Fable is unavailable. Fable completed round 3 successfully.
The coordinator has not accepted a phase, started implementation, or merged.
Do not treat missing implementation proof as proof that a planning task failed.

## COMMANDS
Source: plans/phase-plan-v2-GUARD.md
Selection: Interface Freeze Gates section
Full-file SHA-256: 792ab83dcad1953d802ec5b8224b28a08befe95e1875f2a925938e91ba1cad66


- [ ] IF-0-GUARD-2 - One full fail-propagating verification command, shared by
  PR/main and release, with deterministic tests, mandatory disposable SQL
  setup, packed consumer smoke and evidence-scoped readiness.

Freeze these commands: `pnpm verify` runs frozen install, build, lint,
workspace and tooling typecheck, boundary checks, mandatory PostgreSQL setup,
one root test suite and transport pack smoke. `pnpm test` remains the
noncredentialed deterministic suite with opt-in live smoke excluded.
`pnpm test:guard` runs explicit tooling falsifiers; `pnpm test:integration`
requires a disposable database and cannot pass by skipping.
The root test configuration collects package tests plus tests/guard; the full
gate launches it exactly once with the admitted GUARD_TEST_DATABASE_URL and
an explicit integration-required setting. Without that setting, pnpm test
remains deterministic and excludes only the separately named DB suite; with
it, a missing connection, empty DB collection or skipped required DB case fails.
The full gate asserts that the designated integration cases actually executed;
test:guard/test:integration select the same cases for focused diagnosis, not
different coverage. An orchestration falsifier suppressing DB suite collection
must make the real gate fail, not rely on a separate focused success.
Focused selectors never replace the full gate. Network upstream monitoring
remains separate via the existing OpenAPI delta script.



END-COMMANDS-GUARD-GROK-bda6010af2c8

## MISSING-PLAN-TAIL
Source: plans/phase-plan-v2-GUARD.md
Selection: SL-1 through end of file, unabridged
Full-file SHA-256: 792ab83dcad1953d802ec5b8224b28a08befe95e1875f2a925938e91ba1cad66

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
  `plans/evidence/v2/GUARD-closeout.json`,
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
    remains broken. Merge only the accepted candidate, then plan DATA on main.

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

- `node plans/evidence/v2/verify-triage.mjs`
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


END-MISSING-PLAN-TAIL-GUARD-GROK-bda6010af2c8

## MANUAL-AMENDMENT
Source: specs/phase-plans-v2.md
Selection: Manual Execution and Closeout Amendment, unabridged
Full-file SHA-256: ee1f3152a5331e071042ed122e122143cc103544140a5ed8f4e849f6b649587c

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



END-MANUAL-AMENDMENT-GUARD-GROK-bda6010af2c8

## PENDING-RECEIPT
Source: plans/evidence/v2/TRIAGE-closeout.json
Selection: complete JSON file
Full-file SHA-256: 5adf920834f96231f7ee7821af3bb6bf2dd4a947a6d2516335d2fd3a1a961a2e

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
    "plans/phase-plan-v2-GUARD.md": "792ab83dcad1953d802ec5b8224b28a08befe95e1875f2a925938e91ba1cad66",
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
    "amendment_panel": "incomplete: rounds 1 and 2 returned no usable Fable verdict; final corrected plan requires resubmission",
    "current_reconciliation": "plans/evidence/v2/GUARD-plan-reviews.md",
    "closeout_self_hash": "Each external panel record hashes the exact receipt supplied to it; no impossible self-referential digest is embedded in this file",
    "material_amendment_is_not_covered_by_historical_review": true
  },
  "criteria": {
    "EC-TRIAGE-1": "Substantive check passed: complete inventory, explicit cases and owners; not implementation acceptance",
    "EC-TRIAGE-2": "Substantive check passed: content/path, nondestructive recovery, distinct lease APIs, established-session identity and supervisor boundaries recorded",
    "EC-TRIAGE-3": "Substantive check passed: four usable historical reviews and reconciled feedback, license owner and hosted CI topology identified; current manual amendment awaits review"
  },
  "produced_if_gates": [],
  "product_baseline": {
    "scope": "Fresh unchanged product baseline, not GUARD acceptance or SQL/RPC proof",
    "cwd": "/mnt/workspace/worktrees/omniagent-plus-v2-guard-20260912",
    "source_base": "8d6b7c177f8ce10164b89375e37d927b0a28ad83",
    "ordered_commands": [
      { "command": "pnpm install --frozen-lockfile", "exit_code": 0 },
      { "command": "pnpm build", "exit_code": 0 },
      { "command": "pnpm lint", "exit_code": 0 },
      { "command": "pnpm typecheck", "exit_code": 0 },
      { "command": "pnpm test --reporter=json --outputFile=.phase-loop/baseline-tests.json", "exit_code": 0, "passed": 348, "failed": 0, "skipped": 1 },
      { "command": "pnpm --filter @consiliency/omnigent-transport test:pack", "exit_code": 0 }
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
  }
}


END-PENDING-RECEIPT-GUARD-GROK-bda6010af2c8

## HISTORICAL-STATE
Source: plans/evidence/v2/TRIAGE.json
Selection: JSON projection of status, phase_acceptance, produced_if_gates, manual_closeout_followup
Full-file SHA-256: b667636e69f1530aca1dc58d990a617fcbf6f83ea9073761888fc0c42c4495c0

{
  "status": "awaiting_phase_closeout",
  "phase_acceptance": {
    "EC-TRIAGE-1": "content inventory reviewed and live owners verified; formal runner acceptance pending",
    "EC-TRIAGE-2": "source-grounded decisions reviewed and reconciled; formal runner acceptance pending",
    "EC-TRIAGE-3": "four-seat review completed and feedback dispositioned; documented nonblocking phase follow-ups remain, formal runner acceptance pending"
  },
  "produced_if_gates": [],
  "manual_closeout_followup": {
    "record": "plans/evidence/v2/TRIAGE-closeout.json",
    "scope": "2026-09-12 authorized manual acceptance amendment; fields below retain historical runner and pre-publication observations",
    "historical_record_preserved": true
  }
}

END-HISTORICAL-STATE-GUARD-GROK-bda6010af2c8

## CASE-HY-6
Source: plans/audit-remediation-disposition-20260905.md
Selection: all ID-1 and HY-6 table rows
Full-file SHA-256: 2ec237f5903c8ede6544feb35cb3948e5d762cef988acf05c4e8e1ff0bc4209d

| ID-1 | C / B | Relative imports cross into transport source. Use a supported public type export and independent package resolution; keep identity dependency direction intact. GUARD defaults to the three exact existing type-only edges specified by CASE-HY-6; no forward source edit is authorized. PREP owns the source fix, independent packaging proof and removal of the baseline under omniagent-plus#27. | PREP |
| HY-6 | Q / C | Some source/doc checks enforce real boundaries. Replace only with equivalent assertions and keep conformance; dependency rules must catch new relative escapes. GUARD records only the three exact existing ID-1 edges in CASE-HY-6 with positive/negative controls; PREP fixes them and removes the baseline. No broad exemption or failing full gate is deferred until PREP. | GUARD |
| HY-6 | CASE-HY-6 | New/altered relative source edges fail; public imports pass. GUARD baselines only the existing `OmnigentProviderMode` type imports from `packages/identity-isolation/src/process-profile.ts`, `packages/identity-isolation/src/omnigent-isolation-policy.ts`, and `packages/identity-isolation/src/types.ts` to `../../omnigent-transport/src/types.js`, with positive/negative controls. PREP/omniagent-plus#27 fixes all three and removes the baseline; moving the fix earlier requires a separately reviewed ownership amendment. The third edge was omitted from the prior inventory and is explicitly corrected by the 2026-09-12 amendment, not silently exempted. No broad exemption or failed full gate. Keep equivalent boundary assertions, conformance and separate network monitoring. |

END-CASE-HY-6-GUARD-GROK-bda6010af2c8

## IMPORT-1
Source: packages/identity-isolation/src/process-profile.ts
Selection: first 12 source lines, unmodified; includes complete import statement
Full-file SHA-256: 0bd7cbeea1fff5c7c5554ccdc43a72032f068ba888379476fe2d423244f14ff8

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

END-IMPORT-1-GUARD-GROK-bda6010af2c8

## IMPORT-2
Source: packages/identity-isolation/src/omnigent-isolation-policy.ts
Selection: first 12 source lines, unmodified; includes complete import statement
Full-file SHA-256: 1c92c58f09b3a2c914016d32d742ca87976812f71721a0813dd9f9527dfe776c

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

END-IMPORT-2-GUARD-GROK-bda6010af2c8

## IMPORT-3
Source: packages/identity-isolation/src/types.ts
Selection: first 12 source lines, unmodified; includes complete import statement
Full-file SHA-256: cda851d8201da68d54b9ad23ac98ebb54890aa8b2fd0ce7647f54fc909f3145b

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


END-IMPORT-3-GUARD-GROK-bda6010af2c8

## CHECKER
Source: plans/evidence/v2/verify-triage.mjs
Selection: complete checker source
Full-file SHA-256: 26dae6d62d852b36f651826da6d484982300b775db5bf8f97b20104c228b8cb7

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


END-CHECKER-GUARD-GROK-bda6010af2c8

END-BUNDLE-GUARD-GROK-bda6010af2c8
