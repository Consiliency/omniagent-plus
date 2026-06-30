---
phase_loop_plan_version: 1
phase: CLI
roadmap: specs/phase-plans-v1.md
roadmap_sha256: cd559015ff6624aeb1ccbb8a708835c06a747d77d3c62c6a1894af1d8e21bb90
---

# CLI: Operator CLI

## Context

`CLI` is Phase 11 from `specs/phase-plans-v1.md`. The roadmap hash matches `cd559015ff6624aeb1ccbb8a708835c06a747d77d3c62c6a1894af1d8e21bb90`. Live git status was clean on `main` at `4c2ad358bf3199946d47203a764a11987062db23` before this plan write.

Canonical `.phase-loop/events.jsonl` is newer than `.phase-loop/state.json` and `.phase-loop/tui-handoff.md`: the ledger records `ADAPTERS` complete at commit `4c2ad358bf3199946d47203a764a11987062db23`, while the summary files still describe the earlier planned ADAPTERS state. This plan reconciles from the canonical event ledger plus live git topology, treats `.phase-loop/` as authoritative runner state, and treats legacy `.codex/phase-loop/` files as compatibility artifacts only.

This phase consumes `IF-0-STATELEDGER-3`, `IF-0-LIMITS-5`, `IF-0-IDENTITY-6`, `IF-0-WORKTREE-7`, and `IF-0-COORDINATOR-9`. It adds a local TypeScript operator CLI package that wraps public provider contracts, durable ledger state, identity status/preflight helpers, worktree lease state, limit classification, and route planning. The CLI command entrypoint for this phase is `pnpm --filter @omniagent-plus/cli cli -- <command>`; release packaging or global installation is not part of this phase.

## Interface Freeze Gates

- [ ] IF-0-CLI-11 - Operator CLI commands read/write durable state, return machine-readable JSON, and never expose secrets.
  - Required command surface: `health`, `sessions list`, `sessions show`, `route-task`, `classify-limit`, `identities list`, `identities preflight`, `worktrees list`, and `worktrees cleanup` are registered under one local CLI entrypoint with stable argument parsing and typed command results.
  - Required JSON surface: every command supports `--json`, returns a schema-backed envelope with `schema`, `ok`, `command`, `stateRoot`, `result` or `error`, and never emits raw provider payloads, secret refs, full env values, bearer tokens, OAuth tokens, API keys, or unbounded transcripts.
  - Required human output surface: non-JSON output is readable, deterministic enough for tests, and redacts the same fields as JSON output.
  - Required durable-state proof: session, identity, worktree, classify-limit record mode, and route-task record mode use the state ledger under the selected `--state-root`, so repeated CLI invocations share the same durable backend.
  - Required exit-code proof: nonzero exits map to typed categories for argument errors, missing records, validation failures, policy blocks, cleanup blocks, route blocks, and unexpected internal failures without printing secret-bearing diagnostics.
  - Required dry-run proof: `classify-limit` and `route-task` default to no backend launch and no hidden credential lookup; they may persist only explicit metadata-only classification or route-decision records through documented flags.

## Spec Closeout Plan

- schema: `spec_delta_closeout.v1`
- decision: `no_spec_delta`
- target surfaces: `packages/cli/`, `README.md`, `docs/architecture.md`
- evidence paths: `packages/cli/src/**/*.test.ts`, `fixtures/cli/`, `.phase-loop/runs/<run>/verification.json`
- redaction posture: `metadata_only`
- downstream handling: none; downstream phases may consume `IF-0-CLI-11` only after the closeout records the produced gate and the automation suite passes.

## Lane Index & Dependencies

SL-0 — CLI package runtime, output contracts, and health command
  Depends on: (none)
  Blocks: SL-1, SL-2, SL-3
  Parallel-safe: no

SL-1 — Durable session, identity, and worktree commands
  Depends on: SL-0
  Blocks: SL-3
  Parallel-safe: yes

