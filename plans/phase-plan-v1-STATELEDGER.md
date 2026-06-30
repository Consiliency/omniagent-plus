---
phase_loop_plan_version: 1
phase: STATELEDGER
roadmap: specs/phase-plans-v1.md
roadmap_sha256: cd559015ff6624aeb1ccbb8a708835c06a747d77d3c62c6a1894af1d8e21bb90
---

# STATELEDGER: Durable State Ledger

## Context

`STATELEDGER` is Phase 3 from `specs/phase-plans-v1.md`. Canonical `.phase-loop/` state marks `CONTRACT` and `BOOTCORE` complete at `864906c75d6bc2ba0930104b002aeeeda2c7e5a7`, with `STATELEDGER` as the current unplanned phase. The current worktree also has unrelated untracked `node_modules/` and `package-lock.json`; this plan does not own or rely on those paths.

This phase consumes `IF-0-BOOTCORE-2` from `packages/core-contracts` and adds a durable local state package for sessions, turns, events, route decisions, limit classifications, identity status, cooldowns, worktree leases, approvals, capability snapshots, and evidence refs. The implementation uses the source-spec-approved append-only JSONL ledger plus sidecar indexes for this early slice, with atomic append, schema versioning, bounded payload checks, crash-recovery tests, and cross-process reads/writes. It does not call real Omnigent, implement routing policy, or expose UI surfaces.

## Interface Freeze Gates

- [ ] IF-0-STATELEDGER-3 - Durable local state, audit ledger, migrations, retention, redaction, and replay contracts are stable across processes.
  - Required backend surface: `@omniagent-plus/state-ledger` provides an append-only JSONL state backend with sidecar indexes, atomic write discipline, migration/version checks, retention pruning, and recoverable startup after interrupted writes.
  - Required record coverage: sessions, turns, runtime events, route decisions, limit classifications, identity profile status, provider-family cooldowns, worktree leases, tool approval requests/responses, Omnigent capability snapshots, and evidence refs persist through schema-versioned records.
  - Required redaction surface: secret-bearing values, unbounded raw transcripts, raw provider payloads, and full env dumps are rejected before persistence; evidence storage accepts only bounded redacted excerpts or metadata-only external artifact refs.
  - Required replay proof: route decisions and runtime history can be replayed from the ledger without live Omnigent, and two independent Node processes observe shared cooldown and lease state.

## Spec Closeout Plan

- schema: `spec_delta_closeout.v1`
- decision: `no_spec_delta`
- target surfaces: `packages/state-ledger/`, `packages/core-contracts/src/state-ledger.ts`, `docs/durable-state.md`
- evidence paths: `packages/state-ledger/src/**/*.test.ts`, `packages/core-contracts/src/state-ledger.test.ts`, `fixtures/state-ledger/`, `.phase-loop/runs/<run>/verification.json`
- redaction posture: `metadata_only`
- downstream handling: none; downstream phases may consume `IF-0-STATELEDGER-3` only after the closeout records the produced gate and the automation suite passes.

## Lane Index & Dependencies

SL-0 — State ledger package and public contracts
  Depends on: (none)
  Blocks: SL-1, SL-2, SL-3, SL-4
  Parallel-safe: no

SL-1 — Schema, migrations, retention, and append-only store
  Depends on: SL-0
  Blocks: SL-2, SL-3, SL-4
  Parallel-safe: yes

SL-2 — Audit ledger persistence APIs
  Depends on: SL-0, SL-1
  Blocks: SL-3, SL-4
  Parallel-safe: yes

SL-3 — Redacted evidence store and cross-process coordination
  Depends on: SL-0, SL-1, SL-2
  Blocks: SL-4
  Parallel-safe: yes

SL-4 — Replay, docs, and phase verification reducer
  Depends on: SL-0, SL-1, SL-2, SL-3
  Blocks: (none)
  Parallel-safe: no

## Execution Policy

- work-unit defaults: work-unit=`lane_execute`, effort=`high`, unsupported=`inherit_default`, inherit-default=`true`
- SL-4: executor=`codex`, model=`gpt-5.5`, effort=`medium`, work-unit=`phase_reducer`, reason=`replay docs and phase verification reducer`

## Lanes

### SL-0 — State ledger package and public contracts

