---
phase_loop_plan_version: 1
phase: LIMITS
roadmap: specs/phase-plans-v1.md
roadmap_sha256: cd559015ff6624aeb1ccbb8a708835c06a747d77d3c62c6a1894af1d8e21bb90
---

# LIMITS: Rate-Limit Catalog

## Context

`LIMITS` is Phase 5 from `specs/phase-plans-v1.md`. Canonical `.phase-loop/state.json` and `.phase-loop/tui-handoff.md` mark `CONTRACT`, `BOOTCORE`, `STATELEDGER`, and `TRANSPORT` complete at commit `68750e191f003409436ca46cf8efaff56a6e7e52`, with `LIMITS` as the current unplanned phase and a clean worktree. This plan treats `.phase-loop/` as the authoritative runner state; legacy `.codex/phase-loop/` files are compatibility artifacts only and do not block or supersede canonical state.

This phase consumes `IF-0-BOOTCORE-2` from `packages/core-contracts`, especially the frozen `LimitClassification`, `RuntimeFailure`, and routing-decision schemas. It adds a real `@omniagent-plus/rate-limit-catalog` package plus fixture corpus and taxonomy docs that classify provider and harness signals into typed routing inputs. It must not implement global scheduler policy, frame same-provider account switching as quota bypass, infer secret values from logs, or require live provider credentials.

## Interface Freeze Gates

- [ ] IF-0-LIMITS-5 - Rate-limit classifier fixtures and routing actions distinguish retryable limits, hard caps, auth/billing failures, policy blocks, outages, and unknown signals.
  - Required package surface: `@omniagent-plus/rate-limit-catalog` exports deterministic classifier APIs, fixture loading helpers, and routing-action mapping helpers that return `LimitClassification` objects from `@omniagent-plus/core-contracts` without exposing raw secret-bearing payloads.
  - Required classifier proof: regex, status/header, reset-time, retry-after, confidence, and unknown-capture rules distinguish burst limits, token limits, concurrency limits, fixed-window usage caps, monthly spend/quota caps, acceleration limits, transient overload, auth/billing problems, policy blocks, non-limit signals, and unknown signals.
  - Required fixture proof: the fixture corpus covers Claude Code, Codex, Gemini/Antigravity, OpenCode, Pi, OpenAI API, Anthropic API, Google/Gemini API, ZAI, MiniMax, and generic OpenAI-compatible APIs, with expected classifications checked in package tests.
  - Required negative proof: non-limit 429s, auth failures, policy blocks, provider outages, and malformed or low-confidence signals are not misclassified as quota or burst limits; unknown fixtures map to `unknown_limit` rather than success.
  - Required routing proof: hard usage caps are not treated as burst limits, retry-after/reset evidence is honored, retry-storm guardrails bound repeated attempts, and same-provider account switching maps only to `forbidden`, `manual_confirmation_required`, or `allowed_by_policy`.

## Spec Closeout Plan

- schema: `spec_delta_closeout.v1`
- decision: `no_spec_delta`
- target surfaces: `packages/rate-limit-catalog/`, `fixtures/rate-limits/`, `docs/rate-limit-taxonomy.md`
- evidence paths: `packages/rate-limit-catalog/src/**/*.test.ts`, `fixtures/rate-limits/`, `.phase-loop/runs/<run>/verification.json`
- redaction posture: `metadata_only`
- downstream handling: none; downstream phases may consume `IF-0-LIMITS-5` only after the closeout records the produced gate and the automation suite passes.

## Lane Index & Dependencies

SL-0 — Core classifier engine and normalized actions
  Depends on: (none)
  Blocks: SL-1, SL-2
  Parallel-safe: no

SL-1 — Provider and harness fixture corpus
  Depends on: SL-0
  Blocks: SL-2
  Parallel-safe: yes

SL-2 — Negative fixtures, retry guardrails, docs, and phase verification reducer
  Depends on: SL-0, SL-1
  Blocks: (none)
  Parallel-safe: no

## Execution Policy

