# Hardening Readiness

The repo remains alpha, not production, not public beta, and not multi-user SaaS.
The supported surface is a local operator workflow and composable libraries.
`IF-0-HARDEN-13` is historical, not current GUARD acceptance. The shared command
is now `pnpm verify`. GUARD merged with hosted CI and independent review; branch
protection is optional for this solo project. Candidate-specific hosted checks
and phase acceptance remain pending SL-2 verification for DATA. Local tests
and workflow source alone are not proof of a successful hosted candidate run.

## Evidence Scope

This inventory covers all 16 claims, in order, from
[audit section 6](code-review-2026-09-01.md#6-documentation-claims-that-do-not-match-the-code).
The audit describes an older checkout; its measurements are historical.
Current source and existing test scope below were inspected at the SL-0 base
`43fd09634bf4d960c3ada66000b709745250b1c4`. Test references identify bounded
primitive evidence, not a claim that each missing behavioral case is tested.
The [disposition](../plans/audit-remediation-disposition-20260905.md) and
[v2 roadmap](../specs/phase-plans-v2.md) retain finding ownership. This is a claim
inventory, not a second finding tracker or closure of those findings.
Unowned historical docs remain unchanged; their section-6 claims are qualified
here pending DATA/COORD/WIRE/INTEG/PREP remediation.

| ID | Audited claim / document | Current implementation and evidence limits | Deferred owner |
| --- | --- | --- | --- |
| S6-01 | Hardening: process crash recovery | `enforceTimeoutCleanup` and `enforceParentDeathCleanup` are caller-driven checks with injected spawn/kill/liveness callbacks; tests explicitly invoke them. Hybrid heartbeats are not enforcement. There is no automatic supervisor. Sources/tests: [process-manager.ts](../packages/omnigent-transport/src/process-manager.ts), [hardening-recovery.test.ts](../packages/omnigent-transport/src/hardening-recovery.test.ts). | INTEG owns scheduling/start-stop cleanup (section 3.2); WIRE owns process lifecycle correctness (TR-7). |
| S6-02 | Hardening: retry storm prevention | Policy tests supply `repeatedFailures`; decisions are caller-supplied budget checks, with no maintained counter and no backoff loop. A returned cooldown object is not proof of persistence or expiry. Sources/tests: [retry-guardrails.ts](../packages/coordinator/src/retry-guardrails.ts), [hardening-recovery.test.ts](../packages/coordinator/src/hardening-recovery.test.ts). | COORD owns CO-4 policy; INTEG owns attempts, scheduling and settlement. |
| S6-03 | Durable state: drift-only index rebuilding | Historical every open and append rebuilding is replaced: DATA defers indexes on append, validates its cache under the writer transaction and invalidates foreign writes. Queries still use bounded full scans; writable startup/compaction rebuild checkpoints. Measured work counts and latency are run-specific, not indexed-query or speed guarantees. Sources/tests: [append-only-store.ts](../packages/state-ledger/src/append-only-store.ts), [retention.test.ts](../packages/state-ledger/src/retention.test.ts). | DATA owns SL-1 performance and SL-6 read effects. |
| S6-04 | Durable state: proven crash recovery | Historical no fsync, stale lock and duplicate sequences gaps are repaired by file/parent sync, permanent initialized SQLite arbitration, historical high-water and private tail evidence. Process-death construction-site controls preserve acknowledged records and rejected bytes; no universal power-loss proof is claimed. Complete schema-invalid tails remain corruption. Sources/tests: [append-only-store.ts](../packages/state-ledger/src/append-only-store.ts), [hardening-replay.test.ts](../packages/state-ledger/src/hardening-replay.test.ts). | DATA owns SL-2 through SL-5 recovery and fault tests. |
| S6-05 | Durable state/security: only bounded redacted refs | Historical path/label not sanitized behavior is repaired: shared evidence schemas validate labels, bounded excerpts and relative/opaque paths before persistence. Corpus controls cover nested secrets and direct construction; finite patterns are not universal detection. Sources/tests: [evidence-store.ts](../packages/state-ledger/src/evidence-store.ts), [evidence-store.test.ts](../packages/state-ledger/src/evidence-store.test.ts). | DATA owns SL-10 and CC-1/CC-2 persistence/export validation. |
| S6-06 | Security: rejects all listed secret shapes | The audit's 18/23 misses are historical. DATA adds nested retained metadata, colon assignments, URL userinfo, private keys, encoded JSON and provider-payload corpus controls; detection is not universal. Identity diagnostics omit secret samples. Sources/tests: [redaction.ts](../packages/core-contracts/src/redaction.ts), [redaction.test.ts](../packages/core-contracts/src/redaction.test.ts). | DATA owns CC-1 shared corpus/scanner and ID-2 diagnostics. |
| S6-07 | Handoff: builder rejects secrets | The builder, exported schemas, direct renderer and ledger construction now share retained-metadata validation. Historical shape-only bypass is closed for the corpus; runtime content remains opt-in and unknown-field behavior is preserved. Validated incomplete-tail repair precedes stricter persisted validation. Sources/tests: [handoff-packet.ts](../packages/core-contracts/src/handoff-packet.ts), [handoff-packet.test.ts](../packages/core-contracts/src/handoff-packet.test.ts). | DATA owns CC-2/CC-3; fix invalid-tail handling before tightening persisted validation. |
| S6-08 | Lifecycle: all missing sequence numbers fail | DATA checks the first event and every interior gap in the unfiltered fake window before heartbeat filtering. Provider-level tests drive idle/turn_active/closed and running/completed/cancelled, plus concurrent close. Queued/blocked/timeout/failure behavior and real upstream guarantees remain unmodeled. Sources/tests: [fake-event-stream.ts](../packages/core-contracts/src/fake-event-stream.ts), [fake-event-stream.test.ts](../packages/core-contracts/src/fake-event-stream.test.ts). | DATA owns CC-6 interior-gap and lifecycle cases. |
| S6-09 | Routing: downgrade always blocked | The create-session path checks requested labels and has a rejection test; send-turn only checks the decision and persists it, without matching the established session identity/provider/harness. Sources/tests: [launch-gate.ts](../packages/coordinator/src/launch-gate.ts), [launch-gate.test.ts](../packages/coordinator/src/launch-gate.test.ts). | COORD owns CO-3, including matching-session positive control and zero-send mismatch cases. |
| S6-10 | Routing: replay excludes raw provider payloads | Classification `rawSignal` contains bounded raw excerpts from body/stdout/stderr. Header filtering and CLI re-sanitization do not make arbitrary library output safe to persist or project. Sources/tests: [rules.ts](../packages/rate-limit-catalog/src/rules.ts), [classifier.test.ts](../packages/rate-limit-catalog/src/classifier.test.ts). | COORD owns CO-6 publication/persistence boundaries using DATA content policy. |
| S6-11 | Taxonomy: exponential backoff | The primitive returns `retryAfterSeconds` as its next delay; there is no exponential backoff or timer for `overload_or_transient`. Tests cover budget decisions and numeric Retry-After, not a running retry schedule. Sources/tests: [retry-guardrails.ts](../packages/rate-limit-catalog/src/retry-guardrails.ts), [retry-guardrails.test.ts](../packages/rate-limit-catalog/src/retry-guardrails.test.ts). | COORD owns CO-4/CO-5 bounded policy and date/negative parsing; INTEG owns scheduling. |
| S6-12 | Taxonomy: 0.85-0.99 requires combined evidence | Confidence is a heuristic base score plus bonuses, not calibrated probability or a requirement for status plus regex plus reset evidence. A single keyword can select a 0.86 base class without status/reset. Existing classifier tests do not establish calibration. Sources/tests: [rules.ts](../packages/rate-limit-catalog/src/rules.ts), [classifier.test.ts](../packages/rate-limit-catalog/src/classifier.test.ts). | COORD owns CO-8 individual confidence/precedence cases and truthful thresholds. |
| S6-13 | UI/architecture: metadata-only snapshot guarantee | DATA omits raw text at durable started-message/text-delta persistence and projects absolute operational roots to opaque exports. A field allowlist and shared metadata validation protect UI/CLI export; labels alone are not proof. WIRE still owns truthful public stream/history labels and packed proof. Sources/tests: [event-mapper.ts](../packages/omnigent-transport/src/event-mapper.ts), [redaction.ts](../packages/core-contracts/src/redaction.ts), [replay.test.ts](../packages/state-ledger/src/replay.test.ts). | DATA owns CC-5 projection/path policy; WIRE owns TR-1 truthful public stream/history labels and packed proof. |
| S6-14 | Transport: stream closes on every exit | `streamSession` calls `close()` in `finally`; direct `openSessionStream` consumers own `close()` themselves. Client tests cover fake-server streaming, not every direct-owner failure path. Sources/tests: [http-client.ts](../packages/omnigent-transport/src/http-client.ts), [http-client.test.ts](../packages/omnigent-transport/src/http-client.test.ts). | WIRE owns TR-9 direct stream-owner cleanup and error-path tests. |
| S6-15 | README/architecture: record has no other effects | `route-task` does not launch a provider. With coordination scope, `--record` can acquire a lease and request inbox messages. The dry-run branch queries but does not acquire; it still opens the ledger and can rewrite indexes/manifest. Sources/tests: [route-task.ts](../packages/cli/src/commands/route-task.ts), [coordination.test.ts](../packages/cli/src/coordination.test.ts). | COORD owns CLI-1 effect semantics; DATA owns SL-6 read mutations. |
| S6-16 | README: external roadmap validation in product gate | The external phase-loop command is not bundled. `pnpm verify` is the repo-owned shared command; build precedes the root suite. Historical HARDEN checks are not current GUARD acceptance. Sources/tests: [verify.mjs](../scripts/verify.mjs), [orchestration.test.ts](../tests/guard/orchestration.test.ts). | GUARD owns HY-1 command wiring; SL-2 owns hosted/integrated acceptance. |

## Consumer Obligations

- There is no automatic supervisor. Process cleanup methods require a consumer
  to supply real owned-process spawn/kill/liveness adapters and invoke checks.
  A heartbeat call is not an enforcement timer. The existing
  [hybrid provider](../packages/omnigent-transport/src/hybrid-provider.ts) does
  not schedule heartbeat-timeout or parent-death enforcement.
- Retry decisions require caller-driven attempts/counters and settlement.
  [Cooldown evaluation](../packages/coordinator/src/cooldowns.ts) tests active
  flags rather than comparing `resetAt` with the clock; expiry is not automatic.
  COORD owns expiry/policy; INTEG owns lifecycle scheduling and persistence.
- [Lease heartbeat](../packages/worktree-leasing/src/heartbeat.ts) wraps a
  caller-driven renewal; [heartbeat tests](../packages/worktree-leasing/src/heartbeat.test.ts)
  do not prove a renewal timer. Lease loss, renewal scheduling and stop/restart
  ownership remain INTEG work. Local and fleet lease contracts stay distinct.
- Existing [worktree locks/cleanup tests](../packages/worktree-leasing/src/hardening-recovery.test.ts)
  cover selected ledger, expiry, host, branch, dirty-state and fencing checks.
  They do not close COORD's independent holder proof, path containment,
  replacement-race or durable release gaps. Expiry alone grants no deletion or
  takeover authority; do not infer safety for arbitrary cleanup targets.
- [AuditLedger](../packages/state-ledger/src/audit-ledger.ts) exposes session,
  turn, event and approval append APIs, but there are no repository production
  callers wiring those records from the provider. Replay tests seed them.
  INTEG owns provider-to-ledger-to-CLI restart proof, not the transport package.
  Existing identity, capability, evidence, route, classification and worktree
  record writers do not establish that missing lifecycle composition.

## Durable State and Content Restrictions

Treat `metadata_only` as the required evidence/export posture, not a guarantee
derived from a label or schema parse. Keep credentials, raw transcripts, raw
provider payloads and environment dumps out of fixtures, evidence and metadata
persistence. Authorized runtime prompts/content remain allowed at the runtime
boundary; GUARD does not globally prohibit content or alter public contracts.
DATA freezes common scanning and field-allowlisted projection policy; WIRE
must make public stream/history labels truthful. Raw content must not be labeled
metadata_only, and actually sanitized content is distinct from content merely
marked `content_redacted`. Independent packed proof remains WIRE work.

Operational absolute roots remain necessary; exported evidence uses repo-relative
paths or opaque refs without home/credential disclosure. DATA applies shared
validation to evidence save/direct schema/render paths and CLI/UI projections.
The finite corpus and excerpt bounds do not establish universal protection.

DATA retains JSONL storage and adds a documented local-filesystem sync protocol,
permanent writer arbitration, bounded nonmutating snapshots and private recovery
evidence. Complete invalid records fail without deletion; incomplete/in-progress
reads are explicit. Replay and locked retention preserve scoped latest state and
dependencies. Do not delete stale locks or use manual break-lock: legacy or
unprovable arbitration files remain blocked while read-only inspection is available.
See [durable state](durable-state.md) and [DATA evidence](../plans/evidence/v2/DATA.json)
for measured scope, candidate acceptance and downstream obligations.

## GUARD Command Contract

After build, `pnpm test` runs deterministic package/tooling tests and excludes
`tests/guard/*.db.test.ts` before collection. It clears inherited DB enablement,
connection variables, live opt-in and provider credential/route variables.
`pnpm verify` performs frozen install, build, lint, workspace/tooling typecheck,
boundary checks, mandatory disposable SQL setup, one full root suite, retained
package packing/manifest binding, transport tarball smoke and artifact checks.
See [README commands](../README.md#verification).

`pnpm test:guard` owns a disposable fixture and runs tooling falsifiers plus
setup/integration cases. `pnpm test:integration` owns a fixture and runs only
integration cases, not destructive setup controls. Both need a prior build
when run standalone and neither substitutes for the full gate. Linux with
Python 3.10 or newer, subreaper and pidfd support, Docker with reachable
loopback-published ports, and
`psql` are required for local fixture runs; ambient database credentials are
not accepted. Missing/empty/skipped required SQL cases fail. Only admitted DB
workers receive the test-role connection; non-DB workers do not.

SQL setup proves disposable-role admission, unmodified migration installation
and a bounded read-only coordination probe. It is not COORD's concurrency,
expiry, RPC-wrapper or hosted Supabase acceptance. Packing/transfer checks
do not close PREP's CASE-HY-4 all-package consumer/distribution requirements.
GUARD does not grant hosted infrastructure or publication acceptance.

## HY Subclaim Inventory

"Delivered locally" means implementation and local controls are present, not
hosted validation or phase acceptance. SL-2 retains exact candidate results,
timing and review evidence. No coverage percentage is inferred from test counts.

| ID | Status | Delivered scope or explicit deferral | Owner |
| --- | --- | --- | --- |
| HY-1/gate | delivered locally | One shared full gate for PR/main and release; stage failure propagation, source/artifact binding and publication-only OIDC have local falsifiers. Hosted Ubuntu is the selected topology; no fleet offload infrastructure is inferred. Evidence: [verify.mjs](../scripts/verify.mjs), [orchestration.test.ts](../tests/guard/orchestration.test.ts), [workflows.test.ts](../tests/guard/workflows.test.ts). | GUARD |
| HY-1/hosted | deferred | Workflow wiring exists, but hosted execution and branch protection are not validated here. Required-check observation, exact-head rehearsal artifacts, post-merge verification and integrated review remain pending. Real OIDC/registry acceptance belongs to SHIP. Evidence: [verify.yml](../.github/workflows/verify.yml), [ci.yml](../.github/workflows/ci.yml). | SL-2 |
| HY-5/promises | delivered locally | `no-floating-promises` is limited to the explicit SL-0 tooling/test scope in ESLint; floating/awaited controls retain existing lint coverage. It is not a production-wide rule rollout. Evidence: [eslint.config.mjs](../eslint.config.mjs), [lint.test.ts](../tests/guard/lint.test.ts). | GUARD |
| HY-5/process | delivered locally | GUARD test commands use a Linux-only Python subreaper with pidfd ownership and per-command descendant custody receipts. Ordinary child operations are bounded at 15 seconds by default; the 250 ms hung-child control escalates at 500 ms and requires reap proof within the following 2 seconds. Cooperative launcher cleanup has a separately declared reservation. SQL connects/statements/readiness use 5/10/30 seconds, image pull 300 seconds, and jobs 20 minutes. This is test tooling, not an automatic product supervisor. Evidence: [guard-process.ts](../tests/helpers/guard-process.ts), [guard-supervisor.py](../tests/helpers/guard-supervisor.py), [process.test.ts](../tests/guard/process.test.ts). | GUARD |
| HY-5/measurement | deferred | Vitest defaults remain meaningful. New coverage instrumentation/thresholds, pool tuning and project-reference/build changes are deferred pending measurement, not treated as absent defaults or correctness proof. The production-wide promise rules requiring semantics belong to the owned DATA/COORD/WIRE/INTEG phases; PREP reconciles measured packaging/build work. Local timing is run-specific, not a performance claim. Evidence: [vitest.config.ts](../vitest.config.ts), [phase-plan-v2-GUARD.md](../plans/phase-plan-v2-GUARD.md). | PREP |
| HY-6/boundaries | delivered locally | Recursive AST checks reject new/altered cross-package source escapes, mapped/alias/symlink forms and unsupported loaders. Only three exact type edges and the pinned existing computed published-contract loader are admitted; this is not a JavaScript sandbox. Evidence: [check-dependency-boundaries.mjs](../scripts/check-dependency-boundaries.mjs), [boundaries.test.ts](../tests/guard/boundaries.test.ts). | GUARD |
| HY-6/docs | delivered locally | Readiness checks retain posture, per-claim ownership and evidence links; existing live opt-in phrase fixtures/tests, dependency assertions and canonical conformance remain intact. Separate network monitoring remains the OpenAPI delta script, outside the deterministic gate. Evidence: [hardening-readiness.test.ts](../packages/cli/src/hardening-readiness.test.ts), [live-omnigent-smoke.test.ts](../packages/omnigent-transport/src/live-omnigent-smoke.test.ts). | GUARD |
| HY-6/ID-1 | deferred | ID-1 source repair and baseline removal remain PREP/omniagent-plus#27: only `OmnigentProviderMode` type imports in `process-profile.ts`, `omnigent-isolation-policy.ts`, and `types.ts` under identity-isolation may target `../../omnigent-transport/src/types.js`. No new/value/renamed edge is deferred; independent public-package resolution proof is still required. Evidence: [audit-remediation-disposition-20260905.md](../plans/audit-remediation-disposition-20260905.md). | PREP |

## Live Omnigent Smoke

The live Omnigent smoke contract is opt-in and skip by default, with metadata_only
evidence. The full-root suite permits exactly the named live case to skip;
focused GUARD/integration runs permit no skips. Default verification uses
noncredentialed environments. `pnpm test` never enables live smoke; the separate
[explicit direct invocation](omnigent-live-smoke.md#explicit-invocation) runs
after build and requires deliberate operator settings. It checks session/health
metadata and attempts closure, not end-to-end durability or production behavior.

## Release Posture

License choice remains pending PREP: HY-2's maintainer decision is tracked in
omniagent-plus#20, with distribution implementation consumed by
omniagent-plus#27. No license is inferred from dependencies. GUARD changes no
versions and dispatches no release. Commercialization, hosted rollout and
multi-user operation have no acceptance from this inventory; the release stays
not production, not public beta, and not multi-user SaaS.
