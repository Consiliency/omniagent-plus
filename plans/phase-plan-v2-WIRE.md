---
phase_loop_plan_version: 1
phase: WIRE
roadmap: specs/phase-plans-v2.md
roadmap_sha256: 6c7cd036c09839653dc85c58382d6bf8eac71860f9cf2d60f9d63b48d7b58f46
automation:
  suite_command: pnpm verify
---

# WIRE: Transport reliability

## Context

Consumes accepted DATA and COORD on main f33471de858d3be1fc01a50696abdcb4ab717a87. Owns omniagent-plus#25 and reconciles the unpublished candidate omniagent-plus#30 (aee2df42ebdd5679664477c9b2c754e6eb5942ea). Preserve core-contracts0.6.3, DATA schemas, the published v0.12 default replay policy, and mutation authority. Execute serially in one private worktree. No worker fanout, dependency upgrades, version bump, publication, live user-data access or automatic mutation retry.

Latest stable upstream was rechecked on 2026-10-04: v0.16.0, source82a74473ee4c01163c4269f4296b10a158f0e47e, release2026-09-29. Freeze official tagged v0.12/v0.15/v0.16 fixtures and provenance; do not confuse fixture identity with runtime detection. New error descriptors and undelivered uncertainty need handling, but owner/admin/sign-in surfaces grant no local approval authority. PREP retains release/license/dependency decisions; INTEG retains durable composition.

## External Inputs

Tagged Omnigent releases v0.12.0, v0.15.0 and v0.16.0, their official OpenAPI/event schemas and source commits are external fixture inputs. Record URL, tag commit and artifact digests in WIRE-upstream evidence before fixture regeneration. The qualified harness source4a62fc1/runtime0.7.21 is an external review/audit tool input. Internal source identities below describe measured history, not required future commit topology.

## Resolved contracts

