---
phase_loop_plan_version: 1
phase: COORDINATOR
roadmap: specs/phase-plans-v1.md
roadmap_sha256: cd559015ff6624aeb1ccbb8a708835c06a747d77d3c62c6a1894af1d8e21bb90
---

# COORDINATOR: Coordinator And Router

## Context

`COORDINATOR` is Phase 9 from `specs/phase-plans-v1.md`. Canonical `.phase-loop/state.json`, `.phase-loop/tui-handoff.md`, and the newer event ledger place all prerequisites through `HANDOFF` in `complete`, set `COORDINATOR` as the current unplanned phase, and show a clean live tree at `a3b1669b216a3db4a1e165664374c3d895b769d0`. This plan treats `.phase-loop/` as the authoritative runner state. Legacy `.codex/phase-loop/` files are compatibility artifacts only and must not block or supersede canonical state.

This phase consumes `IF-0-STATELEDGER-3`, `IF-0-TRANSPORT-4`, `IF-0-LIMITS-5`, `IF-0-IDENTITY-6`, `IF-0-WORKTREE-7`, and `IF-0-HANDOFF-8`. It adds a real `@omniagent-plus/coordinator` package that selects provider, harness, and identity candidates only after durable status, cooldown, limit, lease, capability, and handoff evidence is available. Route decisions must be appended to the audit ledger before backend launch, and replay must explain selected provider, harness, identity, fallback reason, portability posture, capacity, cooldown, and evidence refs. This phase must not add consumer adapters, UI, live Omnigent as a CI requirement, account switching as quota bypass, or any silent executor/provider label downgrade.

## Interface Freeze Gates

- [ ] IF-0-COORDINATOR-9 - Coordinator routing persists decisions before launch, enforces cooldowns and active-turn limits, and replays route rationale from the ledger.
  - Required package surface: `@omniagent-plus/coordinator` exports typed coordinator inputs, identity-pool inventory, cooldown evaluation, active-turn accounting, adaptive concurrency, portability scoring, route planning, route persistence, launch gating, failure policy, retry guardrails, and replay helpers.
  - Required route-decision proof: `RouteDecision` records enough durable rationale to replay selected provider, selected harness, selected identity, preferred target, fallback reason, capability fit, provider health, current capacity, context portability, active-turn target, cooldown state, and bounded evidence refs without storing secrets or raw provider payloads.
  - Required launch-gate proof: route decisions are appended through `AuditLedger.appendRouteDecision` before any `AgentRuntimeProvider.createSession` or `sendTurn` call, and launch fails closed if the append fails.
  - Required cooldown proof: burst and concurrency limits reduce active-turn targets, fixed-window usage caps and monthly caps pause the identity or provider family until reset, and provider-family cooldown blocks immediate same-provider account hopping unless the frozen routing action requires manual confirmation.
  - Required portability proof: high-portability work may migrate across provider families when policy and capability fit permit it, while low-portability sessions wait or retry the same provider by default.
  - Required retry proof: repeated failures, unknown limit signals, auth/billing problems, policy blocks, and outage-like signals are bounded by retry-storm guardrails and produce ledger evidence explaining the chosen action.

## Spec Closeout Plan

- schema: `spec_delta_closeout.v1`
- decision: `no_spec_delta`
- target surfaces: `packages/coordinator/`, `packages/core-contracts/src/route-decision.ts`, `fixtures/coordinator/`, `fixtures/core/contracts/route-decision.json`, `docs/coordinator-routing.md`, `docs/architecture.md`
- evidence paths: `packages/coordinator/src/**/*.test.ts`, `packages/core-contracts/src/schemas.test.ts`, `fixtures/coordinator/`, `.phase-loop/runs/<run>/verification.json`
- redaction posture: `metadata_only`
- downstream handling: none; downstream phases may consume `IF-0-COORDINATOR-9` only after the closeout records the produced gate and the automation suite passes.

## Lane Index & Dependencies

SL-0 — Coordinator package, route contract, identity pool, and capacity accounting
  Depends on: (none)
  Blocks: SL-1, SL-2
  Parallel-safe: no

SL-1 — Portability scoring, route persistence, and launch gate
  Depends on: SL-0
  Blocks: SL-2
  Parallel-safe: yes

SL-2 — Failure guardrails, replay, docs, exports, and phase verification reducer
  Depends on: SL-0, SL-1
  Blocks: (none)
  Parallel-safe: no

