---
phase_loop_plan_version: 1
phase: UI
roadmap: specs/phase-plans-v1.md
roadmap_sha256: cd559015ff6624aeb1ccbb8a708835c06a747d77d3c62c6a1894af1d8e21bb90
---

# UI: UI Read Model

## Context

`UI` is Phase 12 from `specs/phase-plans-v1.md`. The roadmap hash matches `cd559015ff6624aeb1ccbb8a708835c06a747d77d3c62c6a1894af1d8e21bb90`. Canonical `.phase-loop/` status at `2026-06-30T22:01:48Z` records `CONTRACT`, `BOOTCORE`, `STATELEDGER`, `TRANSPORT`, `LIMITS`, `IDENTITY`, `WORKTREE`, `HANDOFF`, `COORDINATOR`, `ADAPTERS`, and `CLI` complete, with `UI` unplanned. Live git status was clean on `main` at `25d9084572b5fa928be876d455d0a2f5caf760a8` before this plan write.

This plan treats `.phase-loop/` as the authoritative runner state. Legacy `.codex/phase-loop/` files are compatibility artifacts only and must not block or supersede canonical state.

This phase consumes `IF-0-STATELEDGER-3`, `IF-0-COORDINATOR-9`, and `IF-0-CLI-11`. It freezes a UI/control read-model layer backed by durable ledger replay, plus a documented API-ready local surface through the existing CLI. It does not build a marketing page, add account mutation UI, expose raw transcripts, expose provider payloads, or import Omnigent transport internals.

## Interface Freeze Gates

- [ ] IF-0-UI-12 - UI/control read models expose sessions, route decisions, approvals, cooldowns, and leases without Omnigent internals or secrets.
  - Required schema surface: `UiControlSnapshot`, `UiSessionSummary`, `UiSessionTreeNode`, `UiActiveTurnSummary`, `UiRouteDecisionSummary`, `UiApprovalSummary`, `UiCooldownSummary`, `UiWorktreeLeaseSummary`, `UiHandoffSummary`, and `UiLimitClassificationSummary` are exported from `@omniagent-plus/core-contracts` with schema-backed validation.
  - Required projection surface: state-ledger replay builds the snapshot from durable `AuditLedger` records, including sessions, parent/root session relationships, active turns, route decisions, approval requests/responses, provider cooldowns, worktree leases, handoff packet metadata, limit classifications, and metadata-only evidence refs.
  - Required redaction surface: UI-facing payloads contain bounded metadata and bounded evidence excerpts only, using existing redaction helpers for untrusted text, metadata paths, secret-like values, and raw provider payload detection.
  - Required local surface: `pnpm --filter @omniagent-plus/cli cli -- control snapshot --state-root <path> --json` returns the read model in the existing CLI envelope without writing records or requiring live Omnigent.
  - Required dependency proof: tests fail if UI read-model code imports `@omniagent-plus/omnigent-transport`, repo-local transport internals, ignored/private inputs, raw provider fixtures, or secret-bearing env/config payloads.

## Spec Closeout Plan

- schema: `spec_delta_closeout.v1`
- decision: `no_spec_delta`
- target surfaces: `packages/core-contracts/src/ui-read-model.ts`, `packages/state-ledger/src/replay.ts`, `packages/cli/src/commands/control.ts`, `README.md`, `docs/architecture.md`, `docs/ui-read-model.md`
- evidence paths: `packages/core-contracts/src/ui-read-model.test.ts`, `packages/state-ledger/src/replay.test.ts`, `packages/cli/src/control.test.ts`, `packages/cli/src/phase-verification.test.ts`, `fixtures/ui/`, `fixtures/cli/control/`, `.phase-loop/runs/<run>/verification.json`
- redaction posture: `metadata_only`
- downstream handling: none; `HARDEN` may consume `IF-0-UI-12` only after closeout records the produced gate and the automation suite passes.

## Lane Index & Dependencies

SL-0 — UI read-model schemas and public exports
  Depends on: (none)
  Blocks: SL-1, SL-2
  Parallel-safe: no

SL-1 — Durable projection replay and redaction tests
  Depends on: SL-0
  Blocks: SL-2
  Parallel-safe: yes

SL-2 — API-ready CLI control surface, docs, and phase verification reducer
  Depends on: SL-0, SL-1
  Blocks: (none)
  Parallel-safe: no

## Execution Policy

- work-unit defaults: work-unit=`lane_execute`, effort=`high`, unsupported=`inherit_default`, inherit-default=`true`
- SL-2: executor=`codex`, model=`gpt-5.5`, effort=`medium`, work-unit=`phase_reducer`, reason=`API-ready surface docs and phase verification reducer`

## Lanes

### SL-0 — UI read-model schemas and public exports

