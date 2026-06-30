---
phase_loop_plan_version: 1
phase: WORKTREE
roadmap: specs/phase-plans-v1.md
roadmap_sha256: cd559015ff6624aeb1ccbb8a708835c06a747d77d3c62c6a1894af1d8e21bb90
---

# WORKTREE: Worktree Leasing

## Context

`WORKTREE` is Phase 7 from `specs/phase-plans-v1.md`. Canonical `.phase-loop/events.jsonl` records `BOOTCORE` complete at `864906c75d6bc2ba0930104b002aeeeda2c7e5a7`, `STATELEDGER` complete at `25f1b474db017ed0d0fb9d5f442650165ea6ecbe`, and the live tree at `28bccaf42d20e63ab4d026b411087901cd092646` after the later `IDENTITY` closeout. `.phase-loop/state.json` still names `IDENTITY` as current, so this plan treats the newer canonical ledger plus live git topology as authoritative and does not use legacy `.codex/phase-loop/` state to block or supersede it.

This phase consumes `IF-0-BOOTCORE-2` and `IF-0-STATELEDGER-3`. It adds a real `@omniagent-plus/worktree-leasing` package that wraps the frozen `WorktreeLease` contracts and durable state-ledger coordination with lease lifecycle, worktree placement, branch collision, cleanup, stale recovery, and race-proof behavior. It must not render handoff packets, add consumer adapters, delete dirty worktrees, bypass `/mnt/workspace` placement on workspace-enabled hosts, or mutate upstream core/state-ledger contracts unless execution proves a repairable `contract_bug` in those already-produced gates.

## Interface Freeze Gates

- [ ] IF-0-WORKTREE-7 - Worktree leasing uses durable atomic locks, fencing tokens, heartbeat renewal, stale recovery, and workspace-root placement rules.
  - Required package surface: `@omniagent-plus/worktree-leasing` exports lease manager, lock backend, heartbeat renewal, git worktree placement, branch collision policy, diff summary helper, stale recovery, cleanup, and public gate constant APIs built on `WorktreeLeaseRequest`, `WorktreeLease`, `AuditLedger`, and state-ledger coordination primitives.
  - Required lock proof: fixtures and tests prove atomic cross-process acquisition, exclusive lease rejection, fencing-token uniqueness, holder identity, TTL bounds, heartbeat renewal, and dirty-state tracking without in-memory-only coordination.
  - Required placement proof: worktree creation resolves to `/mnt/workspace/worktrees/<project>-<branch>` when `/mnt/workspace` exists, otherwise to the configured repo-adjacent default, and rejects symlink escapes, path traversal, invalid branch names, and unapproved branch collisions.
  - Required recovery proof: stale recovery checks process liveness, host identity, branch state, dirty state, lease expiration, and fencing token before reuse or cleanup.
  - Required cleanup proof: cleanup verifies the fencing token, refuses dirty worktree deletion, leaves read-only reviewer state untouched unless explicitly requested, and records metadata-only evidence.
  - Required race proof: two independent Node processes cannot acquire the same exclusive lease, long-running leases renew without being stolen, and cleanup cannot remove an active or dirty worktree.

## Spec Closeout Plan

- schema: `spec_delta_closeout.v1`
- decision: `no_spec_delta`
- target surfaces: `packages/worktree-leasing/`, `fixtures/worktree/`, `docs/worktree-leasing.md`
- evidence paths: `packages/worktree-leasing/src/**/*.test.ts`, `fixtures/worktree/`, `.phase-loop/runs/<run>/verification.json`
- redaction posture: `metadata_only`
- downstream handling: none; downstream phases may consume `IF-0-WORKTREE-7` only after the closeout records the produced gate and the automation suite passes.

## Lane Index & Dependencies

SL-0 — Worktree package boundary, locks, leases, and heartbeat
  Depends on: (none)
  Blocks: SL-1, SL-2
  Parallel-safe: no