## Execution Policy

- work-unit defaults: work-unit=`lane_execute`, effort=`high`, unsupported=`inherit_default`, inherit-default=`true`
- SL-2: executor=`codex`, model=`gpt-5.5`, effort=`medium`, work-unit=`phase_reducer`, reason=`failure guardrails replay docs exports and phase verification reducer`

## Lanes

### SL-0 — Coordinator package, route contract, identity pool, and capacity accounting

- **Scope**: Add the coordinator package boundary, extend the route-decision rationale contract, and implement identity pool, provider-family cooldown, active-turn, and adaptive concurrency primitives without launching providers.
- **Owned files**: `pnpm-lock.yaml`, `packages/coordinator/package.json`, `packages/coordinator/tsconfig.json`, `packages/coordinator/src/types.ts`, `packages/coordinator/src/identity-pool.ts`, `packages/coordinator/src/cooldowns.ts`, `packages/coordinator/src/active-turns.ts`, `packages/coordinator/src/adaptive-concurrency.ts`, `packages/coordinator/src/identity-pool.test.ts`, `packages/coordinator/src/cooldowns.test.ts`, `packages/coordinator/src/active-turns.test.ts`, `packages/coordinator/src/adaptive-concurrency.test.ts`, `packages/core-contracts/src/route-decision.ts`, `packages/core-contracts/src/index.ts`, `packages/core-contracts/src/schemas.test.ts`, `fixtures/core/contracts/route-decision.json`, `fixtures/coordinator/pools/*.json`, `fixtures/coordinator/cooldowns/*.json`, `fixtures/coordinator/capacity/*.json`
- **Interfaces provided**: `coordinator.package.v1`, `coordinator.types.v1`, `coordinator.route_decision_rationale.v1`, `coordinator.identity_pool.v1`, `coordinator.cooldown_policy.v1`, `coordinator.active_turn_accounting.v1`, `coordinator.adaptive_concurrency.v1`
- **Interfaces consumed**: `IF-0-STATELEDGER-3` (pre-existing), `IF-0-LIMITS-5` (pre-existing), `IF-0-IDENTITY-6` (pre-existing), `IdentityProfileStatusStore` (pre-existing), `LimitClassification` (pre-existing), `ProviderFamilyCooldown` (pre-existing), `AuditLedger.appendProviderCooldown` (pre-existing), `AuditLedger.listRecordsByKind` (pre-existing)
- **Parallel-safe**: no

| Task ID | Type | Depends on | Files in scope | Tests owned | Test command |
| --- | --- | --- | --- | --- | --- |
| SL-0-T1 | test | (none) | coordinator package metadata, route-decision fixture/schema tests, identity pool tests, cooldown tests, active-turn tests, adaptive concurrency tests, and pool/cooldown/capacity fixtures | route rationale schema, identity eligibility, provider-family cooldown, active-turn counting, and adaptive concurrency tests | `test ! -e packages/coordinator/package.json || pnpm --filter @omniagent-plus/coordinator test -- --run packages/coordinator/src/identity-pool.test.ts packages/coordinator/src/cooldowns.test.ts packages/coordinator/src/active-turns.test.ts packages/coordinator/src/adaptive-concurrency.test.ts && pnpm --filter @omniagent-plus/core-contracts test -- --run packages/core-contracts/src/schemas.test.ts` |
| SL-0-T2 | impl | SL-0-T1 | package metadata, lockfile, tsconfig, shared coordinator types, route-decision rationale schema, package exports for route rationale, identity pool inventory, cooldown evaluation, active-turn accounting, adaptive concurrency, and fixtures | n/a | n/a |
| SL-0-T3 | verify | SL-0-T2 | package boundary, route rationale contract, identity pool, cooldown, active-turn, adaptive concurrency source/tests/fixtures | route rationale schema, identity eligibility, provider-family cooldown, active-turn counting, and adaptive concurrency tests | `pnpm install --frozen-lockfile && pnpm --filter @omniagent-plus/core-contracts test -- --run packages/core-contracts/src/schemas.test.ts && pnpm --filter @omniagent-plus/coordinator test -- --run packages/coordinator/src/identity-pool.test.ts packages/coordinator/src/cooldowns.test.ts packages/coordinator/src/active-turns.test.ts packages/coordinator/src/adaptive-concurrency.test.ts && pnpm --filter @omniagent-plus/coordinator typecheck && find fixtures/coordinator/pools fixtures/coordinator/cooldowns fixtures/coordinator/capacity -name '*.json' -print | sort | xargs -r -n1 python3 -m json.tool >/dev/null` |