- **Scope**: Add the state-ledger package boundary and core-contract bridge types/schemas that downstream lanes persist.
- **Owned files**: `package.json`, `pnpm-lock.yaml`, `packages/core-contracts/src/index.ts`, `packages/core-contracts/src/state-ledger.ts`, `packages/core-contracts/src/state-ledger.test.ts`, `fixtures/state-ledger/contracts/*.json`, `packages/state-ledger/package.json`, `packages/state-ledger/tsconfig.json`
- **Interfaces provided**: `state_ledger.package.v1`, `state_ledger.contracts.v1`
- **Interfaces consumed**: `IF-0-BOOTCORE-2`, `specs/phase-plans-v1.md`, `specs/agent-runtime-provider-omnigent-spec.md` (pre-existing)
- **Parallel-safe**: no

| Task ID | Type | Depends on | Files in scope | Tests owned | Test command |
| --- | --- | --- | --- | --- | --- |
| SL-0-T1 | test | (none) | `packages/core-contracts/src/state-ledger.test.ts`, `fixtures/state-ledger/contracts/*.json` | state-ledger contract schema tests | `test ! -e packages/core-contracts/src/state-ledger.test.ts || pnpm --filter @omniagent-plus/core-contracts test -- --run packages/core-contracts/src/state-ledger.test.ts` |
| SL-0-T2 | impl | SL-0-T1 | package metadata, root scripts, lockfile, core state-ledger contracts, and contract fixtures | n/a | n/a |
| SL-0-T3 | verify | SL-0-T2 | package metadata and core contract bridge | state-ledger contract schema tests | `pnpm install --frozen-lockfile && pnpm --filter @omniagent-plus/core-contracts test -- --run packages/core-contracts/src/state-ledger.test.ts && pnpm --filter @omniagent-plus/core-contracts typecheck` |

### SL-1 — Schema, migrations, retention, and append-only store

- **Scope**: Implement the versioned storage schema, migration runner, retention policy, and append-only JSONL store primitives with recoverability checks.
- **Owned files**: `packages/state-ledger/src/schema.ts`, `packages/state-ledger/src/migrations.ts`, `packages/state-ledger/src/append-only-store.ts`, `packages/state-ledger/src/retention.ts`, `packages/state-ledger/src/migrations.test.ts`, `packages/state-ledger/src/retention.test.ts`, `fixtures/state-ledger/migrations/*.json`
- **Interfaces provided**: `state_ledger.schema.v1`, `state_ledger.migrations.v1`, `state_ledger.retention.v1`, `state_ledger.append_only_store.v1`
- **Interfaces consumed**: `state_ledger.package.v1`, `state_ledger.contracts.v1`
- **Parallel-safe**: yes

| Task ID | Type | Depends on | Files in scope | Tests owned | Test command |
| --- | --- | --- | --- | --- | --- |
| SL-1-T1 | test | SL-0-T3 | `packages/state-ledger/src/migrations.test.ts`, `packages/state-ledger/src/retention.test.ts`, `fixtures/state-ledger/migrations/*.json` | migration, retention, and recoverability tests | `pnpm --filter @omniagent-plus/state-ledger test -- --run packages/state-ledger/src/migrations.test.ts packages/state-ledger/src/retention.test.ts` |
| SL-1-T2 | impl | SL-1-T1 | schema, migration, append-only store, retention source, and migration fixtures | n/a | n/a |
| SL-1-T3 | verify | SL-1-T2 | schema, migration, append-only store, retention source, and fixtures | migration, retention, and recoverability tests | `pnpm --filter @omniagent-plus/state-ledger test -- --run packages/state-ledger/src/migrations.test.ts packages/state-ledger/src/retention.test.ts && pnpm --filter @omniagent-plus/state-ledger typecheck` |

### SL-2 — Audit ledger persistence APIs

- **Scope**: Persist and query sessions, turns, runtime events, route decisions, limit classifications, identity status, approvals, capability snapshots, cooldowns, and leases as schema-versioned audit records.
- **Owned files**: `packages/state-ledger/src/audit-ledger.ts`, `packages/state-ledger/src/audit-ledger.test.ts`, `fixtures/state-ledger/audit/*.json`
- **Interfaces provided**: `state_ledger.audit_persistence.v1`
- **Interfaces consumed**: `state_ledger.schema.v1`, `state_ledger.migrations.v1`, `state_ledger.append_only_store.v1`, `state_ledger.contracts.v1`
- **Parallel-safe**: yes