SL-1 — Git placement, branch policy, and diff metadata
  Depends on: SL-0
  Blocks: SL-2
  Parallel-safe: yes

SL-2 — Cleanup, stale recovery, docs, and race verification reducer
  Depends on: SL-0, SL-1
  Blocks: (none)
  Parallel-safe: no

## Execution Policy

- work-unit defaults: work-unit=`lane_execute`, effort=`high`, unsupported=`inherit_default`, inherit-default=`true`
- SL-2: executor=`codex`, model=`gpt-5.5`, effort=`medium`, work-unit=`phase_reducer`, reason=`cleanup stale recovery docs and phase verification reducer`

## Lanes

### SL-0 — Worktree package boundary, locks, leases, and heartbeat

- **Scope**: Add the worktree-leasing package boundary, public lease lifecycle types, durable atomic lock wrapper, exclusive lease manager, fencing-token enforcement, and heartbeat renewal.
- **Owned files**: `pnpm-lock.yaml`, `packages/worktree-leasing/package.json`, `packages/worktree-leasing/tsconfig.json`, `packages/worktree-leasing/src/types.ts`, `packages/worktree-leasing/src/locks.ts`, `packages/worktree-leasing/src/lease-manager.ts`, `packages/worktree-leasing/src/heartbeat.ts`, `packages/worktree-leasing/src/index.ts`, `packages/worktree-leasing/src/locks.test.ts`, `packages/worktree-leasing/src/lease-manager.test.ts`, `packages/worktree-leasing/src/heartbeat.test.ts`, `fixtures/worktree/leases/*.json`
- **Interfaces provided**: `worktree_leasing.package.v1`, `worktree_leasing.types.v1`, `worktree_leasing.lock_backend.v1`, `worktree_leasing.lease_manager.v1`, `worktree_leasing.heartbeat.v1`
- **Interfaces consumed**: `IF-0-BOOTCORE-2` (pre-existing), `IF-0-STATELEDGER-3` (pre-existing), `WorktreeLeaseRequest` (pre-existing), `WorktreeLease` (pre-existing), `AuditLedger.appendWorktreeLease` (pre-existing), `CoordinationStore.acquireExclusiveLease` (pre-existing)
- **Parallel-safe**: no

| Task ID | Type | Depends on | Files in scope | Tests owned | Test command |
| --- | --- | --- | --- | --- | --- |
| SL-0-T1 | test | (none) | package metadata, lock backend tests, lease manager tests, heartbeat tests, and lease fixtures | lock, lease manager, and heartbeat lifecycle tests | `test ! -e packages/worktree-leasing/package.json || pnpm --filter @omniagent-plus/worktree-leasing test -- --run packages/worktree-leasing/src/locks.test.ts packages/worktree-leasing/src/lease-manager.test.ts packages/worktree-leasing/src/heartbeat.test.ts` |
| SL-0-T2 | impl | SL-0-T1 | package metadata, lockfile, tsconfig, lease lifecycle types, lock backend, lease manager, heartbeat renewal, public exports, and fixtures | n/a | n/a |
| SL-0-T3 | verify | SL-0-T2 | package boundary and lease lifecycle source/tests/fixtures | lock, lease manager, and heartbeat lifecycle tests | `pnpm install --frozen-lockfile && pnpm --filter @omniagent-plus/worktree-leasing test -- --run packages/worktree-leasing/src/locks.test.ts packages/worktree-leasing/src/lease-manager.test.ts packages/worktree-leasing/src/heartbeat.test.ts && pnpm --filter @omniagent-plus/worktree-leasing typecheck && find fixtures/worktree/leases -name '*.json' -print | sort | xargs -r -n1 python3 -m json.tool >/dev/null` |

### SL-1 — Git placement, branch policy, and diff metadata