SL-2 — Limit classification and route-task dry-run commands
  Depends on: SL-0
  Blocks: SL-3
  Parallel-safe: yes

SL-3 — Command registry, executable script, docs, and phase verification reducer
  Depends on: SL-0, SL-1, SL-2
  Blocks: (none)
  Parallel-safe: no

## Execution Policy

- work-unit defaults: work-unit=`lane_execute`, effort=`high`, unsupported=`inherit_default`, inherit-default=`true`
- SL-3: executor=`codex`, model=`gpt-5.5`, effort=`medium`, work-unit=`phase_reducer`, reason=`CLI registry docs and phase verification reducer`

## Lanes

### SL-0 — CLI package runtime, output contracts, and health command

- **Scope**: Add the CLI package boundary, command runtime primitives, schema-backed output/error contracts, argument parsing, and the read-only `health` command.
- **Owned files**: `pnpm-lock.yaml`, `packages/cli/package.json`, `packages/cli/tsconfig.json`, `packages/cli/src/types.ts`, `packages/cli/src/output.ts`, `packages/cli/src/errors.ts`, `packages/cli/src/args.ts`, `packages/cli/src/runtime.ts`, `packages/cli/src/commands/health.ts`, `packages/cli/src/output.test.ts`, `packages/cli/src/args.test.ts`, `packages/cli/src/health.test.ts`, `fixtures/cli/health/*.json`
- **Interfaces provided**: `cli.package.v1`, `cli.command_runtime.v1`, `cli.output_envelope.v1`, `cli.error_contract.v1`, `cli.argument_contract.v1`, `cli.health_command.v1`
- **Interfaces consumed**: `RuntimeFailure` (pre-existing), `redactUntrustedText` (pre-existing), `redactConfigValue` (pre-existing), `getStateLedgerPaths` (pre-existing), `IF-0-STATELEDGER-3` (pre-existing)
- **Parallel-safe**: no

| Task ID | Type | Depends on | Files in scope | Tests owned | Test command |
| --- | --- | --- | --- | --- | --- |
| SL-0-T1 | test | (none) | CLI package metadata, runtime/output/error/argument tests, health command test, and health fixture JSON | output envelope, error mapping, argument parsing, and health command tests | `test ! -e packages/cli/package.json || pnpm --filter @omniagent-plus/cli test -- --run packages/cli/src/output.test.ts packages/cli/src/args.test.ts packages/cli/src/health.test.ts` |
| SL-0-T2 | impl | SL-0-T1 | package manifest, lockfile, tsconfig, runtime/output/error/argument modules, health command, tests, and fixtures | n/a | n/a |
| SL-0-T3 | verify | SL-0-T2 | CLI package runtime/output/error/argument modules and health command | output envelope, error mapping, argument parsing, and health command tests | `pnpm install --frozen-lockfile && pnpm --filter @omniagent-plus/cli test -- --run packages/cli/src/output.test.ts packages/cli/src/args.test.ts packages/cli/src/health.test.ts && find fixtures/cli/health -name '*.json' -print | sort | xargs -r -n1 python3 -m json.tool >/dev/null` |

### SL-1 — Durable session, identity, and worktree commands