- Freeze a shared OmnigentTransportLimits policy consumed by OmnigentHttpClientOptions and OmnigentCliProviderOptions, adding validated finite positive options: requestTimeoutMs, maxResponseBytes, maxSseFrameBytes, maxHistoryItems, maxSessions, maxTurnsPerSession, maxEventsPerSession, maxStreamsPerSession, maxRetainedBytes and maxPaginationPages. Freeze defaults in SL-0: request30,000ms, response8MiB, SSE frame1MiB, history10,000 items, sessions128, turns1,024/session, events65,536/session, streams8/session, aggregate retained provider state64MiB, pagination128 pages. Counts are positive safe integers at most1,000,000; timer at most2,147,483,647ms; response/frame caps at most64MiB and aggregate state cap at most256MiB. Defaults and byte/count units are documented and boundary-tested; values cannot disable bounds or overflow timers. An explicit wireVersion selects v0.12.0 (default), v0.15.0 or v0.16.0. Frozen fixture loaders remain separate evidence.
- Compose URLs under the base gateway pathname, including bases with/without trailing slash; retain endpoint queries and escaped IDs. Reject base URLs with query/fragment before effects. Per-turn SendTurnRequest.timeoutMs may shorten but never extend requestTimeoutMs: the acknowledgement/CLI-command deadline is their validated positive minimum; this is not a terminal-turn execution timer. HTTP handshake and complete JSON/error-body reading share a finite deadline, abort, incremental byte cap and reader cleanup. SSE uses only a handshake deadline, then caller abort/frame bounds; no wall-clock limit on healthy streaming. Mutation timeout reports uncertain outcome and never resends. Safe canonical code/message fields determine failures; descriptive title/cause/remediation and arbitrary stderr never become authority or unbounded diagnostics.
- SSE framing accepts LF, CRLF and bare CR across UTF-8/chunk boundaries. Remove exactly one optional ASCII space after each data colon, preserve further leading/trailing spaces, join multiline data with LF, and ignore comments/irrelevant fields. Bound bytes before retaining an oversized frame, including no-delimiter input; overflow is typed nonretryable failure and cancels reader. Preserve existing EOF dispatch contract explicitly in tests. Return/abort/HTTP rejection/direct close release listeners and body/reader ownership even before iteration.
- Consume DATA content policy without schema edits: raw text/tool input/output is content_allowed; metadata_only contains allowlisted metadata without content; content_redacted is reserved for actual sanitization. Keep independent packed proof of stream/history posture and untrusted diagnostic redaction. Every tagged event has an explicit map/drop disposition, including sidechat, skills, codex approval mode, elicitation resolution and unknown extensions. Preserve v0.12 skills; tagged v0.15/v0.16 remove skills and add sidechat/approval-mode metadata, so newer-policy event dispositions explicitly reflect that difference. Drops produce bounded metadata diagnostics, never raw payload disclosure or approval/consent authority. Upstream info errors remain informational; undelivered failure conveys uncertainty without automatic replay.
- Selectively reconcile omniagent-plus#30 using source diffs and its plan/evidence. v0.12 default keeps published cross-namespace replay behavior. Explicit v0.15/v0.16 policy grants text replay credit only for exact identity or validated aliases when nonempty IDs differ; uncertain identity remains lossless, including collision invalidation in already-open subscribers. Numbered upstream frames retain one process-local cursor across reconnect/subscribers; unnumbered frames retain connection-specific identity. Preserve provisional turns, delayed ack, cancellation quarantine, aliases and exclusive lease/shared fence semantics. Nested payload data cannot overwrite authoritative envelope fields. Detach and validate create/send/cancel inputs before their first await or lease queue; delayed lease/fence reads must use the same immutable session/idempotency/body identity. Caller mutation must never target B while holding A lease. Permit at most one read-only stale-cursor restart; never restart mutations. Bound every paginated collection (history, session list and child list) while collecting: total rows at most maxHistoryItems, total response bytes at most maxResponseBytes, pages at most maxPaginationPages and one requestTimeoutMs deadline across pages and any restart. Count cursors and all attempted walks against the same budgets before retaining rows; advancing one-row pages must still terminate with typed failure.
- Bound session, turn, stream, replay and retained-text state at production admission/construction sites. Reserve capacity before async effects, including concurrent creates. Successful idempotency keys, uncertain creates, outstanding/uncertain turns and cancellation/rejection tombstones cannot be evicted to regain admission. Resource exhaustion refuses new work before network effects; duplicate keys still return their original result. Post-dispatch uncertain create outcomes retain bounded deterministic failure tombstones: same-key repeats never issue a second POST/CLI create. Only proven pre-dispatch refusal can release its reservation; preserve zero-effect retry there. Enforce the common capacities on CLI providers too, including injected transports, before create/attach effects and before history/event mapper construction; reserve concurrent capacity, free transient/agent details on close, retain only bounded protected identity/result tombstones. Release closed stream/parser/transient state without deleting protected replay/fence evidence; finite lifetime capacity refusal is acceptable and documented. Count retained keys and bytes, not merely map count. Refuse oversized histories before mapper construction and bound per-session observed events/aliases so tiny hostile frames cannot grow sets indefinitely. Do not use an LRU that breaks reconnect or successful idempotency.
- Process ensureRunning and hybrid readiness each memoize one in-flight operation; concurrent callers share spawn/start, failure clears for retry, and stop racing an unfinished spawn cleans the resulting process once. Preserve parent-death/heartbeat cleanup. CLI validates bounded JSON object/output envelopes and nonzero exits; command runners receive the finite deadline, abort signal and stdout/stderr byte cap in their options and must bound capture before constructing output strings. The transport independently refuses oversized results before JSON.parse, enforces waiting deadlines even for a hanging injected runner, and documents runner-side cancellation/capture responsibility; malformed output is a typed nonretryable failure with bounded allowlisted diagnostics, no raw stdout/stderr/command secrets. Runner rejection is mapped safely. CLI fallback does not invent stable cancel authority.
- Capability snapshots must omit version/gitSha unless derived from an actual measured runtime surface. Fixture metadata is available through fixture loaders, never presented as live detection. Stable tagged fake-server/packed behavior suffices for WIRE; live server probes stay opt-in and their absence is not a pass.

## Interface Freeze Gates

- [ ] IF-0-WIRE-5 — OmnigentHttpClientOptions finite resource/version policy, bounded HTTP/SSE/CLI semantics and content-aware RuntimeEvent construction; existing DATA/runtime-provider schemas and exclusive-session mutation fence remain unchanged.