- **Scope**: Implement git worktree creation helpers, workspace-root placement, path safety, branch collision policy, dirty-state inspection, and bounded diff metadata helpers for downstream handoff packets.
- **Owned files**: `packages/worktree-leasing/src/git.ts`, `packages/worktree-leasing/src/mounted-workspace.ts`, `packages/worktree-leasing/src/branch-policy.ts`, `packages/worktree-leasing/src/diff-summary.ts`, `packages/worktree-leasing/src/git.test.ts`, `packages/worktree-leasing/src/mounted-workspace.test.ts`, `packages/worktree-leasing/src/branch-policy.test.ts`, `packages/worktree-leasing/src/diff-summary.test.ts`, `fixtures/worktree/git/*.json`, `fixtures/worktree/placement/*.json`, `fixtures/worktree/diff/*.json`
- **Interfaces provided**: `worktree_leasing.git_worktree.v1`, `worktree_leasing.workspace_placement.v1`, `worktree_leasing.branch_policy.v1`, `worktree_leasing.diff_metadata.v1`
- **Interfaces consumed**: `worktree_leasing.package.v1`, `worktree_leasing.types.v1`, `worktree_leasing.lock_backend.v1`, `worktree_leasing.lease_manager.v1`, `IF-0-BOOTCORE-2` (pre-existing), `IF-0-STATELEDGER-3` (pre-existing), `specs/agent-runtime-provider-omnigent-spec.md` (pre-existing)
- **Parallel-safe**: yes

| Task ID | Type | Depends on | Files in scope | Tests owned | Test command |
| --- | --- | --- | --- | --- | --- |
| SL-1-T1 | test | SL-0-T3 | git helper tests, workspace placement tests, branch policy tests, diff summary tests, and placement/diff fixtures | git placement, branch collision, path safety, dirty-state, and diff metadata tests | `pnpm --filter @omniagent-plus/worktree-leasing test -- --run packages/worktree-leasing/src/git.test.ts packages/worktree-leasing/src/mounted-workspace.test.ts packages/worktree-leasing/src/branch-policy.test.ts packages/worktree-leasing/src/diff-summary.test.ts` |
| SL-1-T2 | impl | SL-1-T1 | git worktree helper, mounted workspace resolver, branch collision policy, diff summary helper, and fixtures | n/a | n/a |
| SL-1-T3 | verify | SL-1-T2 | git/placement/branch/diff source/tests and fixtures | git placement, branch collision, path safety, dirty-state, and diff metadata tests | `pnpm --filter @omniagent-plus/worktree-leasing test -- --run packages/worktree-leasing/src/git.test.ts packages/worktree-leasing/src/mounted-workspace.test.ts packages/worktree-leasing/src/branch-policy.test.ts packages/worktree-leasing/src/diff-summary.test.ts && find fixtures/worktree/git fixtures/worktree/placement fixtures/worktree/diff -name '*.json' -print | sort | xargs -r -n1 python3 -m json.tool >/dev/null` |

### SL-2 — Cleanup, stale recovery, docs, and race verification reducer

- **Scope**: Implement process-liveness checks, stale lease recovery, fencing-token cleanup safety, cross-process race tests, documentation, and the terminal phase verification suite after every producer lane passes.
- **Owned files**: `packages/worktree-leasing/src/process-liveness.ts`, `packages/worktree-leasing/src/stale-recovery.ts`, `packages/worktree-leasing/src/cleanup.ts`, `packages/worktree-leasing/src/process-liveness.test.ts`, `packages/worktree-leasing/src/stale-recovery.test.ts`, `packages/worktree-leasing/src/cleanup.test.ts`, `packages/worktree-leasing/src/race-proof.test.ts`, `packages/worktree-leasing/src/phase-verification.test.ts`, `fixtures/worktree/recovery/*.json`, `fixtures/worktree/cleanup/*.json`, `fixtures/worktree/races/*.json`, `docs/worktree-leasing.md`
- **Interfaces provided**: `worktree_leasing.process_liveness.v1`, `worktree_leasing.stale_recovery.v1`, `worktree_leasing.cleanup.v1`, `worktree_leasing.race_proof.v1`, `worktree_leasing.docs.v1`, `spec_delta_closeout.v1:no_spec_delta`, `no_doc_delta:release-surfaces`, `automation.suite_command:worktree-plan-verify`, `IF-0-WORKTREE-7`
- **Interfaces consumed**: `worktree_leasing.package.v1`, `worktree_leasing.types.v1`, `worktree_leasing.lock_backend.v1`, `worktree_leasing.lease_manager.v1`, `worktree_leasing.heartbeat.v1`, `worktree_leasing.git_worktree.v1`, `worktree_leasing.workspace_placement.v1`, `worktree_leasing.branch_policy.v1`, `worktree_leasing.diff_metadata.v1`
- **Parallel-safe**: no