- **Scope**: Add the UI/control read-model contract types, schemas, fixtures, and public exports without coupling the contract package to runtime internals.
- **Owned files**: `packages/core-contracts/src/ui-read-model.ts`, `packages/core-contracts/src/ui-read-model.test.ts`, `packages/core-contracts/src/index.ts`, `fixtures/ui/read-models/*.json`
- **Interfaces provided**: `ui_read_model.contracts.v1`, `ui_control_snapshot.schema.v1`, `ui_session_tree.schema.v1`, `ui_redaction_contract.v1`
- **Interfaces consumed**: `IF-0-STATELEDGER-3` (pre-existing), `IF-0-COORDINATOR-9` (pre-existing), `AgentSession` (pre-existing), `TurnHandle` (pre-existing), `RouteDecision` (pre-existing), `RuntimeApprovalRequest` (pre-existing), `RuntimeApprovalResponse` (pre-existing), `LimitClassification` (pre-existing), `ProviderFamilyCooldown` (pre-existing), `WorktreeLease` (pre-existing), `RuntimeEvidenceRef` (pre-existing), `redactedTextSchema` (pre-existing), `runtimeEvidenceRefSchema` (pre-existing)
- **Parallel-safe**: no

| Task ID | Type | Depends on | Files in scope | Tests owned | Test command |
| --- | --- | --- | --- | --- | --- |
| SL-0-T1 | test | (none) | UI read-model schemas, public exports, and fixture JSON | read-model schema validation, export shape, and no-secret fixture tests | `test ! -e packages/core-contracts/src/ui-read-model.ts || pnpm --filter @omniagent-plus/core-contracts test -- --run packages/core-contracts/src/ui-read-model.test.ts` |
| SL-0-T2 | impl | SL-0-T1 | UI read-model source, tests, exports, and fixtures | n/a | n/a |
| SL-0-T3 | verify | SL-0-T2 | UI read-model source/tests/fixtures | read-model schema validation, export shape, and no-secret fixture tests | `pnpm --filter @omniagent-plus/core-contracts test -- --run packages/core-contracts/src/ui-read-model.test.ts && pnpm --filter @omniagent-plus/core-contracts typecheck && find fixtures/ui/read-models -name '*.json' -print | sort | xargs -r -n1 python3 -m json.tool >/dev/null` |

### SL-1 — Durable projection replay and redaction tests

- **Scope**: Extend durable replay with a UI/control snapshot projection that summarizes state-ledger records and proves all evidence exposed to UI surfaces is metadata-only and bounded.
- **Owned files**: `packages/state-ledger/src/replay.ts`, `packages/state-ledger/src/replay.test.ts`, `packages/state-ledger/src/index.ts`, `fixtures/ui/projections/*.json`
- **Interfaces provided**: `state_ledger.ui_projection.v1`, `state_ledger.ui_redaction.v1`, `state_ledger.ui_session_tree.v1`
- **Interfaces consumed**: `ui_read_model.contracts.v1`, `ui_control_snapshot.schema.v1`, `ui_session_tree.schema.v1`, `ui_redaction_contract.v1`, `AuditLedger` (pre-existing), `replaySession` (pre-existing), `replayRouteDecisions` (pre-existing), `StateLedgerEntry` (pre-existing), `sanitizeMetadataPath` (pre-existing), `sanitizeMetadataText` (pre-existing), `redactUntrustedText` (pre-existing)
- **Parallel-safe**: yes

| Task ID | Type | Depends on | Files in scope | Tests owned | Test command |
| --- | --- | --- | --- | --- | --- |
| SL-1-T1 | test | SL-0-T3 | state-ledger replay projection tests and fixture JSON | UI projection, session tree, approval/cooldown/lease summaries, evidence refs, and redaction tests | `pnpm --filter @omniagent-plus/state-ledger test -- --run packages/state-ledger/src/replay.test.ts` |
| SL-1-T2 | impl | SL-1-T1 | durable replay projection implementation, exports, tests, and fixtures | n/a | n/a |
| SL-1-T3 | verify | SL-1-T2 | state-ledger UI projection source/tests/fixtures | UI projection, session tree, approval/cooldown/lease summaries, evidence refs, and redaction tests | `pnpm --filter @omniagent-plus/state-ledger test -- --run packages/state-ledger/src/replay.test.ts && pnpm --filter @omniagent-plus/state-ledger typecheck && find fixtures/ui/projections -name '*.json' -print | sort | xargs -r -n1 python3 -m json.tool >/dev/null` |

### SL-2 — API-ready CLI control surface, docs, and phase verification reducer

