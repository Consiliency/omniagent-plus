---
from: codex-execute-phase
timestamp: 2026-09-15T11:12:00Z
repo: omniagent-plus
repo_root: /mnt/workspace/worktrees/omniagent-plus-v2-guard-20260912
branch: codex/v2-guard-20260912
branch_slug: codex-v2-guard-20260912
commit: b526db89483c2706fc647b88cf180380349452f1
run_id: 20260915-guard-custody-gate
artifact: plans/phase-plan-v2-GUARD.md
artifact_state: staged
next_skill: none
next_command: none - maintainer platform decision and fresh amendment review
next_phase: GUARD
---

# GUARD Custody Gate

The commit above is the tested source checkpoint, not this recording commit.
Re-read live Git/PR state for publication; this handoff grants no merge or
package release. Primary main's unrelated dirty plans and protected worktrees
remain untouched. Draft PR: Consiliency/omniagent-plus#29.

SL-0 and SL-1 were integrated. Review repairs add source/input cleanliness
through artifact production/consumption, production-to-test import rejection,
CI-safe synthetic lint testing, metadata-only failure diagnostics and improved
interruption cleanup. Clean CI=true full verification passed 470 tests with
one permitted live skip, SQL setup, retained package smoke and artifact checks.
Build/lint/workspace and tooling typecheck passed; focused repairs passed 76,
independent cancellation controls 35, and CI=true plain tests 457 plus one skip.

GUARD is NOT accepted. An independent immediate-parent-exit control exposed
the remaining polling race: 8 of 10 detached children survived helper return.
All marked probe children were independently cleaned; that rescue is not
helper correctness. The current polling implementation must not be merged.

Production round 1 had three usable seats and a Fable output-limit result
with no recoverable final text. A subsequent custody PLAN panel completed
four usable PARTIALLY AGREE reviews using Fable's native subscription TUI.
All native input and cleanup bindings were checked. Findings were reconciled
and the plan materially revised, so its current bytes need a fresh four-seat
review. No historical votes transfer; the Python supervisor is NOT implemented.

Evidence and exact hashes: plans/evidence/v2/GUARD-reviews.md and
plans/evidence/v2/reviews/GUARD-{production-round1,custody-plan-round1,
repair-checkpoint,immediate-orphan-probe}.json. The accepted historical
TRIAGE/round-9 bindings remain intact. No IF-0-GUARD-2 was produced.

## Next Gate

The maintainer has been asked whether all GUARD verification, including
pnpm test, may require Linux while native macOS/Windows containment is deferred.
No response has been recorded; do not infer approval from silence. Published
runtime portability is unchanged. If approved, re-panel the revised bounded
subreaper/pidfd contract, reconcile, then assign the existing SL-0 worktree to
one worker. New tests/helpers/guard-supervisor.py ownership cannot execute yet.

Also pending: permission to require guard-required and up-to-date PRs on main.
No protection setting changed. This is a later merge gate, not an agent-harness
runtime dependency. Qualified publisher Q remains separate from review-only R58.
Never rotate, replay ambiguous publication, bypass the broker or delete evidence.

After the new backend: clean full verification, complete fresh production CR,
hosted CI/rehearsal, exact-head merge under actual protection, post-merge proof,
and custody-aware pruning. No product version/release action belongs in GUARD.
Keep omniagent-plus#20 and downstream audit issues open.

```yaml
automation:
  status: blocked
  terminal_status: blocked
  human_required: true
  blocker_class: product_decision_missing
  blocker_summary: Linux-only GUARD verification decision pending; revised custody plan also needs fresh panel review
  required_human_inputs:
    - Decide Linux-only verification versus native macOS/Windows containment before new helper implementation
    - Later approve main guard-required and up-to-date PR protection
  next_skill: none
  next_command: none
  next_phase: GUARD
  verification_status: failed
  verification_artifact_path: plans/evidence/v2/reviews/GUARD-immediate-orphan-probe.json
  mechanical_full_gate: passed_470_with_one_permitted_skip
  production_review_status: not_accepted
  amendment_review_status: reconciled_revision_requires_fresh_review
  artifact: plans/phase-plan-v2-GUARD.md
  artifact_state: staged
  produced_if_gates: []
```
