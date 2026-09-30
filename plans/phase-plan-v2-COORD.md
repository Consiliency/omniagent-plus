---
phase_loop_plan_version: 1
phase: COORD
roadmap: specs/phase-plans-v2.md
roadmap_sha256: ceb903000c4b4ffc9859e5ee6078e1d0ba95a3350e5317978e2e1cdea4f0ae74
automation:
  suite_command: pnpm verify
---

# COORD: Routing and fleet lease safety

## Context

Consumes accepted DATA in omniagent-plus#31 and IF-0-DATA-3a/b/c/d. Owns omniagent-plus#23 and omniagent-plus#24. Preserve the external contract0.6.3 and DATA schemas. Local Git leases, fleet soft/hard leases and inbox notifications remain distinct. All execution is serial in one isolated worktree; no worker fanout is authorized.

## Resolved contracts

- Cooldown evaluation uses injected now (default current time). A valid expired reset releases a reset-bound cooldown; missing/invalid reset stays blocked. Auth, billing and policy hard stops stay blocked regardless of elapsed reset. Every profile/status/provider source is evaluated separately; an expired source must not mask another active source. INTEG persists runtime transitions.
- An unavailable or unknown explicit preferred identity never becomes an unreported explicit_override. Apply existing migration/manual-confirmation policy and record substitution as fallback, or reject.
- sendTurnWithRouteDecision fetches getSessionInfo(request.sessionId) and checks its ID, established targetProvider, targetHarness and identityProfileId against the decision before persistence/send. Unknown labels, lookup failure and mismatches produce zero sends. Matching labels preserve persist-before-send behavior.
- Keep incrementActiveTurns increment-only. Add explicit decrement and an idempotent per-turn accounting owner with begin/settle operations; completion/cancellation/failure/retry settlement cannot decrement twice. INTEG owns scheduling and wiring. Retry admission also respects failure.retryable and supplied idempotency posture; no automatic mutation retry. Existing classification budgets/hard stops remain; validate counters and cap finite backoff at300seconds with deterministic exponential fallback. Retry-After accepts complete nonnegative integer seconds or HTTP dates relative to injected now; invalid/overflow input is ignored and delays are bounded. Confidence is heuristic, not measured accuracy.
- Worktree FilesystemLockBackend adopts DATA withFilesystemLock rather than TTL unlink stealing. The canonical SQLite inode is permanent; atomically publish initialized identity and prove crash release/replacement rejection. A separate validated holder-metadata sidecar is diagnostic only, never ownership authority. Preserve callback return values including undefined; callback EEXIST is not lock contention.
- Worktree registry is the authority for local lease request/root/head metadata; ledger transitions are durable replay evidence. Freeze an optional pending transition containing a validated record and stable ledger recordId. Under the shared coordination lock: durably stage intent, append that ID once, publish the finalized registry and active-map projections, then report success. Recovery checks the same ID/payload and completes pending publication under lock. Read-only inspection does not repair, initialize ledger or take writer locks; pending state reports bounded incomplete status. Use DATA writeJsonAtomic/fsync topology, not lease-manager's unsynced temporary writer. Release uses DATA's release constructor with actual holder/reconciliation/recovery provenance and expiry at release time. Retention may bound released registry/event history while preserving active leases and pending transitions.
- Registry/maps/local fleet store/inbox wrong-version or malformed matching-version structures fail closed and preserve bytes; missing files alone initialize on writes. Treat identifier maps without prototype collisions. Legacy CoordinationStore remains exported; document retained operations and safe unsupported cases after caller inventory. Prevent cross-mode overwrite and conflicts with WorktreeLeaseManager; elapsed TTL cannot grant physical-path takeover from a live/uncertain holder.
- Cleanup accepts only the recorded lease path/root plus a managedRoot, independent caller holder identity/fencing token, and actual Git registration. Require realpath containment and no symlink components below the trusted root; never accept an arbitrary path override or recursive rm fallback. Under the lease mutation lock, recheck lease status/holder/fence, actual dirty state/branch/registration, same-host dead process, and path identity immediately before non-force git worktree remove. Caller dirty/liveness overrides may restrict but never grant authority. Absence reconciliation requires ENOENT proof, compatible registration and dead holder or independent holder proof; it releases metadata, records durable transition and clears registry collision, performs no deletion/prune, and reports reconciled separately from deleted. Permission/unknown-process errors stay blocked; PID reuse/EPERM remain uncertainty.
- Local/fleet leases retain distinct soft/hard semantics. Query is nonmutating and does not take writer locks. Bound events/inbox history and query output without discarding live leases/pending coordination evidence. Add optional validated limit/cursor pagination and acknowledgement where existing operations need it; no inbox-derived ownership. Do not silently turn hard into soft.
- Forward PostgreSQL migration keeps signatures for compatibility but ignores caller clocks in acquire/renew/release/expire/query/send; server time is authoritative. Transactional advisory locking and holder checks serialize conflicting hard acquisition and event/projection updates. Reacquire follows existing released/expired contract behavior. Test at service_role through admitted disposable PostgreSQL, with anon/authenticated denial, concurrent overlap, client skew, wrong-holder, rollback and expiry. No production migration is authorized.
- Supabase wrapper harness uses the real installed SDK with an offline fetch endpoint, asserting wire arguments, lazy serialization and result validation for lease/channel success, malformed responses, RPC errors, auth/permission, timeout and unavailable transport. It proves SDK mapping only; SQL tests prove SQL only. No hosted Supabase acceptance claim or credential requirement is introduced. Preserve bounded categorical failure cause through CLI-2 without raw messages/payloads. Missing/blank URL/key means unavailable; invalid synthetic URL yields bounded validation failure.
- CLI default route is read-only, with no writes/acquire/inbox/provider launch. --record may arbitrate only after route arguments/preference are valid and records actual effects. Cleanup requires independently supplied holder/fence flags; absent-path reconciliation is a separate successful metadata outcome. Identity preflight consumes only explicitly injected hostEnv and profile allowlist, reports names/presence, and retains its documented status write; inventory stays nonmutating. Preserve existing CLI phase/schema literals and exit categories; validate provider/harness/whole integer arguments and known command/state-root error context. Label operator counts estimates.