- **Scope**: Implement state-backed session inspection, identity listing/preflight, and worktree lease list/cleanup commands without hidden credential lookup.
- **Owned files**: `packages/cli/src/commands/sessions.ts`, `packages/cli/src/commands/identities.ts`, `packages/cli/src/commands/worktrees.ts`, `packages/cli/src/sessions.test.ts`, `packages/cli/src/identities.test.ts`, `packages/cli/src/worktrees.test.ts`, `fixtures/cli/sessions/*.json`, `fixtures/cli/identities/*.json`, `fixtures/cli/worktrees/*.json`
- **Interfaces provided**: `cli.sessions_command.v1`, `cli.identities_command.v1`, `cli.worktrees_command.v1`, `cli.durable_state_command.v1`
- **Interfaces consumed**: `cli.command_runtime.v1`, `cli.output_envelope.v1`, `cli.error_contract.v1`, `IF-0-STATELEDGER-3` (pre-existing), `IF-0-IDENTITY-6` (pre-existing), `IF-0-WORKTREE-7` (pre-existing), `AuditLedger` (pre-existing), `replaySession` (pre-existing), `replayRouteDecisions` (pre-existing), `IdentityProfileStatusStore` (pre-existing), `listIdentityProfiles` (pre-existing), `preflightIdentityProfile` (pre-existing), `WorktreeLeaseManager` (pre-existing), `cleanupLeasedWorktree` (pre-existing), `inspectWorktreeDirtyState` (pre-existing)
- **Parallel-safe**: yes

| Task ID | Type | Depends on | Files in scope | Tests owned | Test command |
| --- | --- | --- | --- | --- | --- |
| SL-1-T1 | test | SL-0-T3 | session command tests, identity command tests, worktree command tests, and fixture JSON | session list/show, identity list/preflight, worktree list/cleanup tests | `pnpm --filter @omniagent-plus/cli test -- --run packages/cli/src/sessions.test.ts packages/cli/src/identities.test.ts packages/cli/src/worktrees.test.ts` |
| SL-1-T2 | impl | SL-1-T1 | state-backed session, identity, and worktree command modules, tests, and fixtures | n/a | n/a |
| SL-1-T3 | verify | SL-1-T2 | state-backed session, identity, and worktree command modules/tests/fixtures | session list/show, identity list/preflight, worktree list/cleanup tests | `pnpm --filter @omniagent-plus/cli test -- --run packages/cli/src/sessions.test.ts packages/cli/src/identities.test.ts packages/cli/src/worktrees.test.ts && find fixtures/cli/sessions fixtures/cli/identities fixtures/cli/worktrees -name '*.json' -print | sort | xargs -r -n1 python3 -m json.tool >/dev/null` |

### SL-2 — Limit classification and route-task dry-run commands

- **Scope**: Implement metadata-only limit classification and route-task dry-run commands that consume durable state and persist records only through explicit flags.
- **Owned files**: `packages/cli/src/commands/classify-limit.ts`, `packages/cli/src/commands/route-task.ts`, `packages/cli/src/classify-limit.test.ts`, `packages/cli/src/route-task.test.ts`, `fixtures/cli/classify-limit/*.json`, `fixtures/cli/route-task/*.json`
- **Interfaces provided**: `cli.classify_limit_command.v1`, `cli.route_task_command.v1`, `cli.record_mode.v1`
- **Interfaces consumed**: `cli.command_runtime.v1`, `cli.output_envelope.v1`, `cli.error_contract.v1`, `IF-0-LIMITS-5` (pre-existing), `IF-0-COORDINATOR-9` (pre-existing), `classifyLimitSignal` (pre-existing), `buildIdentityPool` (pre-existing), `planRoute` (pre-existing), `persistRouteDecision` (pre-existing), `AuditLedger.appendLimitClassification` (pre-existing), `LimitClassification` (pre-existing), `RouteDecision` (pre-existing)
- **Parallel-safe**: yes

| Task ID | Type | Depends on | Files in scope | Tests owned | Test command |
| --- | --- | --- | --- | --- | --- |
| SL-2-T1 | test | SL-0-T3 | classify-limit tests, route-task tests, and fixture JSON | limit classification, record mode, route-task dry-run, route decision, and no-provider-launch tests | `pnpm --filter @omniagent-plus/cli test -- --run packages/cli/src/classify-limit.test.ts packages/cli/src/route-task.test.ts` |
| SL-2-T2 | impl | SL-2-T1 | classify-limit and route-task command modules, tests, and fixtures | n/a | n/a |
| SL-2-T3 | verify | SL-2-T2 | classify-limit and route-task command modules/tests/fixtures | limit classification, record mode, route-task dry-run, route decision, and no-provider-launch tests | `pnpm --filter @omniagent-plus/cli test -- --run packages/cli/src/classify-limit.test.ts packages/cli/src/route-task.test.ts && find fixtures/cli/classify-limit fixtures/cli/route-task -name '*.json' -print | sort | xargs -r -n1 python3 -m json.tool >/dev/null` |