### SL-1 — Portability scoring, route persistence, and launch gate

- **Scope**: Implement task portability scoring, route planning, durable route-decision persistence, and provider launch gating that refuses to call a backend until the route decision is written.
- **Owned files**: `packages/coordinator/src/portability.ts`, `packages/coordinator/src/route-planner.ts`, `packages/coordinator/src/route-store.ts`, `packages/coordinator/src/launch-gate.ts`, `packages/coordinator/src/portability.test.ts`, `packages/coordinator/src/route-planner.test.ts`, `packages/coordinator/src/route-store.test.ts`, `packages/coordinator/src/launch-gate.test.ts`, `fixtures/coordinator/portability/*.json`, `fixtures/coordinator/routing/*.json`, `fixtures/coordinator/launch-gates/*.json`
- **Interfaces provided**: `coordinator.portability_scoring.v1`, `coordinator.route_planner.v1`, `coordinator.route_persistence.v1`, `coordinator.launch_gate.v1`
- **Interfaces consumed**: `coordinator.types.v1`, `coordinator.route_decision_rationale.v1`, `coordinator.identity_pool.v1`, `coordinator.cooldown_policy.v1`, `coordinator.active_turn_accounting.v1`, `coordinator.adaptive_concurrency.v1`, `IF-0-TRANSPORT-4` (pre-existing), `IF-0-WORKTREE-7` (pre-existing), `IF-0-HANDOFF-8` (pre-existing), `AgentRuntimeProvider` (pre-existing), `AuditLedger.appendRouteDecision` (pre-existing), `WorktreeLease` (pre-existing), `HandoffPacket` (pre-existing)
- **Parallel-safe**: yes

| Task ID | Type | Depends on | Files in scope | Tests owned | Test command |
| --- | --- | --- | --- | --- | --- |
| SL-1-T1 | test | SL-0-T3 | portability tests, route planner tests, route store tests, launch-gate tests, and portability/routing/launch fixtures | portability scoring, provider-family migration, low-portability wait/retry, route persistence, and append-before-launch tests | `pnpm --filter @omniagent-plus/coordinator test -- --run packages/coordinator/src/portability.test.ts packages/coordinator/src/route-planner.test.ts packages/coordinator/src/route-store.test.ts packages/coordinator/src/launch-gate.test.ts` |
| SL-1-T2 | impl | SL-1-T1 | portability scorer, route planner, durable route store, launch gate, and fixtures | n/a | n/a |
| SL-1-T3 | verify | SL-1-T2 | portability, route planner, route persistence, launch gate source/tests/fixtures | portability scoring, provider-family migration, low-portability wait/retry, route persistence, and append-before-launch tests | `pnpm --filter @omniagent-plus/coordinator test -- --run packages/coordinator/src/portability.test.ts packages/coordinator/src/route-planner.test.ts packages/coordinator/src/route-store.test.ts packages/coordinator/src/launch-gate.test.ts && find fixtures/coordinator/portability fixtures/coordinator/routing fixtures/coordinator/launch-gates -name '*.json' -print | sort | xargs -r -n1 python3 -m json.tool >/dev/null` |

### SL-2 — Failure guardrails, replay, docs, exports, and phase verification reducer