## Interface Freeze Gates

- [ ] IF-0-COORD-4a — evaluateCooldownState/buildIdentityPool clock behavior, planRoute fallback, established-session admission and bounded evaluateRetryGuardrails/evaluateFailurePolicy.
- [ ] IF-0-COORD-4b — explicit turn accounting and historical replay, shared-lock ownership, recoverable local lease transitions and safe cleanup/reconciliation.
- [ ] IF-0-COORD-4c — server-clock fleet lease/RPC/query/inbox contracts and bounded backend causes; no authority from inbox.
- [ ] IF-0-COORD-4d — CLI effects/options/injected preflight environment and metadata-only verification evidence.

## Lane Index & Dependencies

- SL-0 — Shared private interfaces; Depends on: (none); Blocks: SL-1, SL-2, SL-3; Parallel-safe: no
- SL-1 — Routing/rate policy; Depends on: SL-0; Blocks: SL-4, SL-5; Parallel-safe: no
- SL-2 — Local Git leases and cleanup; Depends on: SL-0; Blocks: SL-4, SL-5; Parallel-safe: no
- SL-3 — Fleet/channel backend; Depends on: SL-0; Blocks: SL-4, SL-5; Parallel-safe: no
- SL-4 — CLI integration; Depends on: SL-0, SL-1, SL-2, SL-3; Blocks: SL-5; Parallel-safe: no
- SL-5 — Verification/docs/acceptance reducer; Depends on: SL-0, SL-1, SL-2, SL-3, SL-4; Blocks: (none); Parallel-safe: no

## Lanes

### SL-0 — Shared private interfaces