- **Scope**: Add the documented API-ready local control surface through the existing CLI, update docs, and run the terminal phase verification suite after the schema and projection lanes pass.
- **Owned files**: `packages/cli/src/types.ts`, `packages/cli/src/args.ts`, `packages/cli/src/command-registry.ts`, `packages/cli/src/commands/control.ts`, `packages/cli/src/control.test.ts`, `packages/cli/src/cli.test.ts`, `packages/cli/src/phase-verification.test.ts`, `fixtures/cli/control/*.json`, `fixtures/cli/e2e/commands.json`, `README.md`, `docs/architecture.md`, `docs/ui-read-model.md`
- **Interfaces provided**: `cli.control_snapshot_command.v1`, `ui.api_ready_surface.v1`, `ui.docs.v1`, `spec_delta_closeout.v1:no_spec_delta`, `automation.suite_command:ui-plan-verify`, `IF-0-UI-12`
- **Interfaces consumed**: `ui_read_model.contracts.v1`, `ui_control_snapshot.schema.v1`, `state_ledger.ui_projection.v1`, `state_ledger.ui_redaction.v1`, `state_ledger.ui_session_tree.v1`, `cli.command_runtime.v1` (pre-existing), `cli.output_envelope.v1` (pre-existing), `IF-0-CLI-11` (pre-existing)
- **Parallel-safe**: no

| Task ID | Type | Depends on | Files in scope | Tests owned | Test command |
| --- | --- | --- | --- | --- | --- |
| SL-2-T1 | test | SL-1-T3 | CLI control command tests, command registry/e2e tests, phase verification tests, and docs | control snapshot command, CLI envelope, no-write behavior, docs, no-internal-import, and phase verification tests | `test -f README.md && test -f docs/architecture.md && pnpm --filter @omniagent-plus/cli test -- --run packages/cli/src/control.test.ts packages/cli/src/cli.test.ts packages/cli/src/phase-verification.test.ts` |
| SL-2-T2 | impl | SL-2-T1 | CLI control command, parser/types/registry updates, fixtures, README, architecture docs, and UI read-model docs | n/a | n/a |
| SL-2-T3 | verify | SL-2-T2 | full UI owned surface | phase verification suite | `test -f README.md && test -f docs/architecture.md && test -f docs/ui-read-model.md && rg -n "IF-0-UI-12|control snapshot|UiControlSnapshot|sessions|route decisions|approvals|cooldowns|leases|handoff|limit classifications|metadata_only|no raw transcripts|no provider payloads" README.md docs/architecture.md docs/ui-read-model.md packages/core-contracts/src packages/state-ledger/src packages/cli/src && pnpm install --frozen-lockfile && pnpm --filter @omniagent-plus/cli cli -- control snapshot --json && pnpm --filter @omniagent-plus/core-contracts test -- --run packages/core-contracts/src/ui-read-model.test.ts && pnpm --filter @omniagent-plus/state-ledger test -- --run packages/state-ledger/src/replay.test.ts && pnpm --filter @omniagent-plus/cli test -- --run packages/cli/src/control.test.ts packages/cli/src/cli.test.ts packages/cli/src/phase-verification.test.ts && pnpm build && pnpm lint && pnpm typecheck && pnpm test -- --run packages/core-contracts/src packages/state-ledger/src packages/cli/src && find fixtures/ui fixtures/cli/control -name '*.json' -print | sort | xargs -r -n1 python3 -m json.tool >/dev/null && git diff --check && phase-loop validate-roadmap specs/phase-plans-v1.md` |

## Execution Notes

- Treat `.phase-loop/` as the authoritative runner state. Legacy `.codex/phase-loop/` files are compatibility artifacts only and must not block or supersede canonical `.phase-loop/` state.
- If execution creates worktrees and `/mnt/workspace` exists, place every worktree under `/mnt/workspace/worktrees/omniagent-plus-<branch>`.
- This phase deliberately chooses the roadmap's documented API-ready surface option rather than a visual local UI. Do not add a marketing page, browser app shell, account mutation controls, or new live Omnigent dependency.
- The UI/control snapshot must be read-only. It may open the selected `--state-root` and read durable ledger records, but it must not append records, clean worktrees, preflight identities, route tasks, classify new limits, launch providers, or look up credentials.
- UI-facing payloads may include record IDs, timestamps, states, provider/harness labels, route reasons, approval states, cooldown reset metadata, lease IDs, repo-relative paths, handoff packet metadata, and bounded evidence refs. They must not include raw transcripts, raw provider payloads, full env values, API keys, OAuth tokens, bearer tokens, private keys, secret refs, or unbounded evidence text.
- `packages/omnigent-transport/src/**`, ignored/private inputs, raw evidence sources, and credential-bearing files are read-only and out of scope. If existing public contracts cannot produce a required UI field without those inputs, stop for a `contract_bug` repair instead of importing internals.
- `SL-2` is the terminal CLI surface, documentation, and phase reducer and depends on every producer lane. It records `no_spec_delta` for roadmap/spec surfaces and does not dispatch a tag or workflow; a post-dispatch evidence reducer is not applicable in this non-dispatch phase.
- Any defect discovered by `SL-2` verification must be repaired in the producing lane before closeout lists `IF-0-UI-12`.