- work-unit defaults: work-unit=`lane_execute`, effort=`high`, unsupported=`inherit_default`, inherit-default=`true`
- SL-2: executor=`codex`, model=`gpt-5.5`, effort=`medium`, work-unit=`phase_reducer`, reason=`negative-fixture guardrails docs and phase verification reducer`

## Lanes

### SL-0 — Core classifier engine and normalized actions

- **Scope**: Add the rate-limit catalog package boundary, classifier input/output types, deterministic base rules, confidence scoring, unknown capture, and normalized routing-action mapper.
- **Owned files**: `pnpm-lock.yaml`, `packages/rate-limit-catalog/package.json`, `packages/rate-limit-catalog/tsconfig.json`, `packages/rate-limit-catalog/src/types.ts`, `packages/rate-limit-catalog/src/rules.ts`, `packages/rate-limit-catalog/src/classifier.ts`, `packages/rate-limit-catalog/src/routing-action.ts`, `packages/rate-limit-catalog/src/index.ts`, `packages/rate-limit-catalog/src/classifier.test.ts`, `packages/rate-limit-catalog/src/routing-action.test.ts`
- **Interfaces provided**: `rate_limit_catalog.package.v1`, `rate_limit_catalog.types.v1`, `rate_limit_catalog.base_classifier.v1`, `rate_limit_catalog.routing_action_mapper.v1`
- **Interfaces consumed**: `IF-0-BOOTCORE-2`, `packages/core-contracts/src/rate-limit.ts`, `packages/core-contracts/src/errors.ts`, `specs/phase-plans-v1.md`, `specs/agent-runtime-provider-omnigent-spec.md` (pre-existing)
- **Parallel-safe**: no

| Task ID | Type | Depends on | Files in scope | Tests owned | Test command |
| --- | --- | --- | --- | --- | --- |
| SL-0-T1 | test | (none) | package metadata, classifier and routing-action tests | core classifier and routing-action tests | `test ! -e packages/rate-limit-catalog/package.json || pnpm --filter @omniagent-plus/rate-limit-catalog test -- --run packages/rate-limit-catalog/src/classifier.test.ts packages/rate-limit-catalog/src/routing-action.test.ts` |
| SL-0-T2 | impl | SL-0-T1 | package metadata, lockfile, tsconfig, classifier types, base rules, confidence scoring, unknown capture, routing-action mapper, and public exports | n/a | n/a |
| SL-0-T3 | verify | SL-0-T2 | package boundary and core classifier source/tests | core classifier and routing-action tests | `pnpm install --frozen-lockfile && pnpm --filter @omniagent-plus/rate-limit-catalog test -- --run packages/rate-limit-catalog/src/classifier.test.ts packages/rate-limit-catalog/src/routing-action.test.ts && pnpm --filter @omniagent-plus/rate-limit-catalog typecheck` |

### SL-1 — Provider and harness fixture corpus

- **Scope**: Add provider-specific and harness-specific classifiers plus positive fixture corpus coverage for every roadmap-required provider and harness family.
- **Owned files**: `packages/rate-limit-catalog/src/fixtures.ts`, `packages/rate-limit-catalog/src/provider-rules.ts`, `packages/rate-limit-catalog/src/harness-rules.ts`, `packages/rate-limit-catalog/src/fixtures.test.ts`, `packages/rate-limit-catalog/src/provider-rules.test.ts`, `packages/rate-limit-catalog/src/harness-rules.test.ts`, `fixtures/rate-limits/providers/*.json`, `fixtures/rate-limits/harnesses/*.json`
- **Interfaces provided**: `rate_limit_catalog.fixture_loader.v1`, `rate_limit_catalog.provider_rules.v1`, `rate_limit_catalog.harness_rules.v1`, `rate_limit_catalog.positive_corpus.v1`
- **Interfaces consumed**: `rate_limit_catalog.package.v1`, `rate_limit_catalog.types.v1`, `rate_limit_catalog.base_classifier.v1`, `rate_limit_catalog.routing_action_mapper.v1`
- **Parallel-safe**: yes