## Lane Index & Dependencies

- SL-0 — Shared contracts; Depends on: (none); Blocks: SL-1, SL-2, SL-3; Parallel-safe: no
- SL-1 — HTTP and SSE; Depends on: SL-0; Blocks: SL-4; Parallel-safe: no
- SL-2 — Mapping and lifecycle; Depends on: SL-0, SL-1; Blocks: SL-4; Parallel-safe: no
- SL-3 — CLI and cold start; Depends on: SL-0, SL-1; Blocks: SL-4; Parallel-safe: no
- SL-4 — Fixtures, consumer and acceptance reducer; Depends on: SL-0, SL-1, SL-2, SL-3; Blocks: none; Parallel-safe: no

## Lanes

### SL-0 — Shared contracts
- **Scope**: Freeze additive options, exports and declared producer outputs.
- **Owned files**: `packages/omnigent-transport/src/types.ts`, `packages/omnigent-transport/src/types.test.ts`, `packages/omnigent-transport/src/index.ts`, `.phase-loop-generated-outputs.json`
- **Interfaces provided**: shared OmnigentTransportLimits and version policy, command-runner abort/capture options; additive tagged types; current build-output declaration.
- **Interfaces consumed**: existing DATA/runtime-provider schemas, legacy transport exports.
- **Parallel-safe**: no
- **Tasks**:
  - test: option/type compatibility and unchanged default v0.12 public surface.
  - impl: preamble contracts and export serialization; preserve all existing output declarations.
  - verify: `pnpm --dir packages/omnigent-transport typecheck`.

### SL-1 — HTTP and SSE
- **Scope**: Bound URLs, requests, bodies, parsing, normalization and reader ownership.
- **Owned files**: `packages/omnigent-transport/src/http-client.ts`, `packages/omnigent-transport/src/http-client.test.ts`, `packages/omnigent-transport/src/sse-stream.ts`, `packages/omnigent-transport/src/sse-stream.test.ts`, `packages/omnigent-transport/src/failure-mapper.ts`, `packages/omnigent-transport/src/failure-mapper.test.ts`
- **Interfaces provided**: bounded HTTP operations and tagged normalization; typed sanitized failure mapping.
- **Interfaces consumed**: SL-0 options, preserved session/turn wire interfaces.
- **Parallel-safe**: no
- **Tasks**:
  - test: prefixes, queries/escaping, hanging handshake/body, byte overflow, base query/fragment rejection, per-turn deadline precedence, advancing tiny-page aggregate row/byte/page/deadline exhaustion, abort and close-before-iteration; no repeat send; all CR/LF splits, every UTF-8 split, whitespace/multiline/no-delimiter overflow and consumer-return cancellation; envelope precedence and bounded alias/event state.
  - impl: deadline/cap/cleanup; tagged v0.16 error shapes and one read-only stale-cursor restart; preserve native normalization, pending identities and fencing.
  - verify: `pnpm exec vitest run packages/omnigent-transport/src/http-client.test.ts packages/omnigent-transport/src/sse-stream.test.ts packages/omnigent-transport/src/failure-mapper.test.ts`.

### SL-2 — Mapping and lifecycle
- **Scope**: Correct content posture and versioned replay while bounding protected provider state.
- **Owned files**: `packages/omnigent-transport/src/event-mapper.ts`, `packages/omnigent-transport/src/event-mapper.test.ts`, `packages/omnigent-transport/src/history-mapper.ts`, `packages/omnigent-transport/src/history-mapper.test.ts`, `packages/omnigent-transport/src/http-provider.ts`, `packages/omnigent-transport/src/http-provider.test.ts`, `packages/omnigent-transport/src/capability-probe.ts`, `packages/omnigent-transport/src/capability-probe.test.ts`
- **Interfaces provided**: bounded provider admission, truthful events/capability identity and preserved replay/fences.
- **Interfaces consumed**: SL-0 finite/version policy, SL-1 cleanup/normalizer and failures, existing DATA policy.
- **Parallel-safe**: no
- **Tasks**:
  - test: raw stream/history content posture; metadata drops/no authority; info vs fatal/undelivered errors; exact/different/alias/collision identity and shared numbered cursor under both policies; late ack, provisional/cancel quarantine/fence and duplicate idempotency; queued lease/fence-read caller mutation of send/cancel/create inputs with consistent lease/fence/key/wire target and body; concurrent capacity refusal zero effects; uncertain create same-key repeat yields deterministic failure and zero second POST while pre-dispatch refusal stays retryable; small-frame/text/key exhaustion, closed stream cleanup and reconnect; no fixture-derived live identity.
  - impl: reconcile PR30 selectively, preserve default policy, enforce reserved capacities without protected eviction, source-grounded snapshot provenance.
  - verify: `pnpm exec vitest run packages/omnigent-transport/src/event-mapper.test.ts packages/omnigent-transport/src/history-mapper.test.ts packages/omnigent-transport/src/http-provider.test.ts packages/omnigent-transport/src/capability-probe.test.ts`.

