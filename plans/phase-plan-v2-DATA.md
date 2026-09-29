---
phase_loop_plan_version: 1
phase: DATA
roadmap: specs/phase-plans-v2.md
roadmap_sha256: ee1f3152a5331e071042ed122e122143cc103544140a5ed8f4e849f6b649587c
automation:
  suite_command: pnpm verify
---

# DATA: Content and durable state

## Context

Phase 3 follows the merged GUARD gate in omniagent-plus#29. Related issues are omniagent-plus#21 and omniagent-plus#22. COORD and WIRE consume DATA's interfaces. The current scanner truncates any invalid last line, including complete schema-invalid JSON; replay silently stops at an invalid last line. Append also rescans the ledger and rebuilds indexes. Repair invalid-tail classification before tightening content validation. Do not edit the external canon package or dispatch a release.

## Resolved execution contracts

- The private state-ledger backend and root workspace require Node `^22.13.0 || >=24.0.0`, including built-in `node:sqlite` without flags. Published runtime-provider and transport contracts retain their existing platform support. JSONL remains the record backend; SQLite arbitrates writers only, on one host/PID namespace and a local filesystem supporting SQLite locks, hard links, atomic same-directory rename, and file/directory fsync. Unsupported durability topology fails explicitly rather than claiming power-loss proof.
- `withFilesystemLock` uses a permanent, versioned SQLite arbitration file. Initialize a temporary database containing its schema and random instance identity; close and fsync it fully before exclusively hard-linking it to the contested path and syncing the parent. Canonical arbitration files are never deleted by owners. A SQLite transaction provides atomic process ownership and crash release. Legacy or unprovable files block writers and remain available for inspection. Never raw-open/close the published SQLite inode: unrelated POSIX closes can cancel SQLite locks. Validate identity through SQL and pathname metadata. A replacement inode fails the operation and is left intact. Supported writers are cooperative and do not remove/replace an active arbitration inode; metadata checks cannot fence arbitrary external tampering during a callback. Use rollback-journal mode, immutable initialized identity, SQL reservation only, and bounded async `BEGIN IMMEDIATE` retries; callback failures are never treated as lock contention. Preserve the lock DB and sidecars during test reset.
- `readLedgerSnapshot` returns bounded validated visible records plus `complete`, `incomplete_tail`, or `in_progress` status and byte/sequence metadata. Visibility at a complete JSONL boundary is not proof of an acknowledged/fsynced writer commit. Existing array/replay APIs require `complete` and otherwise throw; the explicit snapshot API permits nonmutating prefix inspection behind blocked legacy locks. Read captured fd size, verify unchanged fd/path/manifest metadata, and bound retry and byte limits. Compaction atomically replaces a synced temporary ledger rather than rewriting a reader's inode.
- Recover sequence allocation from the maximum of validated ledger sequence and durable historical high-water. Before compaction removes any high sequence, persist its high-water. Reject duplicate/non-increasing sequences, unsupported record/manifest versions, and unsafe integers. Corruption never becomes empty state. Complete JSON that fails schema validation is preserved even without a newline; only a syntactically incomplete final record boundary may be truncated under exclusive ownership.
- Retention selection and dependency closure run inside one locked compaction snapshot. Kept records retain scoped session/turn context, approval requests for responses, and ancestor sessions. Latest terminal/inactive projections remain authoritative. Replay derives each output from one snapshot using ledger sequence and explicit session/task/entity keys.
- Add `readOnly` to store/ledger open options; readonly open, `getManifest`, list/query and CLI session inspection never create directories, repair tails, migrate manifests, or acquire writer locks. Route-task dry-run consumes readonly ledger state; coordination-specific arbitration/effect semantics remain COORD's work.
- Measure before optimizing. A validated in-memory append cache may be reused only while inode/size/mtime match under the writer lock; foreign writes invalidate it. Indexes are rebuildable checkpoints rather than record authority, and append may defer index rebuilding with documented cache staleness. Repeated single-instance and competing-process measurements must accompany the unchanged recovery controls.