| Task ID | Type | Depends on | Files in scope | Tests owned | Test command |
| --- | --- | --- | --- | --- | --- |
| SL-1-T1 | test | SL-0-T3 | provider and harness rule tests plus positive fixture corpus | provider, harness, and fixture corpus tests | `pnpm --filter @omniagent-plus/rate-limit-catalog test -- --run packages/rate-limit-catalog/src/fixtures.test.ts packages/rate-limit-catalog/src/provider-rules.test.ts packages/rate-limit-catalog/src/harness-rules.test.ts` |
| SL-1-T2 | impl | SL-1-T1 | fixture loader, provider rules, harness rules, fixture expectations, and tests | n/a | n/a |
| SL-1-T3 | verify | SL-1-T2 | provider/harness classifier source and positive fixtures | provider, harness, and fixture corpus tests | `pnpm --filter @omniagent-plus/rate-limit-catalog test -- --run packages/rate-limit-catalog/src/fixtures.test.ts packages/rate-limit-catalog/src/provider-rules.test.ts packages/rate-limit-catalog/src/harness-rules.test.ts && find fixtures/rate-limits/providers fixtures/rate-limits/harnesses -name '*.json' -print | sort | xargs -r -n1 python3 -m json.tool >/dev/null` |

### SL-2 — Negative fixtures, retry guardrails, docs, and phase verification reducer

- **Scope**: Add negative and unknown fixtures, retry-storm guardrails, taxonomy documentation, and the terminal phase verification suite after every producer lane passes.
- **Owned files**: `packages/rate-limit-catalog/src/retry-guardrails.ts`, `packages/rate-limit-catalog/src/retry-guardrails.test.ts`, `packages/rate-limit-catalog/src/negative-fixtures.test.ts`, `packages/rate-limit-catalog/src/phase-verification.test.ts`, `fixtures/rate-limits/negative/*.json`, `fixtures/rate-limits/unknown/*.json`, `docs/rate-limit-taxonomy.md`
- **Interfaces provided**: `rate_limit_catalog.negative_corpus.v1`, `rate_limit_catalog.retry_guardrails.v1`, `rate_limit_catalog.docs.v1`, `spec_delta_closeout.v1:no_spec_delta`, `no_doc_delta:release-surfaces`, `automation.suite_command:limits-plan-verify`, `IF-0-LIMITS-5`
- **Interfaces consumed**: `rate_limit_catalog.package.v1`, `rate_limit_catalog.types.v1`, `rate_limit_catalog.base_classifier.v1`, `rate_limit_catalog.routing_action_mapper.v1`, `rate_limit_catalog.fixture_loader.v1`, `rate_limit_catalog.provider_rules.v1`, `rate_limit_catalog.harness_rules.v1`, `rate_limit_catalog.positive_corpus.v1`
- **Parallel-safe**: no

| Task ID | Type | Depends on | Files in scope | Tests owned | Test command |
| --- | --- | --- | --- | --- | --- |
| SL-2-T1 | test | SL-1-T3 | negative fixtures, unknown fixtures, retry guardrails, taxonomy docs, and phase verification test | negative corpus, retry guardrail, and phase verification tests | `pnpm --filter @omniagent-plus/rate-limit-catalog test -- --run packages/rate-limit-catalog/src/negative-fixtures.test.ts packages/rate-limit-catalog/src/retry-guardrails.test.ts packages/rate-limit-catalog/src/phase-verification.test.ts` |
| SL-2-T2 | impl | SL-2-T1 | retry guardrail source/tests, negative and unknown fixture expectations, taxonomy docs, and phase verification test | n/a | n/a |
| SL-2-T3 | verify | SL-2-T2 | full LIMITS owned surface | phase verification suite | `test -f docs/rate-limit-taxonomy.md && rg -n "IF-0-LIMITS-5|burst_rate_limit|fixed_window_usage_cap|auth_or_billing_problem|abuse_or_policy_block|unknown_limit|sameProviderAccountSwitch" docs/rate-limit-taxonomy.md packages/rate-limit-catalog/src && pnpm install --frozen-lockfile && pnpm build && pnpm lint && pnpm typecheck && pnpm test -- --run packages/rate-limit-catalog/src && find fixtures/rate-limits -name '*.json' -print | sort | xargs -r -n1 python3 -m json.tool >/dev/null && git diff --check && phase-loop validate-roadmap specs/phase-plans-v1.md` |