| Task ID | Type | Depends on | Files in scope | Tests owned | Test command |
| --- | --- | --- | --- | --- | --- |
| SL-2-T1 | test | SL-1-T3 | `packages/state-ledger/src/audit-ledger.test.ts`, `fixtures/state-ledger/audit/*.json` | audit persistence and query tests | `pnpm --filter @omniagent-plus/state-ledger test -- --run packages/state-ledger/src/audit-ledger.test.ts` |
| SL-2-T2 | impl | SL-2-T1 | audit persistence APIs and audit fixtures | n/a | n/a |
| SL-2-T3 | verify | SL-2-T2 | audit persistence APIs and audit fixtures | audit persistence and query tests | `pnpm --filter @omniagent-plus/state-ledger test -- --run packages/state-ledger/src/audit-ledger.test.ts` |

### SL-3 — Redacted evidence store and cross-process coordination

- **Scope**: Add bounded redacted evidence persistence plus cooldown and lease coordination tests that prove two separate processes observe shared state.
- **Owned files**: `packages/state-ledger/src/evidence-store.ts`, `packages/state-ledger/src/coordination.ts`, `packages/state-ledger/src/evidence-store.test.ts`, `packages/state-ledger/src/cross-process.test.ts`, `fixtures/state-ledger/evidence/*.json`, `fixtures/state-ledger/cross-process/*.json`
- **Interfaces provided**: `state_ledger.evidence_store.v1`, `state_ledger.cross_process_coordination.v1`
- **Interfaces consumed**: `state_ledger.schema.v1`, `state_ledger.retention.v1`, `state_ledger.append_only_store.v1`, `state_ledger.audit_persistence.v1`, `state_ledger.contracts.v1`
- **Parallel-safe**: yes

| Task ID | Type | Depends on | Files in scope | Tests owned | Test command |
| --- | --- | --- | --- | --- | --- |
| SL-3-T1 | test | SL-2-T3 | `packages/state-ledger/src/evidence-store.test.ts`, `packages/state-ledger/src/cross-process.test.ts`, `fixtures/state-ledger/evidence/*.json`, `fixtures/state-ledger/cross-process/*.json` | redaction, evidence, cooldown, lease, and cross-process tests | `pnpm --filter @omniagent-plus/state-ledger test -- --run packages/state-ledger/src/evidence-store.test.ts packages/state-ledger/src/cross-process.test.ts` |
| SL-3-T2 | impl | SL-3-T1 | evidence store, coordination APIs, and evidence/cross-process fixtures | n/a | n/a |
| SL-3-T3 | verify | SL-3-T2 | evidence store, coordination APIs, and evidence/cross-process fixtures | redaction, evidence, cooldown, lease, and cross-process tests | `pnpm --filter @omniagent-plus/state-ledger test -- --run packages/state-ledger/src/evidence-store.test.ts packages/state-ledger/src/cross-process.test.ts` |

### SL-4 — Replay, docs, and phase verification reducer

- **Scope**: Implement route/history replay, publish the package exports, update durable-state docs after all producer lanes pass, record non-dispatch release-surface decisions including that a post-dispatch evidence reducer is not applicable, and run the final phase suite.
- **Owned files**: `packages/state-ledger/src/replay.ts`, `packages/state-ledger/src/replay.test.ts`, `packages/state-ledger/src/index.ts`, `docs/durable-state.md`, `docs/architecture.md`, `README.md`
- **Interfaces provided**: `state_ledger.replay.v1`, `state_ledger.docs.v1`, `spec_delta_closeout.v1:no_spec_delta`, `no_doc_delta:release-surfaces`, `automation.suite_command:stateledger-plan-verify`, `IF-0-STATELEDGER-3`
- **Interfaces consumed**: `state_ledger.package.v1`, `state_ledger.contracts.v1`, `state_ledger.schema.v1`, `state_ledger.migrations.v1`, `state_ledger.retention.v1`, `state_ledger.append_only_store.v1`, `state_ledger.audit_persistence.v1`, `state_ledger.evidence_store.v1`, `state_ledger.cross_process_coordination.v1`
- **Parallel-safe**: no