- **Scope**: Add failure classification policy, retry-storm guardrails, route replay helpers, public exports, coordinator documentation, and the terminal phase verification suite after every producer lane passes.
- **Owned files**: `packages/coordinator/src/failure-policy.ts`, `packages/coordinator/src/retry-guardrails.ts`, `packages/coordinator/src/replay.ts`, `packages/coordinator/src/index.ts`, `packages/coordinator/src/failure-policy.test.ts`, `packages/coordinator/src/retry-guardrails.test.ts`, `packages/coordinator/src/replay.test.ts`, `packages/coordinator/src/phase-verification.test.ts`, `fixtures/coordinator/failures/*.json`, `fixtures/coordinator/retry/*.json`, `fixtures/coordinator/replay/*.json`, `docs/coordinator-routing.md`, `docs/architecture.md`
- **Interfaces provided**: `coordinator.failure_policy.v1`, `coordinator.retry_guardrails.v1`, `coordinator.route_replay.v1`, `coordinator.public_exports.v1`, `coordinator.docs.v1`, `spec_delta_closeout.v1:no_spec_delta`, `no_doc_delta:release-surfaces`, `automation.suite_command:coordinator-plan-verify`, `IF-0-COORDINATOR-9`
- **Interfaces consumed**: `coordinator.types.v1`, `coordinator.route_decision_rationale.v1`, `coordinator.identity_pool.v1`, `coordinator.cooldown_policy.v1`, `coordinator.active_turn_accounting.v1`, `coordinator.adaptive_concurrency.v1`, `coordinator.portability_scoring.v1`, `coordinator.route_planner.v1`, `coordinator.route_persistence.v1`, `coordinator.launch_gate.v1`, `IF-0-LIMITS-5` (pre-existing), `IF-0-STATELEDGER-3` (pre-existing), `RuntimeFailure` (pre-existing), `LimitClassification` (pre-existing), `AuditLedger.listTaskRecords` (pre-existing)
- **Parallel-safe**: no

| Task ID | Type | Depends on | Files in scope | Tests owned | Test command |
| --- | --- | --- | --- | --- | --- |
| SL-2-T1 | test | SL-1-T3 | failure policy tests, retry guardrail tests, replay tests, phase verification test, docs, and failure/retry/replay fixtures | failure policy, retry-storm bounding, ledger replay, public export, documentation, and phase verification tests | `test -f docs/coordinator-routing.md && pnpm --filter @omniagent-plus/coordinator test -- --run packages/coordinator/src/failure-policy.test.ts packages/coordinator/src/retry-guardrails.test.ts packages/coordinator/src/replay.test.ts packages/coordinator/src/phase-verification.test.ts` |
| SL-2-T2 | impl | SL-2-T1 | failure policy, retry guardrails, route replay, public exports, phase verification test, docs, and fixtures | n/a | n/a |
| SL-2-T3 | verify | SL-2-T2 | full COORDINATOR owned surface | phase verification suite | `test -f docs/coordinator-routing.md && rg -n "IF-0-COORDINATOR-9|persisted before launch|active-turn|cooldown|provider-family|portability|retry storm|silent downgrade|metadata_only" docs/coordinator-routing.md docs/architecture.md packages/coordinator/src packages/core-contracts/src/route-decision.ts && pnpm install --frozen-lockfile && pnpm build && pnpm lint && pnpm typecheck && pnpm test -- --run packages/coordinator/src packages/core-contracts/src/schemas.test.ts && find fixtures/coordinator -name '*.json' -print | sort | xargs -r -n1 python3 -m json.tool >/dev/null && git diff --check && phase-loop validate-roadmap specs/phase-plans-v1.md` |

## Execution Notes

- Treat `.phase-loop/` as the authoritative runner state. Legacy `.codex/phase-loop/` files are compatibility artifacts only and must not block or supersede canonical `.phase-loop/` state.
- If execution creates worktrees and `/mnt/workspace` exists, place every created worktree under `/mnt/workspace/worktrees/omniagent-plus-<branch>`. This phase should normally consume worktree lease metadata rather than create new worktrees.
- `packages/state-ledger/src/audit-ledger.ts`, `packages/state-ledger/src/replay.ts`, `packages/omnigent-transport/src/index.ts`, `packages/rate-limit-catalog/src/index.ts`, `packages/identity-isolation/src/index.ts`, `packages/worktree-leasing/src/index.ts`, `packages/core-contracts/src/handoff-packet.ts`, and their docs are read-only contract inputs for this phase. If execution discovers they cannot support required coordinator behavior, stop for a `contract_bug` repair or roadmap/spec closeout amendment instead of silently changing upstream gates.
- Route decisions must be durable before launch. Tests should use fake providers whose `createSession` or `sendTurn` methods prove they were not called when `AuditLedger.appendRouteDecision` fails.
- Burst, token, acceleration, transient, and concurrency limits may reduce active-turn targets or retry according to frozen `LimitClassification.routingAction`; fixed usage caps, monthly caps, auth/billing problems, and policy blocks must not be converted into same-provider account hopping.
- Provider-family cooldown means another account in the same provider family is blocked unless the route policy explicitly records `sameProviderAccountSwitch = manual_confirmation_required` and the launch gate has manual confirmation evidence.
- Low-portability work waits or retries the same provider by default. High-portability work can migrate only when capability fit, identity readiness, worktree lease state, handoff evidence, and routing action all permit it.
- `RouteDecision.silentDowngrade` remains `false`; selected provider, harness, executor, and identity labels must match the actual launch target or the launch gate fails closed.
- `SL-2` is the terminal failure guardrail, replay, documentation, export, and phase reducer and depends on every producer lane. It records `no_doc_delta` for `README`, `CHANGELOG`, release notes, and external release evidence surfaces because COORDINATOR does not dispatch a tag or workflow; a post-dispatch evidence reducer is not applicable in this non-dispatch phase.
- Any defect discovered by `SL-2` verification must be repaired in the producing lane before closeout lists `IF-0-COORDINATOR-9`.