| Task ID | Type | Depends on | Files in scope | Tests owned | Test command |
| --- | --- | --- | --- | --- | --- |
| SL-2-T1 | test | SL-1-T3 | process liveness, stale recovery, cleanup, race proof, docs, phase verification tests, and recovery/cleanup/race fixtures | stale recovery, cleanup safety, race proof, and phase verification tests | `test -f docs/worktree-leasing.md && pnpm --filter @omniagent-plus/worktree-leasing test -- --run packages/worktree-leasing/src/process-liveness.test.ts packages/worktree-leasing/src/stale-recovery.test.ts packages/worktree-leasing/src/cleanup.test.ts packages/worktree-leasing/src/race-proof.test.ts packages/worktree-leasing/src/phase-verification.test.ts` |
| SL-2-T2 | impl | SL-2-T1 | process liveness, stale recovery, cleanup, race tests, phase verification test, docs, and fixtures | n/a | n/a |
| SL-2-T3 | verify | SL-2-T2 | full WORKTREE owned surface | phase verification suite | `test -f docs/worktree-leasing.md && rg -n "IF-0-WORKTREE-7|fencing token|heartbeat|stale recovery|/mnt/workspace/worktrees|dirty worktree|branch collision|path traversal|metadata_only" docs/worktree-leasing.md packages/worktree-leasing/src && pnpm install --frozen-lockfile && pnpm build && pnpm lint && pnpm typecheck && pnpm test -- --run packages/worktree-leasing/src && find fixtures/worktree -name '*.json' -print | sort | xargs -r -n1 python3 -m json.tool >/dev/null && git diff --check && phase-loop validate-roadmap specs/phase-plans-v1.md` |

## Execution Notes

- Treat `.phase-loop/` as the authoritative runner state. Legacy `.codex/phase-loop/` files are compatibility artifacts only and must not block or supersede canonical `.phase-loop/` state.
- If execution creates worktrees and `/mnt/workspace` exists, place every created worktree under `/mnt/workspace/worktrees/omniagent-plus-<branch>`. On hosts without `/mnt/workspace`, use the configured repo-adjacent default and keep tests injectable so CI does not depend on this machine's mount layout.
- `packages/core-contracts/src/worktree.ts`, `packages/core-contracts/src/state-ledger.ts`, `packages/state-ledger/src/audit-ledger.ts`, `packages/state-ledger/src/coordination.ts`, `packages/state-ledger/src/append-only-store.ts`, and `docs/durable-state.md` are read-only contract inputs for this phase. If execution discovers they cannot support heartbeat renewal, cleanup evidence, or stale recovery without contract changes, stop for a `contract_bug` repair or roadmap/spec closeout amendment instead of silently changing upstream gates.
- Worktree paths must be canonicalized before use. Symlink escapes, `..` traversal, absolute paths outside the allowed root, empty project or branch components, and shell-interpreted branch names must fail closed.
- Branch collisions must fail closed unless the request is an explicit `sequential_continue` lease for the same task and clean worktree metadata proves safe reuse.
- Cleanup must verify the active fencing token before mutating filesystem state. Dirty, unknown, mismatched-token, active-process, different-host, and branch-divergent worktrees must not be deleted.
- Stale recovery must inspect process liveness, host identity, branch state, dirty state, expiration, and ledger evidence. Static TTL expiration alone is insufficient to reuse or remove a worktree.
- Diff metadata is bounded and metadata-only for downstream handoff packets. This phase may expose branch, path ref, status summary, changed-path list, and redacted diff stats, but it must not render full handoff packets or persist raw secrets, full environment maps, unbounded command output, raw provider payloads, or secret-bearing diagnostics.
- `SL-2` is the terminal cleanup, documentation, and phase reducer and depends on every producer lane. It records `no_doc_delta` for `README`, `CHANGELOG`, release notes, and external release evidence surfaces because WORKTREE does not dispatch a tag or workflow; a post-dispatch evidence reducer is not applicable in this non-dispatch phase.
- Any defect discovered by `SL-2` verification must be repaired in the producing lane before closeout lists `IF-0-WORKTREE-7`.