### SL-3 — Command registry, executable script, docs, and phase verification reducer

- **Scope**: Wire all command modules into the local operator entrypoint, add end-to-end CLI tests, update operator docs, and run the terminal phase verification suite.
- **Owned files**: `packages/cli/src/command-registry.ts`, `packages/cli/src/bin.ts`, `packages/cli/src/index.ts`, `packages/cli/src/cli.test.ts`, `packages/cli/src/phase-verification.test.ts`, `fixtures/cli/e2e/*.json`, `README.md`, `docs/architecture.md`
- **Interfaces provided**: `cli.command_registry.v1`, `cli.local_entrypoint.v1`, `cli.docs.v1`, `spec_delta_closeout.v1:no_spec_delta`, `no_doc_delta:release-surfaces`, `automation.suite_command:cli-plan-verify`, `IF-0-CLI-11`
- **Interfaces consumed**: `cli.package.v1`, `cli.command_runtime.v1`, `cli.output_envelope.v1`, `cli.error_contract.v1`, `cli.argument_contract.v1`, `cli.health_command.v1`, `cli.sessions_command.v1`, `cli.identities_command.v1`, `cli.worktrees_command.v1`, `cli.classify_limit_command.v1`, `cli.route_task_command.v1`, `cli.record_mode.v1`
- **Parallel-safe**: no

| Task ID | Type | Depends on | Files in scope | Tests owned | Test command |
| --- | --- | --- | --- | --- | --- |
| SL-3-T1 | test | SL-1-T3, SL-2-T3 | command registry, local entrypoint, e2e CLI tests, phase verification test, README, architecture docs, and fixture JSON | local entrypoint, command registry, JSON/human output, exit-code, docs, and phase verification tests | `test -f README.md && test -f docs/architecture.md && pnpm --filter @omniagent-plus/cli test -- --run packages/cli/src/cli.test.ts packages/cli/src/phase-verification.test.ts` |
| SL-3-T2 | impl | SL-3-T1 | command registry, executable script, public exports, e2e tests, phase verification test, README, architecture docs, and fixtures | n/a | n/a |
| SL-3-T3 | verify | SL-3-T2 | full CLI owned surface | phase verification suite | `test -f README.md && test -f docs/architecture.md && rg -n "IF-0-CLI-11|--json|health|sessions list|sessions show|route-task|classify-limit|identities list|identities preflight|worktrees list|worktrees cleanup|metadata_only|state-root|exit code" README.md docs/architecture.md packages/cli/src && pnpm install --frozen-lockfile && pnpm --filter @omniagent-plus/cli cli -- health --json && pnpm --filter @omniagent-plus/cli test -- --run packages/cli/src && pnpm --filter @omniagent-plus/cli typecheck && pnpm build && pnpm lint && pnpm typecheck && find fixtures/cli -name '*.json' -print | sort | xargs -r -n1 python3 -m json.tool >/dev/null && git diff --check && phase-loop validate-roadmap specs/phase-plans-v1.md` |

## Execution Notes