| Task ID | Type | Depends on | Files in scope | Tests owned | Test command |
| --- | --- | --- | --- | --- | --- |
| SL-4-T1 | test | SL-3-T3 | `packages/state-ledger/src/replay.test.ts`, `docs/durable-state.md`, `docs/architecture.md`, `README.md` | replay and documentation tests | `pnpm --filter @omniagent-plus/state-ledger test -- --run packages/state-ledger/src/replay.test.ts && test -f docs/durable-state.md` |
| SL-4-T2 | impl | SL-4-T1 | replay APIs, package exports, durable-state docs, README, and architecture docs | n/a | n/a |
| SL-4-T3 | verify | SL-4-T2 | full STATELEDGER owned surface | phase verification suite | `pnpm install --frozen-lockfile && pnpm build && pnpm lint && pnpm typecheck && pnpm test -- --run && find fixtures/state-ledger -name '*.json' -print | sort | xargs -r -n1 python3 -m json.tool >/dev/null && git diff --check && phase-loop validate-roadmap specs/phase-plans-v1.md` |

## Execution Notes

- Treat `.phase-loop/` as the authoritative runner state. Legacy `.codex/phase-loop/` files are compatibility artifacts only and must not block or supersede canonical `.phase-loop/` state.
- If execution creates worktrees and `/mnt/workspace` exists, place them under `/mnt/workspace/worktrees/omniagent-plus-<branch>`.
- The append-only JSONL backend is the approved early-slice backend described by the source spec. It must prove atomic appends, cross-process reads, schema versioning, bounded payload enforcement, and recovery from interrupted writes before closeout can list `IF-0-STATELEDGER-3`.
- Do not persist API keys, OAuth tokens, bearer tokens, full env dumps, raw Omnigent payloads, or unbounded transcripts. Secret-bearing inputs should fail before any ledger write.
- `SL-4` is the terminal replay, docs, and phase reducer and depends on every producer lane. It records `no_doc_delta` for `CHANGELOG`, release notes, and external release evidence surfaces because STATELEDGER does not dispatch a tag or workflow; a post-dispatch evidence reducer is not applicable in this non-dispatch phase.
- Any defect discovered by `SL-4` verification must be repaired in the producing lane before closeout lists `IF-0-STATELEDGER-3`.

## Acceptance Criteria

- [ ] `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm lint`, `pnpm typecheck`, and `pnpm test -- --run` pass from the repo root.
- [ ] `packages/core-contracts/src/state-ledger.test.ts` proves the durable record schemas cover sessions, turns, runtime events, route decisions, limit classifications, identity status, cooldowns, worktree leases, approvals, capability snapshots, and evidence refs.
- [ ] `packages/state-ledger/src/migrations.test.ts` and `packages/state-ledger/src/retention.test.ts` prove schema version handling, explicit migrations, bounded payload rejection, retention pruning, and interrupted-write recovery for the append-only store.
- [ ] `packages/state-ledger/src/audit-ledger.test.ts` proves persisted sessions, turns, runtime events, route decisions, limit classifications, identity status, approvals, capability snapshots, cooldowns, and leases can be written and queried through schema-versioned audit records.
- [ ] `packages/state-ledger/src/evidence-store.test.ts` proves secret-bearing values, raw transcripts, raw provider payloads, and full env dumps are rejected while bounded redacted evidence refs persist.
- [ ] `packages/state-ledger/src/cross-process.test.ts` proves two independent Node processes observe shared provider-family cooldown and worktree lease state without acquiring the same exclusive lease twice.
- [ ] `packages/state-ledger/src/replay.test.ts` proves route decisions and runtime history replay from the ledger without live Omnigent.
- [ ] `docs/durable-state.md`, `docs/architecture.md`, and `README.md` describe the durable backend, record coverage, retention/redaction posture, replay APIs, and non-dispatch release-surface decision.
- [ ] `git status --short -- package.json pnpm-lock.yaml packages/core-contracts packages/state-ledger fixtures/state-ledger docs/durable-state.md docs/architecture.md README.md` shows only STATELEDGER-owned paths before runner closeout.

## Verification

- automation.suite_command: `pnpm install --frozen-lockfile && pnpm build && pnpm lint && pnpm typecheck && pnpm test -- --run && find fixtures/state-ledger -name '*.json' -print | sort | xargs -r -n1 python3 -m json.tool >/dev/null && git diff --check && phase-loop validate-roadmap specs/phase-plans-v1.md`
- Lane checks: run the `verify` command from each lane after its implementation task.
- Whole-phase dirty-path check: `git status --short -- package.json pnpm-lock.yaml packages/core-contracts packages/state-ledger fixtures/state-ledger docs/durable-state.md docs/architecture.md README.md`
- Closeout gate: list `IF-0-STATELEDGER-3` in `produced_if_gates` only after the automation suite passes and the dirty-path check contains only active-plan owned files.