## Acceptance Criteria

- [ ] `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm lint`, `pnpm typecheck`, and `pnpm test -- --run packages/worktree-leasing/src` pass from the repo root.
- [ ] `packages/worktree-leasing/src/lease-manager.test.ts` and `locks.test.ts` prove atomic acquisition, exclusive-write rejection, durable lock use, unique fencing tokens, holder identity, TTL bounds, and dirty-state tracking through state-ledger-backed coordination.
- [ ] `packages/worktree-leasing/src/heartbeat.test.ts` proves renewed leases update `renewedAt` and `expiresAt`, keep the same fencing token, and cannot be stolen while the heartbeat is active.
- [ ] `packages/worktree-leasing/src/mounted-workspace.test.ts` proves `/mnt/workspace/worktrees/<project>-<branch>` placement when the mount exists and repo-adjacent placement when it does not.
- [ ] `packages/worktree-leasing/src/git.test.ts`, `branch-policy.test.ts`, and `diff-summary.test.ts` prove git worktree creation, dirty-state inspection, branch collision failure, sequential continuation reuse, path traversal rejection, symlink escape rejection, and bounded diff metadata.
- [ ] `packages/worktree-leasing/src/stale-recovery.test.ts` proves stale recovery checks process liveness, host identity, branch state, dirty state, expiration, and ledger evidence before reuse or cleanup.
- [ ] `packages/worktree-leasing/src/cleanup.test.ts` proves cleanup requires the active fencing token and refuses dirty, unknown, mismatched-token, active-process, different-host, and branch-divergent worktree deletion.
- [ ] `packages/worktree-leasing/src/race-proof.test.ts` proves two independent Node processes cannot acquire the same exclusive lease and cleanup cannot remove an active or dirty worktree during a race.
- [ ] `packages/worktree-leasing/src/phase-verification.test.ts` proves every fixture-backed lock, placement, cleanup, stale recovery, and race case maps to the frozen WORKTREE gate.
- [ ] `docs/worktree-leasing.md` documents the lease model, state-ledger dependency, workspace-root rule, branch collision policy, heartbeat semantics, stale recovery checks, cleanup safety, diff metadata boundary, and non-dispatch release-surface decision.
- [ ] `git status --short -- pnpm-lock.yaml packages/worktree-leasing fixtures/worktree docs/worktree-leasing.md` shows only WORKTREE-owned paths before runner closeout.

## Verification

- automation.suite_command: `pnpm install --frozen-lockfile && pnpm build && pnpm lint && pnpm typecheck && pnpm test -- --run packages/worktree-leasing/src && find fixtures/worktree -name '*.json' -print | sort | xargs -r -n1 python3 -m json.tool >/dev/null && git diff --check && phase-loop validate-roadmap specs/phase-plans-v1.md`
- Lane checks: run the `verify` command from each lane after its implementation task.
- Whole-phase dirty-path check: `git status --short -- pnpm-lock.yaml packages/worktree-leasing fixtures/worktree docs/worktree-leasing.md`
- Closeout gate: list `IF-0-WORKTREE-7` in `produced_if_gates` only after the automation suite passes and the dirty-path check contains only active-plan owned files.
