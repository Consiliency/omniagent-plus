---
phase_loop_plan_version: 1
phase: HARDEN
roadmap: specs/phase-plans-v1.md
roadmap_sha256: cd559015ff6624aeb1ccbb8a708835c06a747d77d3c62c6a1894af1d8e21bb90
---

# HARDEN: Hardening And Readiness

## Context

`HARDEN` is Phase 13 from `specs/phase-plans-v1.md`. The roadmap hash matches `cd559015ff6624aeb1ccbb8a708835c06a747d77d3c62c6a1894af1d8e21bb90`. Canonical `.phase-loop/` status at `2026-06-30T22:48:29Z` records `CONTRACT`, `BOOTCORE`, `STATELEDGER`, `TRANSPORT`, `LIMITS`, `IDENTITY`, `WORKTREE`, `HANDOFF`, `COORDINATOR`, `ADAPTERS`, `CLI`, and `UI` complete, with `HARDEN` unplanned. Live git status was clean on `main` at `b3ae50ec8fb104ed421a6a1aa2b559c763c21763` before this plan write.

This plan treats `.phase-loop/` as the authoritative runner state. Legacy `.codex/phase-loop/` files are compatibility artifacts only and must not block or supersede canonical state.

This phase consumes every upstream interface gate, especially `IF-0-ADAPTERS-10`, `IF-0-CLI-11`, and `IF-0-UI-12`. It is the final evidence reducer: it proves the implemented surface is resilient, opt-in live Omnigent behavior is documented and gated, and public-facing readiness docs do not claim production or commercialization maturity beyond the tested alpha surface. It must not add new product features, require live credentials in default CI, or claim multi-user SaaS readiness.

## Interface Freeze Gates

- [ ] IF-0-HARDEN-13 - End-to-end hardening proves crash recovery, retry-storm prevention, real Omnigent opt-in behavior, security posture, and release readiness.
  - Required reliability surface: chaos and recovery tests cover coordinator retry-storm termination with jitter/cooldown, Omnigent process cleanup on parent crash or heartbeat timeout, state-ledger replay after interrupted writes, and worktree stale-lock recovery with fencing-token and dirty-state checks.
  - Required live-smoke surface: optional live Omnigent tests are skipped by default, gated by explicit env vars, record metadata-only evidence, and never require credentials or provider accounts for `pnpm test` or CI.
  - Required security surface: docs and tests cover secrets, identity isolation, prompt injection, tool approvals, data retention, provider terms, subscription/account use, raw transcript handling, and release-readiness limits.
  - Required readiness surface: `README.md` and readiness docs describe an alpha/local operator surface only, with no production, public-beta, multi-user SaaS, or commercialization readiness overclaim.
  - Required closeout proof: the full workspace gate passes, the dirty-path check contains only active-plan owned files, and `IF-0-HARDEN-13` is listed in closeout only after all reliability, live-smoke, security, docs, and release-readiness evidence is complete.

## Spec Closeout Plan

- schema: `spec_delta_closeout.v1`
- decision: `no_spec_delta`
- target surfaces: `docs/security-and-secrets.md`, `docs/commercialization-checklist.md`, `README.md`, `docs/hardening-readiness.md`, `docs/omnigent-live-smoke.md`
- evidence paths: `packages/coordinator/src/hardening-recovery.test.ts`, `packages/omnigent-transport/src/hardening-recovery.test.ts`, `packages/worktree-leasing/src/hardening-recovery.test.ts`, `packages/state-ledger/src/hardening-replay.test.ts`, `packages/omnigent-transport/src/live-omnigent-smoke.test.ts`, `packages/cli/src/hardening-readiness.test.ts`, `fixtures/hardening/`, `.phase-loop/runs/<run>/verification.json`
- redaction posture: `metadata_only`
- downstream handling: none; `HARDEN` is the terminal roadmap phase and may list `IF-0-HARDEN-13` only after closeout evidence proves the full gate.

## Lane Index & Dependencies

SL-0 — Reliability, crash recovery, and retry-storm evidence
  Depends on: (none)
  Blocks: SL-1, SL-2
  Parallel-safe: no

SL-1 — Optional live Omnigent smoke gate and metadata evidence
  Depends on: SL-0
  Blocks: SL-2
  Parallel-safe: yes

SL-2 — Security, commercialization readiness, docs, and phase reducer
  Depends on: SL-0, SL-1
  Blocks: (none)
  Parallel-safe: no

## Execution Policy

- work-unit defaults: work-unit=`lane_execute`, effort=`high`, unsupported=`inherit_default`, inherit-default=`true`
- SL-2: executor=`codex`, model=`gpt-5.5`, effort=`high`, work-unit=`phase_reducer`, reason=`terminal hardening evidence and readiness reducer`

