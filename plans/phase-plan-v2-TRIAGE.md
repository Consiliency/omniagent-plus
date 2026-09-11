---
phase_loop_plan_version: 1
phase: TRIAGE
roadmap: specs/phase-plans-v2.md
roadmap_sha256: b70e823737d4bf6a24700b83c1507ea4ea0f383344953780b327b8bf0fe4fd93
automation:
  suite_command: node plans/evidence/v2/verify-triage.mjs
---

# TRIAGE: Reconcile Audit Findings and Ownership

## Context

Consume the v2 roadmap and its existing disposition matrix. This is a
single-lane, interface-only phase, not runtime remediation. The 2026-09-09
matrix appendix and its advisor review are preparation to reuse, not proof
that the phase or any finding has closed. The eight finding issues remain
open until their implementation phases produce behavioral acceptance.

Use an isolated worktree based on the roadmap candidate. Preserve the primary
checkout's pending v0.12 planning edits and the existing FABPUB evidence.
Publication is a separate gate: consult the current agent-harness#789 recovery
receipt and require real-candidate acceptance; partition recovery alone is not
publish proof. The exception for omniagent-plus#28 authorizes no further push.

## Interface Freeze Gates

- [ ] IF-0-TRIAGE-1 - Accept the matrix's finding ownership and content/path,
  corruption/recovery, local/fleet lease, established-session identity,
  supervision, CI-topology and license-owner decisions. Bind review results
  to the actual document bytes. No new public schema, approval capability,
  credential-switching policy, or external canon change.

## Lane Index & Dependencies

SL-0 — Documentation reconciliation and inventory reduction
  Depends on: (none)
  Blocks: (none)
  Parallel-safe: no

## Lanes

### SL-0 - Documentation reconciliation and inventory reduction

- **Scope**: Produce an independently reviewed, source-grounded implementation
  inventory with truthful phase acceptance and publication status.
- **Owned files**: `plans/audit-remediation-disposition-20260905.md`,
  `specs/phase-plans-v2.md`, `plans/phase-plan-v2-TRIAGE.md`,
  `plans/evidence/v2/TRIAGE.json`, `plans/evidence/v2/verify-triage.mjs`,
  `plans/evidence/v2/TRIAGE-review-brief.md`,
  `plans/evidence/v2/TRIAGE-reviews.md`,
  `plans/evidence/v2/reviews/TRIAGE-*.json`,
  `.dev-skills/handoffs/codex-execute-phase/*`.
- **Interfaces provided**: IF-0-TRIAGE-1 after acceptance; no runtime API.
- **Interfaces consumed**: Audit IDs and cross-cutting sections (pre-existing),
  issue ownership and public contract boundaries (pre-existing).
- **Parallel-safe**: no; this lane also reduces all review feedback.
- **Tasks**:
  - test: Compare exact finding membership with the audit, not just counts.
    Reject missing/duplicate finding or case rows with in-memory negative
    controls. Read current source at each disputed boundary; retain N/Q where
    behavioral confirmation is still due and assign a named falsifier.
  - impl: Reconcile all review findings into the existing matrix, recording
    accepted, amended, deferred, or rejected dispositions with rationale.
    Freeze compatibility rules before dependent phase plans. Keep license
    selection owned by the maintainer in omniagent-plus#20; PREP implements
    the selected decision via omniagent-plus#27.
  - impl: Use the canonical advisor-board runtime, with the Fable Claude Code
    subscription TUI route. Preserve usable results and precise input hashes;
    errors/timeouts are not approvals. Resubmit material corrections against
    the updated bytes. Do not kill a reviewing leg merely because it is slow.
  - impl: Write the metadata-only evidence reducer and review reconciliation.
    Record structural checks separately from review acceptance and runtime
    tests. Only mark roadmap criteria after the corresponding obligations
    are met. Pending review or publication remains explicitly pending.
  - verify: Run the document checks below. Inspect the complete reviewed
    candidate, not only the evidence booleans. Assert that runtime, dependency,
    workflow, secret, publication-authority and adjacent-repo files are
    untouched. No build, provider launch, credential mutation or migration.

## Execution Notes

SL-0 is both the producer and terminal documentation reducer. No writer fanout
or runtime edits are authorized. Keep source observations separate from test
results; record review limitations and do not promote stale approvals. Retain
the existing roadmap candidate and publication evidence without mutation.

Public release surfaces: `no_doc_delta` for README.md, CHANGELOG.md and release
notes because TRIAGE changes planning only. GUARD owns readiness corrections;
PREP owns release metadata. This does not certify existing readiness claims.

## Verification

The installed phase-loop command validates planning artifacts; it is not an
undeclared dependency of the future public-package PR gate.

- `phase-loop validate-roadmap specs/phase-plans-v2.md`
- `node plans/evidence/v2/verify-triage.mjs --inventory-only`
- `git diff --check`
- `git diff --cached --check`

The frontmatter suite runs membership and six in-memory negative controls,
then the roadmap and both staged/unstaged whitespace checks. It exits nonzero
on any failed check. Before handoff, prove the installed runner resolves these
four commands and the suite; an empty command list is a planning defect.

The structural suite does not accept the phase by itself. The reducer must
also record `plans/evidence/v2/TRIAGE-reviews.md`, input SHA-256 values,
each seat's result and limitations, all actionable feedback dispositions,
unresolved blockers, and whether the final bytes need another review.
Evidence booleans, schema parsing, historical tests and approvals on earlier
bytes are not substitutes for that content review.

## Acceptance Criteria

- [ ] EC-TRIAGE-1 - Proven by `node plans/evidence/v2/verify-triage.mjs --inventory-only` and review
  of each finding/case disposition; falsified by a missing, duplicate,
  unowned or nonfalsifiable finding. Structural negative controls must fail.
- [ ] EC-TRIAGE-2 - Proven by review of `plans/audit-remediation-disposition-20260905.md`
  against actual source boundaries; falsified by metadata-only content leakage, destructive
  read repair, local/fleet authority merger, request-only session identity
  checks, or an unowned supervisor obligation in the proposed contract.
- [ ] EC-TRIAGE-3 - Proven by exact-input advisor results and reconciled
  `plans/evidence/v2/TRIAGE-reviews.md`; falsified by unresolved actionable
  feedback, stale review hashes, guessed CI eligibility, duplicate license
  ownership, or an invented external implementation blocker.

## Spec Closeout Plan

- schema: `spec_delta_closeout.v1`
- decision: `roadmap_amendment`
- target surfaces: `specs/phase-plans-v2.md`, `plans/audit-remediation-disposition-20260905.md`
- evidence paths: `plans/evidence/v2/TRIAGE.json`, `plans/evidence/v2/TRIAGE-reviews.md`
- redaction posture: `metadata_only`
- downstream handling: `roadmap amendment`

## Next

GUARD planning follows accepted TRIAGE decisions. Do not start runtime
implementation from an unresolved review, infer phase completion from the
old v1 runner state, or bypass the publication incident to land this phase.