Reference: [SQLite's POSIX lock/close constraint](https://www.sqlite.org/howtocorrupt.html#posix_advisory_locks_canceled_by_a_separate_thread_doing_close). Review this material amendment before implementation. Agent-harness panel CR and separate independent review must pass before merge; manual tool-enabled Opus 5.5/Gemini legs and Sol instead of Grok remain the owner's requested review routes.

## Interface Freeze Gates

- [ ] IF-0-DATA-3a — Content policy: `sanitizeMetadataText`, `redactUntrustedText`, `runtimeEvidenceRefSchema`, `handoffPacketSchema`, `stateLedgerRecordSchema`, and `assertNoSecretLeaks` agree on metadata versus opt-in content. Keep opt-in content at the runtime boundary and sanitize export. A shared corpus covers safe lookalikes, nested fields, evidence refs, and direct packet/schema construction.
- [ ] IF-0-DATA-3b — Durable write protocol: `state_ledger_record.v0.1`, `state_ledger_store_manifest.v0.1`, `withFilesystemLock`, and `AppendOnlyStore` preserve sequence high-water and initialized lock identity. Complete schema-invalid lines are corruption; only a provably incomplete tail is repairable by an exclusive writer. Lock release checks owner/inode. Specify supported fsync order for ledger, indexes, manifest, compaction, and lock publication.
- [ ] IF-0-DATA-3c — Read projection: `listRecords`, `queryRecords`, `replaySession`, and `replayUiControlSnapshotFromStateRoot` use one bounded stable committed snapshot without taking a writer lock or mutating files. Incomplete/in-progress tails are explicit, never reported as complete success. A blocked legacy lock permits nonmutating committed-data inspection. Newer schema versions fail explicitly. Replay and retention preserve scoped latest state and dependencies.

## Lane Index & Dependencies

- SL-0 — Ledger safety and projection; Depends on: none; Blocks: SL-1, SL-2; Parallel-safe: no.
- SL-1 — Content and contract boundaries; Depends on: SL-0; Blocks: SL-2; Parallel-safe: no.
- SL-2 — Fault corpus and measured append proof; Depends on: SL-0, SL-1; Blocks: SL-3; Parallel-safe: no.
- SL-3 — Spec and evidence reducer; Depends on: SL-0, SL-1, SL-2; Blocks: none; Parallel-safe: no.

## Lanes

### SL-0 — Ledger safety and projection

- **Scope**: Repair invalid-tail handling first, then durable writes, owner-safe locks, stable reads, replay, retention, and schema-version behavior.
- **Owned files**: `package.json`, `packages/state-ledger/package.json`, `packages/state-ledger/src/append-only-store.ts`, `packages/state-ledger/src/filesystem-lock.ts`, `packages/state-ledger/src/filesystem-lock.test.ts`, `packages/state-ledger/src/ledger-snapshot.ts`, `packages/state-ledger/src/ledger-snapshot.test.ts`, `packages/state-ledger/src/schema.ts`, `packages/state-ledger/src/migrations.ts`, `packages/state-ledger/src/replay.ts`, `packages/state-ledger/src/retention.ts`, `packages/state-ledger/src/index.ts`, `packages/state-ledger/src/audit-ledger.ts`, `packages/state-ledger/src/audit-ledger.test.ts`, `packages/state-ledger/src/hardening-replay.test.ts`, `packages/state-ledger/src/migrations.test.ts`, `packages/state-ledger/src/replay.test.ts`, `packages/state-ledger/src/retention.test.ts`, `packages/cli/src/commands/sessions.ts`, `packages/cli/src/sessions.test.ts`, `packages/cli/src/commands/route-task.ts`, `packages/cli/src/route-task.test.ts`, `fixtures/state-ledger/migrations/*.json`
- **Interfaces provided**: IF-0-DATA-3b and IF-0-DATA-3c.
- **Interfaces consumed**: Existing `StateLedgerEntry`, `StoreManifest`, and GUARD's `pnpm verify`.
- **Parallel-safe**: no
- **Tasks**:
  - test: Prove complete-invalid-final-line preservation, partial-tail recovery, newer-version rejection, replacement lock safety, no-mutation reads, scoped replay, and dependency retention.
  - impl: Classify tails before repair; use bounded stable snapshots; publish initialized lock identity atomically; sync writes in documented order; preserve sequence high-water and retention dependencies.
  - verify: `pnpm exec vitest run packages/state-ledger/src/{audit-ledger,hardening-replay,migrations,replay,retention}.test.ts`; `pnpm typecheck`.

### SL-1 — Content and contract boundaries

- **Scope**: Freeze one corpus-backed metadata/content policy across scanner, evidence refs, handoff packets, and ledger construction.
- **Owned files**: `packages/core-contracts/src/redaction.ts`, `packages/core-contracts/src/index.ts`, `packages/core-contracts/src/handoff-packet.ts`, `packages/core-contracts/src/handoff-renderer.ts`, `packages/core-contracts/src/state-ledger.ts`, `packages/core-contracts/src/fake-event-stream.ts`, `packages/core-contracts/src/fake-provider.ts`, `packages/core-contracts/src/redaction.test.ts`, `packages/core-contracts/src/handoff-packet.test.ts`, `packages/core-contracts/src/handoff-renderer.test.ts`, `packages/core-contracts/src/handoff-security.test.ts`, `packages/core-contracts/src/state-ledger.test.ts`, `packages/core-contracts/src/fake-event-stream.test.ts`, `packages/core-contracts/src/fake-provider.test.ts`, `packages/state-ledger/src/evidence-store.ts`, `packages/state-ledger/src/evidence-store.test.ts`, `packages/identity-isolation/src/secret-redaction.ts`, `packages/identity-isolation/src/secret-redaction.test.ts`, `packages/identity-isolation/src/profile-loader.ts`, `packages/identity-isolation/src/profile-loader.test.ts`, `packages/identity-isolation/src/environment.ts`, `packages/identity-isolation/src/environment.test.ts`, `fixtures/content-policy/*.json`
- **Interfaces provided**: IF-0-DATA-3a and a shared allow/reject corpus.
- **Interfaces consumed**: SL-0 safe record/read semantics and existing public schemas.
- **Parallel-safe**: no
- **Tasks**:
  - test: Exercise safe lookalikes, nested secrets, unknown fields before schema stripping, direct packet/schema/rendering bypass, evidence labels/paths/excerpts, fake-stream interior gaps and heartbeat filtering, concurrent provider close, and identity boundaries from one corpus.
  - impl: Align construction and export validation while preserving opt-in runtime content; sanitize scanner diagnostics without secret samples; distinguish operational workspace paths from exported evidence refs; retain additive external wire-data handling.
  - verify: `pnpm exec vitest run packages/core-contracts/src/{redaction,handoff-packet,handoff-security,state-ledger,fake-provider}.test.ts packages/identity-isolation/src/secret-redaction.test.ts`; `pnpm typecheck`.

### SL-2 — Fault corpus and measured append proof

- **Scope**: Prove combined interfaces under process crashes, concurrency, and measured ledger growth.
- **Owned files**: `packages/state-ledger/src/cross-process.test.ts`, `packages/state-ledger/src/data-fault.test.ts`, `packages/state-ledger/src/data-performance.test.ts`, `fixtures/state-ledger/cross-process/*.json`, `fixtures/state-ledger/contracts/*.json`
- **Interfaces provided**: Deterministic fault matrix and measured append/index evidence.
- **Interfaces consumed**: IF-0-DATA-3a, IF-0-DATA-3b, IF-0-DATA-3c.
- **Parallel-safe**: no
- **Tasks**:
  - test: Inject crashes at append, index, manifest, lock-publication, and fsync boundaries; race processes and replacement locks; fail on lost records, duplicate sequences, writer-lock reads, or false-complete projections.
  - impl: Add deterministic fixtures and measurement. If performance needs production edits, amend SL-0 ownership before changing source and rerun fault controls.
  - verify: `pnpm exec vitest run packages/state-ledger/src/{cross-process,data-fault,data-performance}.test.ts`; record comparable baseline/candidate timings.

### SL-3 — Spec and evidence reducer

- **Scope**: Reconcile producer findings into the repo runtime spec, durable-state docs, and metadata-only closeout.
- **Owned files**: `specs/agent-runtime-provider-omnigent-spec.md`, `docs/durable-state.md`, `docs/hardening-readiness.md`, `plans/evidence/v2/DATA.json`, `plans/evidence/v2/DATA-closeout.json`, `plans/evidence/v2/reviews/DATA-*.json`
- **Interfaces provided**: IF-0-DATA-3 closeout for COORD/WIRE.
- **Interfaces consumed**: SL-0 recovery/snapshot/lock proof, SL-1 content corpus, and SL-2 fault/measurement evidence.
- **Parallel-safe**: no
- **Tasks**:
  - test: Check examples against the corpus and replay outcomes.
  - impl: Document fsync topology, corruption and in-progress reads, content rules, measured tradeoffs, and residuals; record EC/IF decisions and independent review reconciliation.
  - verify: `pnpm verify`; `git diff --check`; check exact command/run/commit evidence bindings.

## Verification

Build before targeted tests if package exports require it. Run SL-0 tests before stricter SL-1 validation; then SL-1 and SL-2 tests. Run `pnpm verify` on the integrated candidate, exact-head hosted CI, and independent panel review. Fault controls must enter production construction sites and fail when the protected behavior is removed. Compare append/index measurements under the same fixture and concurrency.

## Acceptance Criteria

- [ ] EC-DATA-1 — proven by `pnpm exec vitest run packages/core-contracts/src/{redaction,handoff-packet,handoff-security,state-ledger,fake-provider}.test.ts packages/identity-isolation/src/secret-redaction.test.ts`; falsified by a nested secret entering a packet or schema while safe lookalikes pass.
- [ ] EC-DATA-2 — proven by `pnpm exec vitest run packages/state-ledger/src/{cross-process,data-fault,hardening-replay,migrations}.test.ts`; falsified by an ownerless contested lock, duplicate sequence, or deleted complete-invalid line after a crash.
- [ ] EC-DATA-3 — proven by `pnpm exec vitest run packages/state-ledger/src/{data-fault,replay,retention,migrations}.test.ts`; falsified by a read mutating files, claiming completeness on an incomplete tail, or accepting a newer schema.
- [ ] EC-DATA-4 — proven by `pnpm exec vitest run packages/state-ledger/src/{cross-process,data-performance}.test.ts packages/core-contracts/src/fake-provider.test.ts packages/identity-isolation/src/secret-redaction.test.ts` and `pnpm verify`; falsified by a measured regression, lost concurrent append, or public-schema drift.

## Spec Closeout Plan

- schema: `spec_delta_closeout.v1`
- decision: `canonical_spec_update`
- target surfaces: `specs/agent-runtime-provider-omnigent-spec.md`, `docs/durable-state.md`
- evidence paths: `plans/evidence/v2/DATA.json`, `plans/evidence/v2/DATA-closeout.json`
- redaction posture: `metadata_only`
- downstream handling: COORD/WIRE consume reviewed IF-0-DATA-3.