## Lanes

### SL-0 — Reliability, crash recovery, and retry-storm evidence

- **Scope**: Add final hardening tests and fixtures that prove the existing coordinator, transport process manager, state ledger, and worktree leasing surfaces recover safely from crash, retry, and stale-lock conditions.
- **Owned files**: `packages/coordinator/src/hardening-recovery.test.ts`, `packages/omnigent-transport/src/hardening-recovery.test.ts`, `packages/worktree-leasing/src/hardening-recovery.test.ts`, `packages/state-ledger/src/hardening-replay.test.ts`, `fixtures/hardening/recovery/*.json`
- **Interfaces provided**: `hardening.reliability_evidence.v1`, `hardening.retry_storm_guard.v1`, `hardening.crash_recovery.v1`, `hardening.worktree_recovery.v1`, `hardening.state_replay.v1`
- **Interfaces consumed**: `IF-0-STATELEDGER-3` (pre-existing), `IF-0-TRANSPORT-4` (pre-existing), `IF-0-LIMITS-5` (pre-existing), `IF-0-WORKTREE-7` (pre-existing), `IF-0-COORDINATOR-9` (pre-existing), `evaluateRetryGuardrails` (pre-existing), `OmnigentProcessManager` (pre-existing), `evaluateStaleLeaseRecovery` (pre-existing), `AuditLedger` (pre-existing), `replayTaskRouting` (pre-existing)
- **Parallel-safe**: no

| Task ID | Type | Depends on | Files in scope | Tests owned | Test command |
| --- | --- | --- | --- | --- | --- |
| SL-0-T1 | test | (none) | final hardening recovery tests and fixtures | retry-storm cutoff, jitter/cooldown evidence, parent-death process cleanup, heartbeat timeout cleanup, interrupted ledger replay, stale-lock recovery, dirty worktree refusal, and fencing-token checks | `test ! -e packages/coordinator/src/hardening-recovery.test.ts || pnpm test -- --run packages/coordinator/src/hardening-recovery.test.ts packages/omnigent-transport/src/hardening-recovery.test.ts packages/worktree-leasing/src/hardening-recovery.test.ts packages/state-ledger/src/hardening-replay.test.ts` |
| SL-0-T2 | impl | SL-0-T1 | hardening recovery tests and metadata-only fixtures | n/a | n/a |
| SL-0-T3 | verify | SL-0-T2 | reliability hardening tests and fixtures | retry-storm cutoff, process cleanup, ledger replay, and worktree stale recovery tests | `pnpm test -- --run packages/coordinator/src/hardening-recovery.test.ts packages/omnigent-transport/src/hardening-recovery.test.ts packages/worktree-leasing/src/hardening-recovery.test.ts packages/state-ledger/src/hardening-replay.test.ts && find fixtures/hardening/recovery -name '*.json' -print | sort | xargs -r -n1 python3 -m json.tool >/dev/null` |

### SL-1 — Optional live Omnigent smoke gate and metadata evidence

- **Scope**: Add the opt-in live Omnigent smoke contract, default-skip tests, metadata-only evidence fixtures, and operator documentation without making live Omnigent a CI or default local test dependency.
- **Owned files**: `packages/omnigent-transport/src/live-omnigent-smoke.test.ts`, `fixtures/hardening/live-omnigent/*.json`, `docs/omnigent-live-smoke.md`, `.env.example`
- **Interfaces provided**: `hardening.live_omnigent_smoke.v1`, `hardening.live_smoke_env_gate.v1`, `hardening.live_smoke_metadata_evidence.v1`
- **Interfaces consumed**: `IF-0-CONTRACT-1` (pre-existing), `IF-0-TRANSPORT-4` (pre-existing), `docs/omnigent-contract.md` (pre-existing), `omnigent_transport.contract_fixtures.v1` (pre-existing), `OmnigentProcessManager` (pre-existing)
- **Parallel-safe**: yes

| Task ID | Type | Depends on | Files in scope | Tests owned | Test command |
| --- | --- | --- | --- | --- | --- |
| SL-1-T1 | test | SL-0-T3 | live-smoke default-skip tests, env gate docs, `.env.example`, and metadata fixture JSON | default skip without env, explicit env-var gate, metadata-only evidence, no secret echo, and no provider credential requirement in default CI | `test -f docs/omnigent-live-smoke.md && test -f .env.example && pnpm test -- --run packages/omnigent-transport/src/live-omnigent-smoke.test.ts` |
| SL-1-T2 | impl | SL-1-T1 | optional live-smoke test, metadata fixtures, env example, and docs | n/a | n/a |
| SL-1-T3 | verify | SL-1-T2 | live-smoke test/docs/fixtures | live-smoke default skip and env-gate tests | `rg -n "OMNIAGENT_PLUS_LIVE_OMNIGENT|metadata_only|skip by default|no credentials|required" docs/omnigent-live-smoke.md .env.example packages/omnigent-transport/src/live-omnigent-smoke.test.ts && pnpm test -- --run packages/omnigent-transport/src/live-omnigent-smoke.test.ts && find fixtures/hardening/live-omnigent -name '*.json' -print | sort | xargs -r -n1 python3 -m json.tool >/dev/null` |