- **Scope**: Freeze private additive interfaces and exports before dependent edits.
- **Owned files**: `packages/coordinator/src/types.ts`, `packages/coordinator/src/index.ts`, `packages/rate-limit-catalog/src/types.ts`, `packages/worktree-leasing/src/types.ts`, `packages/worktree-leasing/src/index.ts`, `packages/worktree-leasing/package.json`, `pnpm-lock.yaml`
- **Interfaces provided**: COORD gates4a/b/c; accounting, cleanup holder/managed-root/reconciled result and pending transition types.
- **Interfaces consumed**: DATA core/ledger APIs, published contract0.6.3.
- **Parallel-safe**: no
- **Tasks**:
  - test: audit existing interface/phase verification tests and preserve v1 literals.
  - impl: additive types/exports; add direct zod dependency only if registry validation needs it.
  - verify: `pnpm typecheck` after all implementation lanes complete.

### SL-1 — Routing and rate policy

- **Scope**: Implement cooldown/admission/retry/settlement/classification/replay corrections.
- **Owned files**: `packages/coordinator/src/cooldowns.ts`, `packages/coordinator/src/cooldowns.test.ts`, `packages/coordinator/src/identity-pool.ts`, `packages/coordinator/src/identity-pool.test.ts`, `packages/coordinator/src/route-planner.ts`, `packages/coordinator/src/route-planner.test.ts`, `packages/coordinator/src/launch-gate.ts`, `packages/coordinator/src/launch-gate.test.ts`, `packages/coordinator/src/active-turns.ts`, `packages/coordinator/src/active-turns.test.ts`, `packages/coordinator/src/retry-guardrails.ts`, `packages/coordinator/src/retry-guardrails.test.ts`, `packages/coordinator/src/failure-policy.ts`, `packages/coordinator/src/failure-policy.test.ts`, `packages/coordinator/src/replay.ts`, `packages/coordinator/src/replay.test.ts`, `packages/coordinator/src/adaptive-concurrency.ts`, `packages/coordinator/src/adaptive-concurrency.test.ts`, `packages/rate-limit-catalog/src/rules.ts`, `packages/rate-limit-catalog/src/classifier.test.ts`, `packages/rate-limit-catalog/src/provider-rules.ts`, `packages/rate-limit-catalog/src/provider-rules.test.ts`, `packages/rate-limit-catalog/src/retry-guardrails.ts`, `packages/rate-limit-catalog/src/retry-guardrails.test.ts`
- **Interfaces provided**: IF-0-COORD-4a and accounting/replay portion4b.
- **Interfaces consumed**: SL-0, DATA retained metadata policy.
- **Parallel-safe**: no
- **Tasks**:
  - test: clock expiry/hard stops; missing preferred target; mismatch/unknown session zero sends; retry integer/date/negative/overflow; finite concurrency; duplicate terminal settlement; classifications apply only to subsequent matching history.
  - impl: resolved routing/retry contracts; anchored header allowlist and safe publication excerpts.
  - verify: `pnpm exec vitest run packages/coordinator/src packages/rate-limit-catalog/src`.

### SL-2 — Local Git leases and cleanup