### SL-3 — CLI and cold start
- **Scope**: Type and sanitize command failures while serializing spawn/readiness races.
- **Owned files**: `packages/omnigent-transport/src/cli-client.ts`, `packages/omnigent-transport/src/cli-client.test.ts`, `packages/omnigent-transport/src/process-manager.ts`, `packages/omnigent-transport/src/process-manager.test.ts`, `packages/omnigent-transport/src/hybrid-provider.ts`, `packages/omnigent-transport/src/hybrid-provider.test.ts`
- **Interfaces provided**: common bounded CLI admission/retention, command parsing and one in-flight process/readiness operation.
- **Interfaces consumed**: SL-0 options and existing command-runner/process interfaces; SL-1 failure mapping.
- **Parallel-safe**: no
- **Tasks**:
  - test: malformed/wrong-shape/oversized output, finite runner deadline/capture option propagation, hanging runner/abort and nonzero secrets; CLI concurrent create/session/turn/byte admission refusal before transport effects, bounded history/events before mapping, closed transient cleanup and preserved duplicate/uncertain idempotency; concurrent spawn/start, failure/retry, stop-during-spawn and heartbeat/parent death; no new CLI mutation authority.
  - impl: safe command boundary and readiness promise lifecycle.
  - verify: `pnpm exec vitest run packages/omnigent-transport/src/cli-client.test.ts packages/omnigent-transport/src/process-manager.test.ts packages/omnigent-transport/src/hybrid-provider.test.ts`.

### SL-4 — Fixtures, consumer and acceptance reducer
- **Scope**: Freeze tagged provenance and verify combined behavior before truthful closeout.
- **Owned files**: `fixtures/omnigent/**`, `packages/omnigent-transport/src/contract-fixtures.ts`, `packages/omnigent-transport/src/contract-fixtures.test.ts`, `packages/omnigent-transport/src/fake-omnigent-server.ts`, `packages/omnigent-transport/src/conformance.test.ts`, `packages/omnigent-transport/src/hardening-recovery.test.ts`, `packages/omnigent-transport/src/live-omnigent-smoke.test.ts`, `scripts/smoke-packed-omnigent-transport.mjs`, `docs/omnigent-transport.md`, `docs/lifecycle-and-events.md`, `docs/hardening-readiness.md`, `fixtures/hardening/readiness/docs-contract.json`, `plans/phase-plan-v2-WIRE.md`, `plans/evidence/v2/WIRE*.json`, `plans/evidence/v2/reviews/WIRE*.json`, `plans/manifest.json`, `specs/phase-plans-v2.md`
- **Interfaces provided**: accepted IF/EC evidence, complete event disposition matrix and PR30 disposition.
- **Interfaces consumed**: every producer lane; roadmap, existing fixture provenance, published contract and review/gate evidence.
- **Parallel-safe**: no
- **Tasks**:
  - test: exact tagged schema/event fixtures, v0.12 default plus v0.15/v0.16 packed consumers with no ledger/harness dependency; adversarial controls enter production factories; full existing GUARD/DATA/COORD regressions; wrong-phase/stale-head/changed/symlink/undeclared producer evidence rejects. Enter the actual FakeOmnigentServer handler with malformed, oversized and aborted request bodies: bounded typed HTTP refusal, no unhandled rejection/hanging response, then continued valid service. Preserve GUARD enrollment of live-omnigent-smoke.test.ts.
  - impl: provenance/fixtures, consumer scenarios, bounded default/retention docs, metadata-only review/gate receipts and manifest lifecycle; preserve historical dissent and measured-source identity. Update roadmap criteria only after acceptance.
  - verify: `pnpm verify`; current-head hosted verification and packed rehearsal with publication skipped; `phase-loop-closeout-audit --repo . --record-outputs --phase WIRE`; postmerge main CI.