### SL-2 — Security, commercialization readiness, docs, and phase reducer

- **Scope**: Update final security and readiness documentation, add docs/readiness verification tests, and run the full terminal hardening gate after reliability and live-smoke evidence pass.
- **Owned files**: `docs/security-and-secrets.md`, `docs/commercialization-checklist.md`, `docs/hardening-readiness.md`, `README.md`, `packages/cli/src/hardening-readiness.test.ts`, `fixtures/hardening/readiness/*.json`
- **Interfaces provided**: `hardening.security_review.v1`, `hardening.release_readiness.v1`, `hardening.docs_no_overclaim.v1`, `spec_delta_closeout.v1:no_spec_delta`, `automation.suite_command:harden-plan-verify`, `IF-0-HARDEN-13`
- **Interfaces consumed**: `hardening.reliability_evidence.v1`, `hardening.retry_storm_guard.v1`, `hardening.crash_recovery.v1`, `hardening.worktree_recovery.v1`, `hardening.state_replay.v1`, `hardening.live_omnigent_smoke.v1`, `hardening.live_smoke_env_gate.v1`, `hardening.live_smoke_metadata_evidence.v1`, `IF-0-ADAPTERS-10` (pre-existing), `IF-0-CLI-11` (pre-existing), `IF-0-UI-12` (pre-existing)
- **Parallel-safe**: no

| Task ID | Type | Depends on | Files in scope | Tests owned | Test command |
| --- | --- | --- | --- | --- | --- |
| SL-2-T1 | test | SL-0-T3, SL-1-T3 | security/readiness docs, README, readiness fixtures, and terminal hardening test | security checklist, subscription/account-use wording, prompt injection/tool approval posture, data retention, provider terms, alpha-readiness limits, and no production/public-beta/commercialization overclaim tests | `test -f docs/security-and-secrets.md && test -f docs/commercialization-checklist.md && test -f docs/hardening-readiness.md && pnpm --filter @omniagent-plus/cli test -- --run packages/cli/src/hardening-readiness.test.ts` |
| SL-2-T2 | impl | SL-2-T1 | security docs, commercialization checklist, hardening readiness docs, README, readiness fixtures, and terminal test | n/a | n/a |
| SL-2-T3 | verify | SL-2-T2 | full HARDEN owned surface | terminal hardening verification suite | `rg -n "IF-0-HARDEN-13|metadata_only|alpha|not production|not public beta|not multi-user SaaS|secrets|identity isolation|prompt injection|tool approvals|data retention|provider terms|subscription|account use|retry storm|crash recovery|worktree locks|live Omnigent" README.md docs/security-and-secrets.md docs/commercialization-checklist.md docs/hardening-readiness.md docs/omnigent-live-smoke.md packages/cli/src/hardening-readiness.test.ts && pnpm install --frozen-lockfile && pnpm test -- --run packages/coordinator/src/hardening-recovery.test.ts packages/omnigent-transport/src/hardening-recovery.test.ts packages/worktree-leasing/src/hardening-recovery.test.ts packages/state-ledger/src/hardening-replay.test.ts packages/omnigent-transport/src/live-omnigent-smoke.test.ts packages/cli/src/hardening-readiness.test.ts && pnpm build && pnpm lint && pnpm typecheck && pnpm test && find fixtures/hardening -name '*.json' -print | sort | xargs -r -n1 python3 -m json.tool >/dev/null && git diff --check && phase-loop validate-roadmap specs/phase-plans-v1.md` |

## Execution Notes