## Acceptance Criteria

- [ ] `@omniagent-plus/core-contracts` exports schema-backed UI read-model types for sessions, session tree nodes, active turns, route decisions, approvals, cooldowns, worktree leases, handoff metadata, limit classifications, and evidence refs.
- [ ] `packages/state-ledger/src/replay.ts` can build a `UiControlSnapshot` from durable `AuditLedger` records without live Omnigent, hidden credential lookup, or transport internals.
- [ ] `packages/state-ledger/src/replay.test.ts` covers provider lane status, session tree, active turns, cooldowns, worktree leases, handoff packets, approval requests/responses, route decisions, and limit classifications.
- [ ] `packages/core-contracts/src/ui-read-model.test.ts` and `packages/state-ledger/src/replay.test.ts` prove UI-facing payloads reject or redact secret-like values, absolute secret paths, raw provider payloads, env dumps, raw transcripts, and over-limit evidence excerpts.
- [ ] `pnpm --filter @omniagent-plus/cli cli -- control snapshot --state-root <path> --json` returns the snapshot in the existing CLI envelope and has deterministic human output derived from the same redacted result.
- [ ] `packages/cli/src/control.test.ts` proves the control snapshot command is read-only and does not append ledger records or invoke identity preflight, worktree cleanup, route-task, classify-limit record mode, provider launch, or credential lookup.
- [ ] Phase verification tests prove no UI-owned source imports `@omniagent-plus/omnigent-transport`, `packages/omnigent-transport`, `.phase-loop/` runtime state, ignored/private inputs, raw evidence files, or secret-bearing config.
- [ ] `README.md`, `docs/architecture.md`, and `docs/ui-read-model.md` document the API-ready surface, state-root behavior, JSON/human output posture, redaction posture, non-goals, and non-dispatch spec-closeout decision.
- [ ] `git status --short -- packages/core-contracts/src/ui-read-model.ts packages/core-contracts/src/ui-read-model.test.ts packages/core-contracts/src/index.ts packages/state-ledger/src/replay.ts packages/state-ledger/src/replay.test.ts packages/state-ledger/src/index.ts packages/cli/src/types.ts packages/cli/src/args.ts packages/cli/src/command-registry.ts packages/cli/src/commands/control.ts packages/cli/src/control.test.ts packages/cli/src/cli.test.ts packages/cli/src/phase-verification.test.ts fixtures/ui fixtures/cli/control fixtures/cli/e2e/commands.json README.md docs/architecture.md docs/ui-read-model.md` shows only UI-owned paths before runner closeout.

## Verification

- automation.suite_command: `pnpm install --frozen-lockfile && pnpm --filter @omniagent-plus/cli cli -- control snapshot --json && pnpm --filter @omniagent-plus/core-contracts test -- --run packages/core-contracts/src/ui-read-model.test.ts && pnpm --filter @omniagent-plus/state-ledger test -- --run packages/state-ledger/src/replay.test.ts && pnpm --filter @omniagent-plus/cli test -- --run packages/cli/src/control.test.ts packages/cli/src/cli.test.ts packages/cli/src/phase-verification.test.ts && pnpm build && pnpm lint && pnpm typecheck && pnpm test -- --run packages/core-contracts/src packages/state-ledger/src packages/cli/src && find fixtures/ui fixtures/cli/control -name '*.json' -print | sort | xargs -r -n1 python3 -m json.tool >/dev/null && git diff --check && phase-loop validate-roadmap specs/phase-plans-v1.md`
- Lane checks: run the `verify` command from each lane after its implementation task.
- Whole-phase dirty-path check: `git status --short -- packages/core-contracts/src/ui-read-model.ts packages/core-contracts/src/ui-read-model.test.ts packages/core-contracts/src/index.ts packages/state-ledger/src/replay.ts packages/state-ledger/src/replay.test.ts packages/state-ledger/src/index.ts packages/cli/src/types.ts packages/cli/src/args.ts packages/cli/src/command-registry.ts packages/cli/src/commands/control.ts packages/cli/src/control.test.ts packages/cli/src/cli.test.ts packages/cli/src/phase-verification.test.ts fixtures/ui fixtures/cli/control fixtures/cli/e2e/commands.json README.md docs/architecture.md docs/ui-read-model.md`
- Closeout gate: list `IF-0-UI-12` in `produced_if_gates` only after the automation suite passes and the dirty-path check contains only active-plan owned files.