## Verification

- `pnpm build`
- `pnpm exec vitest run packages/omnigent-transport/src`
- `pnpm verify`
- `node scripts/smoke-packed-omnigent-transport.mjs`
- `phase-loop-closeout-audit --repo . --record-outputs --phase WIRE`

Frozen install and narrow tests precede full verification. Use the isolated qualified harness0.7.21 at4a62fc1; do not mutate global tools. Producer audit runs exclusively after committed declaration, observes build and binds WIRE/current HEAD/digests. Final metadata commits require fresh producers/audit and external final-HEAD receipts. Full hosted SQL/custody/rehearsal gates remain mandatory; failed or skipped proof is never passed. No publication. Branch protection remains optional.

Before implementation, panel this plan; before acceptance/merge, panel actual production source. Four harness seats (two Astra max/two gpt5.6Sol max, distinct lenses), separate native independent review, manual tools-enabled subscription Opus5.5 TUI and Gemini, plus a president are required. Every reviewer gets a fresh immutable checkout (qualified per-seat harness snapshots and separate manual/native clones); all read source by reference with actual prescript inventory before each leg; no giant bundle, API-key fallback, Grok restoration, silent replacement or reduced gate. Record source grounding/preflight, all attempts and exact source/delta identity. The president runs manually through the subscription Opus TUI and the qualified invoke_president seam with a Fable-only availability ladder; missing/unusable ruling blocks. It adjudicates every finding and forces a decision after all reviewers finish; it cannot waive regressions or replace any reviewer's approval.

Reconcile each blocker against ECs, frozen/public invariants or actual regressions. Preserve out-of-scope suggestions with concrete downstream owner/issue; classifications are provisional, never blanket waivers. Let all legs finish, fix together, then rerun dissenting seats; every seat needs a usable standing AGREE and final exact-head production approval. Owner authorizes rerun until merge-ready; a three-round checkpoint triggers scope/input diagnosis, not automatic waiver or descope of required ECs. Keep unavailable legs unavailable and repair actual launch/auth blockers safely.

After qualified merge, verify main CI, close omniagent-plus#25 only with its TR1..9 evidence, close/comment superseded omniagent-plus#30 only when its incorporated behavior is source-bound, comment omniagent-plus#19/#26/#27, and prune only this clean merged worktree and branches. Preserve both unmerged historical worktrees, release/license omniagent-plus#20 and all review evidence.

## Acceptance Criteria

- [ ] EC-WIRE-1 — proven by SL-1/SL-3 suites and packed consumer; falsified by prefix loss, hanging/oversized body, incorrect data whitespace, raw CLI failure or leaked reader.
- [ ] EC-WIRE-2 — proven by mapper/history/conformance suites and full tagged disposition/packed checks; falsified by raw content labelled metadata_only, undisposed event, info terminating a turn or administrative approval authority.
- [ ] EC-WIRE-3 — proven by provider/process/hybrid capacity and race suites; falsified by unbounded retained state, duplicate cold start, lost idempotency, reconnect/late-ack/cancellation/fence regression or effectful capacity refusal.
- [ ] EC-WIRE-4 — proven by pinned fixture/conformance and independent pack checks plus dependency inspection; falsified by unpinned tagged identity, static fixture claimed live detection, changed v0.12 default or added ledger/harness dependency.

## Spec Closeout Plan

- schema: `spec_delta_closeout.v1`
- decision: `no_spec_delta`
- target surfaces: `docs/omnigent-transport.md`, `docs/lifecycle-and-events.md`
- evidence paths: `plans/evidence/v2/WIRE.json`
- redaction posture: `metadata_only`
- downstream handling: INTEG consumes bounded provider lifecycle; PREP owns release/license/dependencies. No external canon edit.