- Treat `.phase-loop/` as the authoritative runner state. Legacy `.codex/phase-loop/` files are compatibility artifacts only and must not block or supersede canonical `.phase-loop/` state.
- If execution creates worktrees and `/mnt/workspace` exists, place every created worktree under `/mnt/workspace/worktrees/omniagent-plus-<branch>`.
- `HARDEN` is the final evidence reducer. Do not add new runtime product behavior, new command surfaces, new UI features, new adapter shapes, or release dispatch workflows in this phase.
- Default verification must not require live Omnigent, provider accounts, credentials, subscription tokens, or network access. Live Omnigent smoke tests must skip unless the operator explicitly sets the documented env gate.
- `.env.example` may list env var names and safe placeholder values only. It must not include real tokens, bearer values, local secret payloads, auth-volume contents, or account identifiers.
- Security and readiness docs may report metadata-only evidence and current limitations. They must not claim production readiness, public-beta readiness, multi-user SaaS readiness, revenue readiness, or quota-bypass behavior.
- `SL-2` is the terminal security, docs, and phase reducer and depends on every producer lane. It records `no_spec_delta` for roadmap/spec surfaces and does not dispatch a tag or workflow; a post-dispatch evidence reducer is not applicable in this non-dispatch phase.
- Any defect discovered by `SL-2` verification must be repaired in the producing lane before closeout lists `IF-0-HARDEN-13`.

## Acceptance Criteria

- [ ] Full workspace verification passes: `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `git diff --check`, and `phase-loop validate-roadmap specs/phase-plans-v1.md`.
- [ ] `packages/coordinator/src/hardening-recovery.test.ts` proves retry storms stop at configured max attempts with jitter/cooldown evidence and do not loop indefinitely across coordinator or rate-limit surfaces.
- [ ] `packages/omnigent-transport/src/hardening-recovery.test.ts` proves an orchestrator or parent-process crash does not leave owned Omnigent backend process groups unmanaged after heartbeat timeout or parent-death cleanup.
- [ ] `packages/worktree-leasing/src/hardening-recovery.test.ts` proves crashed-process locks recover only when process liveness, host, branch, dirty-state, expiration, ledger evidence, and fencing-token conditions permit recovery.
- [ ] `packages/state-ledger/src/hardening-replay.test.ts` proves interrupted writes or replay gaps fail closed without exposing raw provider payloads or accepting partial secret-bearing evidence.
- [ ] `packages/omnigent-transport/src/live-omnigent-smoke.test.ts`, `docs/omnigent-live-smoke.md`, and `.env.example` prove optional live Omnigent tests are skipped by default, require explicit documented env vars, record metadata-only evidence when enabled, and do not require live credentials for CI or default local verification.
- [ ] `docs/security-and-secrets.md`, `docs/commercialization-checklist.md`, `docs/hardening-readiness.md`, `docs/omnigent-live-smoke.md`, and `README.md` cover secrets, identity isolation, prompt injection, tool approvals, data retention, provider terms, subscription/account use, crash recovery, retry-storm prevention, worktree recovery, and live-test opt-in behavior.
- [ ] `packages/cli/src/hardening-readiness.test.ts` proves readiness docs avoid production, public-beta, multi-user SaaS, commercialization, and quota-bypass overclaims and clearly frame the current release as an alpha/local operator surface.
- [ ] `packages/cli/src/hardening-readiness.test.ts` proves the readiness docs and README contain required hardening evidence and reject forbidden overclaim language.
- [ ] `git status --short -- packages/coordinator/src/hardening-recovery.test.ts packages/omnigent-transport/src/hardening-recovery.test.ts packages/worktree-leasing/src/hardening-recovery.test.ts packages/state-ledger/src/hardening-replay.test.ts packages/omnigent-transport/src/live-omnigent-smoke.test.ts packages/cli/src/hardening-readiness.test.ts fixtures/hardening docs/security-and-secrets.md docs/commercialization-checklist.md docs/hardening-readiness.md docs/omnigent-live-smoke.md README.md .env.example` shows only HARDEN-owned paths before runner closeout.

## Verification

- automation.suite_command: `pnpm install --frozen-lockfile && pnpm build && pnpm lint && pnpm typecheck && pnpm test && find fixtures/hardening -name '*.json' -print | sort | xargs -r -n1 python3 -m json.tool >/dev/null && git diff --check && phase-loop validate-roadmap specs/phase-plans-v1.md`
- Lane checks: run the `verify` command from each lane after its implementation task.
- Whole-phase dirty-path check: `git status --short -- packages/coordinator/src/hardening-recovery.test.ts packages/omnigent-transport/src/hardening-recovery.test.ts packages/worktree-leasing/src/hardening-recovery.test.ts packages/state-ledger/src/hardening-replay.test.ts packages/omnigent-transport/src/live-omnigent-smoke.test.ts packages/cli/src/hardening-readiness.test.ts fixtures/hardening docs/security-and-secrets.md docs/commercialization-checklist.md docs/hardening-readiness.md docs/omnigent-live-smoke.md README.md .env.example`
- Closeout gate: list `IF-0-HARDEN-13` in `produced_if_gates` only after the automation suite passes and the dirty-path check contains only active-plan owned files.