- **Scope**: Repair worktree ownership, durable publication/replay and safe deletion/reconciliation.
- **Owned files**: `packages/worktree-leasing/src/locks.ts`, `packages/worktree-leasing/src/locks.test.ts`, `packages/worktree-leasing/src/lease-manager.ts`, `packages/worktree-leasing/src/lease-manager.test.ts`, `packages/worktree-leasing/src/cleanup.ts`, `packages/worktree-leasing/src/cleanup.test.ts`, `packages/worktree-leasing/src/git.ts`, `packages/worktree-leasing/src/git.test.ts`, `packages/worktree-leasing/src/process-liveness.ts`, `packages/worktree-leasing/src/process-liveness.test.ts`, `packages/worktree-leasing/src/stale-recovery.ts`, `packages/worktree-leasing/src/stale-recovery.test.ts`, `packages/worktree-leasing/src/diff-summary.ts`, `packages/worktree-leasing/src/diff-summary.test.ts`, `packages/worktree-leasing/src/hardening-recovery.test.ts`, `packages/worktree-leasing/src/race-proof.test.ts`, `packages/worktree-leasing/src/coord-durability.test.ts`, `packages/worktree-leasing/src/branch-policy.ts`, `packages/worktree-leasing/src/branch-policy.test.ts`, `packages/state-ledger/src/coordination.ts`, `packages/state-ledger/src/coordination.test.ts`, `fixtures/worktree/cleanup/cleanup-cases.json`
- **Interfaces provided**: IF-0-COORD-4b.
- **Interfaces consumed**: SL-0, DATA SQLite locks/writeJsonAtomic/AppendOnlyStore/release constructor.
- **Parallel-safe**: no
- **Tasks**:
  - test: real disposable registered worktrees; alternate/symlink/unregistered/replaced/dirty/live/uncertain paths stay intact; missing path metadata-only release; corrupt bytes preserve and deny acquire; fault after each intent/ledger/registry/map publication; lock crash/replacement; staged/unstaged/untracked counts.
  - impl: resolved registry/cleanup/lock protocols and retained legacy API; no new force flags.
  - verify: `pnpm exec vitest run packages/worktree-leasing/src/locks.test.ts packages/worktree-leasing/src/lease-manager.test.ts packages/worktree-leasing/src/cleanup.test.ts packages/worktree-leasing/src/coord-durability.test.ts packages/state-ledger/src/coordination.test.ts`.

### SL-3 — Fleet and channel backend

- **Scope**: Enforce server clocks, atomic fleet ownership, bounded stores/queries and truthful RPC diagnostics.
- **Owned files**: `packages/worktree-leasing/src/lease-store.ts`, `packages/worktree-leasing/src/supabase-lease-store.ts`, `packages/worktree-leasing/src/supabase-lease-store.test.ts`, `packages/state-ledger/src/coordination-channel.ts`, `packages/state-ledger/src/coordination-channel.test.ts`, `packages/state-ledger/src/supabase-coordination-channel.ts`, `packages/state-ledger/src/supabase-coordination-channel.test.ts`, `supabase/migrations/20260930000000_coordination_server_time.sql`, `tests/guard/coordination.db.test.ts`, `tests/guard/required-cases.json`
- **Interfaces provided**: IF-0-COORD-4c.
- **Interfaces consumed**: SL-0, DATA safe-body guards, existing admitted SQL helper/roles/migration installer.
- **Parallel-safe**: no
- **Tasks**:
  - test: service_role skew/concurrent acquisition/holder/expiry/rollback/permissions; real SDK offline fetch success/error/malformed wire probes; local bounded/query/ack/corruption controls.
  - impl: forward-only migration and wrappers; categorical diagnostics; preserve no hard-to-soft fallback.
  - verify: `pnpm exec vitest run packages/worktree-leasing/src/supabase-lease-store.test.ts packages/state-ledger/src/coordination-channel.test.ts packages/state-ledger/src/supabase-coordination-channel.test.ts`; `pnpm test:integration` provisions admitted disposable PostgreSQL and must not skip.

### SL-4 — CLI integration

- **Scope**: Expose corrected routing/cleanup/backend/preflight effects without implicit launch.
- **Owned files**: `packages/cli/src/args.ts`, `packages/cli/src/args.test.ts`, `packages/cli/src/runtime.ts`, `packages/cli/src/types.ts`, `packages/cli/src/errors.ts`, `packages/cli/src/command-registry.ts`, `packages/cli/src/commands/route-task.ts`, `packages/cli/src/commands/worktrees.ts`, `packages/cli/src/commands/coordination.ts`, `packages/cli/src/commands/identities.ts`, `packages/cli/src/route-task.test.ts`, `packages/cli/src/worktrees.test.ts`, `packages/cli/src/coordination.test.ts`, `packages/cli/src/identities.test.ts`, `packages/cli/src/cli.test.ts`
- **Interfaces provided**: IF-0-COORD-4d.
- **Interfaces consumed**: SL-0..3, existing identity preflight allowlist APIs and DATA export projections.
- **Parallel-safe**: no
- **Tasks**:
  - test: unknown flags reject, known flags pass; invalid enum/integer causes zero effects; default route no new state; record effects explicit; cleanup independent proof absent/mismatch/success/reconciliation; preflight injected environment values never appear; backend cause categories survive safely.
  - impl: resolved CLI contracts; preserve phase/result schemas and actual effect descriptions.
  - verify: `pnpm exec vitest run packages/cli/src`.