## Acceptance Criteria

- [ ] `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm lint`, `pnpm typecheck`, and `pnpm test -- --run packages/coordinator/src packages/core-contracts/src/schemas.test.ts` pass from the repo root.
- [ ] `packages/core-contracts/src/route-decision.ts`, `packages/core-contracts/src/schemas.test.ts`, and `fixtures/core/contracts/route-decision.json` prove route decisions carry replayable selected provider, selected harness, selected identity, fallback, capacity, cooldown, portability, active-turn target, launch-gate, and evidence metadata without secret-bearing payloads.
- [ ] `packages/coordinator/src/identity-pool.test.ts`, `cooldowns.test.ts`, `active-turns.test.ts`, and `adaptive-concurrency.test.ts` prove identity eligibility, active-turn counters, burst/concurrency reductions, fixed usage cap pauses, and provider-family cooldown behavior.
- [ ] `packages/coordinator/src/portability.test.ts` and `route-planner.test.ts` prove portable work can route across provider families when policy allows, while low-portability sessions wait or retry the same provider by default.
- [ ] `packages/coordinator/src/route-store.test.ts` and `launch-gate.test.ts` prove `AuditLedger.appendRouteDecision` completes before provider launch and launch fails closed when route persistence fails or labels would silently downgrade.
- [ ] `packages/coordinator/src/failure-policy.test.ts` and `retry-guardrails.test.ts` prove auth/billing, policy block, outage, unknown, and repeated limit failures are bounded and cannot create retry storms or same-provider quota bypass.
- [ ] `packages/coordinator/src/replay.test.ts` proves ledger replay explains selected provider, harness, identity, fallback reason, active-turn target, cooldown state, portability score, and evidence refs for a task.
- [ ] `packages/coordinator/src/index.ts` exports the public coordinator APIs and `coordinatorInterfaceFreezeGate` without exporting raw provider payload helpers or secret-bearing diagnostics.
- [ ] `docs/coordinator-routing.md` and `docs/architecture.md` document the coordinator boundary, durable-before-launch route persistence, cooldown and portability policy, retry guardrails, replay posture, and non-dispatch release-surface decision.
- [ ] `git status --short -- pnpm-lock.yaml packages/coordinator packages/core-contracts/src/route-decision.ts packages/core-contracts/src/index.ts packages/core-contracts/src/schemas.test.ts fixtures/core/contracts/route-decision.json fixtures/coordinator docs/coordinator-routing.md docs/architecture.md` shows only COORDINATOR-owned paths before runner closeout.

## Verification

- automation.suite_command: `pnpm install --frozen-lockfile && pnpm build && pnpm lint && pnpm typecheck && pnpm test -- --run packages/coordinator/src packages/core-contracts/src/schemas.test.ts && find fixtures/coordinator -name '*.json' -print | sort | xargs -r -n1 python3 -m json.tool >/dev/null && git diff --check && phase-loop validate-roadmap specs/phase-plans-v1.md`
- Lane checks: run the `verify` command from each lane after its implementation task.
- Whole-phase dirty-path check: `git status --short -- pnpm-lock.yaml packages/coordinator packages/core-contracts/src/route-decision.ts packages/core-contracts/src/index.ts packages/core-contracts/src/schemas.test.ts fixtures/core/contracts/route-decision.json fixtures/coordinator docs/coordinator-routing.md docs/architecture.md`
- Closeout gate: list `IF-0-COORDINATOR-9` in `produced_if_gates` only after the automation suite passes and the dirty-path check contains only active-plan owned files.