## Execution Notes

- Treat `.phase-loop/` as the authoritative runner state. Legacy `.codex/phase-loop/` files are compatibility artifacts only and must not block or supersede canonical `.phase-loop/` state.
- If execution creates worktrees and `/mnt/workspace` exists, place them under `/mnt/workspace/worktrees/omniagent-plus-<branch>`.
- This phase must classify provided fixture metadata only. It must not persist API keys, OAuth tokens, bearer tokens, full env dumps, raw provider payloads, unbounded transcripts, or secret-bearing diagnostics.
- Hard usage caps, monthly spend caps, auth/billing failures, and policy blocks must never map to burst-limit retry behavior. Burst and transient overload cases may reduce concurrency or retry only when fixture evidence supports that action.
- Same-provider account switching must not be presented as quota bypass. Routing actions may use only `forbidden`, `manual_confirmation_required`, or `allowed_by_policy` for `sameProviderAccountSwitch`.
- `SL-2` is the terminal negative-fixture, documentation, and phase reducer and depends on every producer lane. It records `no_doc_delta` for `README`, `CHANGELOG`, release notes, and external release evidence surfaces because LIMITS does not dispatch a tag or workflow; a post-dispatch evidence reducer is not applicable in this non-dispatch phase.
- Any defect discovered by `SL-2` verification must be repaired in the producing lane before closeout lists `IF-0-LIMITS-5`.

## Acceptance Criteria

- [ ] `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm lint`, `pnpm typecheck`, and `pnpm test -- --run packages/rate-limit-catalog/src` pass from the repo root.
- [ ] `packages/rate-limit-catalog/src/classifier.test.ts` and `routing-action.test.ts` prove deterministic base rules, confidence scoring, unknown capture, retry-after/reset parsing, and normalized routing-action mapping into `LimitClassification`.
- [ ] `packages/rate-limit-catalog/src/provider-rules.test.ts`, `harness-rules.test.ts`, and `fixtures.test.ts` prove fixture coverage for Claude Code, Codex, Gemini/Antigravity, OpenCode, Pi, OpenAI API, Anthropic API, Google/Gemini API, ZAI, MiniMax, and generic OpenAI-compatible APIs.
- [ ] `packages/rate-limit-catalog/src/negative-fixtures.test.ts` proves non-limit 429s, auth failures, policy blocks, outages, malformed signals, and low-confidence unknowns are not misclassified as quota or burst limits.
- [ ] `packages/rate-limit-catalog/src/retry-guardrails.test.ts` proves hard usage caps are not treated as burst limits and repeated retry decisions are bounded by retry-storm guardrails.
- [ ] `packages/rate-limit-catalog/src/phase-verification.test.ts` proves every fixture maps to an expected `LimitClassification`, unknown fixtures map to `unknown_limit`, and same-provider account switching uses only the frozen enum values.
- [ ] `docs/rate-limit-taxonomy.md` documents the classifier taxonomy, confidence tiers, fixture format, routing action matrix, negative-fixture posture, and non-bypass account-switching policy.
- [ ] `git status --short -- pnpm-lock.yaml packages/rate-limit-catalog fixtures/rate-limits docs/rate-limit-taxonomy.md` shows only LIMITS-owned paths before runner closeout.

## Verification

- automation.suite_command: `pnpm install --frozen-lockfile && pnpm build && pnpm lint && pnpm typecheck && pnpm test -- --run packages/rate-limit-catalog/src && find fixtures/rate-limits -name '*.json' -print | sort | xargs -r -n1 python3 -m json.tool >/dev/null && git diff --check && phase-loop validate-roadmap specs/phase-plans-v1.md`
- Lane checks: run the `verify` command from each lane after its implementation task.
- Whole-phase dirty-path check: `git status --short -- pnpm-lock.yaml packages/rate-limit-catalog fixtures/rate-limits docs/rate-limit-taxonomy.md`
- Closeout gate: list `IF-0-LIMITS-5` in `produced_if_gates` only after the automation suite passes and the dirty-path check contains only active-plan owned files.