### SL-5 — Verification and acceptance reducer

- **Scope**: Verify combined behavior and publish truthful docs/criteria/evidence/issue dispositions.
- **Owned files**: `docs/coordinator-routing.md`, `docs/coordination-backend.md`, `docs/worktree-leasing.md`, `docs/local-operator-cli.md`, `docs/hardening-readiness.md`, `fixtures/hardening/readiness/docs-contract.json`, `plans/evidence/v2/COORD.json`, `plans/evidence/v2/COORD-closeout.json`, `plans/evidence/v2/reviews/COORD-*.json`, `plans/manifest.json`
- **Interfaces provided**: all accepted COORD gates.
- **Interfaces consumed**: all producer lanes, roadmap EC IDs, preserved DATA evidence.
- **Parallel-safe**: no
- **Tasks**:
  - test: full gate, readiness/packed consumers and source-bound hostile/positive controls.
  - impl: metadata-only receipts, docs, findings/dispositions and manifest lifecycle; preserve dissent and future-SHA honesty.
  - verify: `pnpm verify`; current-head hosted full gate plus source-bound rehearsal; post-merge main CI; ignored-output audit.

## Verification

Frozen install, build, targeted suites, lint/typecheck and full pnpm verify. No local SQL failure becomes a full-gate pass. Canonical hosted topology remains admissible; retain exact runner/source/artifact receipts and classify local failures. Four-seat agent-harness panel and separate independent review must pass before merge; Opus5.5 subscription TUI and tool-enabled Gemini run manually by reference. Sol replaces Grok until October2; preserve original dissent, reconcile and rerun until mergeable under owner direction. Review this plan before implementation and review the exact production candidate before acceptance. Branch protection remains optional. No credential switching, live user data, production DB migration or registry publication in COORD.

## Acceptance Criteria

- [ ] EC-COORD-1 — proven by cooldowns/identity-pool/route-planner/launch-gate suites; falsified by expired block, false override or mismatched established-session send.
- [ ] EC-COORD-2 — proven by classifier/retry/failure-policy/active-turns/replay suites; falsified by unsafe/unbounded delay, retry of hard/nonretryable failure, leaked metadata or duplicate decrement.
- [ ] EC-COORD-3 — proven by real cleanup/locks/coord-durability/corruption suites; falsified by alternate/replaced/live/dirty deletion, ambiguous takeover or missing-path release without durable post-state.
- [ ] EC-COORD-4 — proven by admitted coordination.db.test.ts and real-SDK wrapper suites; falsified by caller-clock expiry, concurrent conflicting grant, wrong-holder mutation, unauthorized role access or event/projection divergence.
- [ ] EC-COORD-5 — proven by CLI argv/effect/preflight suites and retained CoordinationStore inventory; falsified by invalid-argv side effect, implicit launch, hidden environment lookup or empty-on-corrupt state.

## Spec Closeout Plan

- schema: `spec_delta_closeout.v1`
- decision: `no_spec_delta`
- target surfaces: `docs/coordination-backend.md`, `docs/coordinator-routing.md`, `docs/worktree-leasing.md`, `docs/local-operator-cli.md`
- evidence paths: `plans/evidence/v2/COORD.json`, `plans/evidence/v2/COORD-closeout.json`
- redaction posture: `metadata_only`
- downstream handling: INTEG consumes bounded settlement/replay ownership; WIRE remains independent; no external canon edit.