- Treat `.phase-loop/` as the authoritative runner state. Legacy `.codex/phase-loop/` files are compatibility artifacts only and must not block or supersede canonical `.phase-loop/` state.
- If execution creates worktrees and `/mnt/workspace` exists, place every created worktree under `/mnt/workspace/worktrees/omniagent-plus-<branch>`.
- The CLI state root must be explicit and testable. Commands should accept `--state-root <path>` and default to a repo-local durable state directory only when the caller does not provide one.
- `packages/state-ledger/src/**`, `packages/rate-limit-catalog/src/**`, `packages/identity-isolation/src/**`, `packages/worktree-leasing/src/**`, `packages/coordinator/src/**`, and their fixtures are read-only contract inputs for this phase. If execution discovers the public APIs cannot support a required command, stop for a `contract_bug` repair instead of changing upstream gates silently.
- `classify-limit` and `route-task` must default to dry-run behavior. They may write durable metadata-only records only when an explicit flag requests record mode; neither command may launch a provider, read hidden credentials, or treat same-provider account switching as quota bypass.
- Human-readable output must be derived from the same redacted command result used for `--json`; do not build a separate path that can leak env values, secret refs, provider payloads, raw transcripts, or full local paths marked secret-like by existing redaction helpers.
- `SL-3` is the terminal registry, documentation, and phase reducer and depends on every producer lane. It records `no_doc_delta` for changelog, release notes, and external release evidence surfaces because CLI does not dispatch a tag or workflow; a post-dispatch evidence reducer is not applicable in this non-dispatch phase.
- Any defect discovered by `SL-3` verification must be repaired in the producing lane before closeout lists `IF-0-CLI-11`.

## Acceptance Criteria

- [ ] `packages/cli/package.json` defines a local `cli` script for `pnpm --filter @omniagent-plus/cli cli -- <command>` and declares only the dependencies required for public provider contracts, durable state, command execution, and schema-backed output.
- [ ] `health`, `sessions list`, `sessions show`, `route-task`, `classify-limit`, `identities list`, `identities preflight`, `worktrees list`, and `worktrees cleanup` are registered and covered by tests.
- [ ] Every command supports `--json` and returns a schema-backed envelope with stable success and error shapes.
- [ ] `packages/cli/src/cli.test.ts` and `packages/cli/src/phase-verification.test.ts` prove human-readable output is deterministic enough for tests and redacts secrets, secret refs, raw provider payloads, full env values, and unbounded transcripts.
- [ ] `packages/cli/src/errors.ts`, `packages/cli/src/cli.test.ts`, and `packages/cli/src/phase-verification.test.ts` prove nonzero exit codes map to typed failure categories for bad arguments, validation failures, missing records, policy blocks, route blocks, cleanup blocks, and unexpected internal failures.
- [ ] Repeated invocations that share `--state-root` observe persisted sessions, route decisions, identity statuses, worktree leases, and explicit record-mode classification or route-task outputs.
- [ ] `classify-limit` and `route-task` default to dry-run/no-launch behavior and write durable metadata-only records only through explicit record-mode flags.
- [ ] `README.md` and `docs/architecture.md` document the local CLI entrypoint, command list, state-root behavior, JSON/human output posture, redaction posture, exit-code categories, and non-dispatch release-surface decision.
- [ ] `git status --short -- pnpm-lock.yaml packages/cli fixtures/cli README.md docs/architecture.md` shows only CLI-owned paths before runner closeout.

## Verification

- automation.suite_command: `pnpm install --frozen-lockfile && pnpm --filter @omniagent-plus/cli cli -- health --json && pnpm --filter @omniagent-plus/cli test -- --run packages/cli/src && pnpm build && pnpm lint && pnpm typecheck && find fixtures/cli -name '*.json' -print | sort | xargs -r -n1 python3 -m json.tool >/dev/null && git diff --check && phase-loop validate-roadmap specs/phase-plans-v1.md`
- Lane checks: run the `verify` command from each lane after its implementation task.
- Whole-phase dirty-path check: `git status --short -- pnpm-lock.yaml packages/cli fixtures/cli README.md docs/architecture.md`
- Closeout gate: list `IF-0-CLI-11` in `produced_if_gates` only after the automation suite passes and the dirty-path check contains only active-plan owned files.
