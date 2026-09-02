# omniagent-plus code review (2026-09-01)

Reviewed at commit `9b66d53` (merge of PR #16, Omnigent v0.11 accommodation). Ten workspace packages, about 43,000 lines of TypeScript (23,000 source, 20,000 tests), plus docs, fixtures, scripts, one Supabase migration, and one GitHub workflow.

## 1. Scope and method

- Full verification gate run in a clean container: `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test`. All green: 100 test files, 345 tests passed, 1 skipped (the opt-in live Omnigent smoke). `pnpm audit --prod` reports no known vulnerabilities.
- Every finding below was verified against the code by the reviewer (file and line references are to `9b66d53`). Scouting agents read each package in full and returned candidate findings; every candidate that appears here was re-read in the source, and several were reproduced by running the built package (see Appendix A for the redaction probe).
- Severity scale: **P0** = fix before relying on the feature or publishing; **P1** = fix in the next milestone; **P2** = improvement / hygiene.

## 2. Executive summary

The codebase is unusually disciplined for an alpha: strict TypeScript everywhere, no `any`, no `@ts-ignore`, zero TODOs, zod schemas on most boundaries, a fail-closed posture in the redaction layer, an atomic server-side lease RPC with RLS in Postgres, and a large fixture-driven conformance suite pinned to specific upstream Omnigent tags. Lint, typecheck, and tests are green.

The problems are structural rather than local, and most of them are invisible to the current test suite because the tests validate primitives in isolation rather than the system end to end:

1. **The runtime provider and the durable ledger are not connected.** No production code path writes `session`, `turn`, `runtime_event`, `approval_request`, or `approval_response` records. `@consiliency/omnigent-transport` does not depend on `@omniagent-plus/state-ledger` at all. Consequently `sessions list`, `sessions show`, and most of `control snapshot` can only ever display fixture data. (§3.1)
2. **Several documented runtime behaviors exist only as library primitives that nothing schedules or calls.** Heartbeat-timeout and parent-death process cleanup, retry-storm guardrails, cooldown expiry, and lease heartbeats all have zero production callers or no timer/loop behind them. Cooldowns in particular can never expire: once a provider cooldown is `active`, nothing compares `resetAt` to the clock. (§3.2, CO-1)
3. **The "durable" ledger has an O(N²) append path, write-only indexes, no `fsync`, and a lock file that bricks the state root after any hard crash.** Each append re-reads and re-validates every record, rebuilds three index files nobody reads, and rewrites the manifest; a SIGKILL while holding `locks/store.lock` leaves every later command timing out with no documented recovery. (§4.1)
4. **The secret-redaction scanner passes 18 of 23 realistic secret shapes**, including the repository's own `OMNIAGENT_COORDINATION_SUPABASE_SERVICE_ROLE_KEY=eyJ…` form, bare JWTs, AWS keys, URL-embedded credentials, PKCS#8 private-key headers, and any `key: value` (colon) assignment. There are three divergent copies of the scanner across packages, and the schemas that validate persisted data never re-scan. (§4.2, Appendix A)
5. **`redaction: "metadata_only"` is hardcoded onto every transport event, including assistant text deltas and tool payloads**, so the read-model's `redactionPosture: "metadata_only"` guarantee is a label, not a property. (TR-1)
6. **Three parallel lease implementations and three parallel secret scanners** have already drifted from each other; one lease store (`CoordinationStore`) is reachable only from a test and has exclusivity bugs. (§3.3)
7. **No CI runs on pull requests.** The only workflow is the release publisher, and even its verify job skips lint and typecheck. (§4.7)
8. **Coordinator correctness gaps**: a nonexistent preferred identity is silently substituted and persisted as `explicit_override`; the send-turn launch gate skips the downgrade check that create-session runs; there is no exponential backoff despite the docs; `Retry-After` HTTP-dates and negative values are mishandled. (§4.4)
9. **HTTP client has no request timeout and drops any path prefix in `baseUrl`**; the SSE parser has an unbounded buffer; per-session and dedupe maps grow for the life of the process. (§4.3)
10. **Repository hygiene**: committed build logs and agent transcripts with another machine's absolute paths, no LICENSE for three public npm packages, inconsistent repository URLs, and test-only code shipped in the published tarball. (§4.7)

None of these contradict the README's "alpha, local-operator, not production" posture. They do contradict several specific claims in `docs/hardening-readiness.md`, `docs/durable-state.md`, `docs/security-and-secrets.md`, `docs/coordinator-routing.md`, and `docs/rate-limit-taxonomy.md`; §6 lists each mismatch.

## 3. Cross-cutting findings

### 3.1 The pieces are not wired together

`AuditLedger` exposes `appendSession`, `appendTurn`, `appendRuntimeEvent`, `appendApprovalRequest`, and `appendApprovalResponse` (`packages/state-ledger/src/audit-ledger.ts:35-135`). A repository-wide search finds no non-test caller of any of them. The record kinds that do have production writers are: `identity_profile_status` (identity-isolation status store), `capability_snapshot` (transport capability store), `evidence_ref` (evidence store), `route_decision` (coordinator route store), `limit_classification` (`classify-limit --record`), and `worktree_lease` (worktree-leasing lease manager). Provider cooldowns are written only by `CoordinationStore`, which itself has no production caller.

Effects:
- `packages/cli/src/commands/sessions.ts` and the `sessions`, `sessionTree`, `activeTurns`, `approvals`, and `handoffs` sections of `control snapshot` (`packages/state-ledger/src/replay.ts:171-536`) have no data source outside fixtures.
- The `hybrid`/`http` providers never persist anything, so "replay without live Omnigent" is only possible for records seeded by tests.
- Because nothing exercises the write path end to end, the O(N²) append cost (§4.1) has never been felt.

Recommendation: add a `LedgerRecordingProvider` decorator (or an event-tap option on `OmnigentHttpProvider`) in a new small package or in the CLI, so that `createSession`, `sendTurn`, `streamEvents`, and approval events append to the ledger; then make `sessions list` an integration test that goes through the provider. Until that exists, the docs should say that session/turn replay is fixture-only.

### 3.2 Documented runtime behaviors that have no runtime

| Documented behavior | Where the primitive lives | What actually calls it in production |
|---|---|---|
| "crash recovery covers owned Omnigent process cleanup after heartbeat timeout and parent-process death" (`docs/hardening-readiness.md:10`) | `OmnigentProcessManager.enforceTimeoutCleanup` / `enforceParentDeathCleanup` (`packages/omnigent-transport/src/process-manager.ts:120-144`) | Nothing. Only tests. `hybrid-provider.ts:146` calls `heartbeat()` but never enforcement. No `setInterval` exists anywhere in `src/`. |
| "retry storm guardrails stop repeated backend failures" (`docs/hardening-readiness.md:8`) | `evaluateRetryGuardrails` / `applyRetryGuardrails` | Only `failure-policy.ts:9`, a pure function whose `repeatedFailures` counter is caller-supplied; nothing in the repo maintains that counter. |
| Cooldowns with `resetAt` | `evaluateCooldownState` (`packages/coordinator/src/cooldowns.ts:49-81`) | Reads only `.active === true`; `resetAt` is never compared with the clock anywhere; no writer ever sets `active: false`. |
| Lease heartbeat / renewal | `renewLeaseHeartbeat` (`packages/worktree-leasing/src/heartbeat.ts`, a one-line wrapper) | Caller-driven only; no timer. |
| Sidecar indexes "rebuilt whenever startup detects drift" (`docs/durable-state.md:29`) | `AppendOnlyStore.writeIndexes` | Rebuilt unconditionally on every open and every append; never read by any production code. |

These are not bugs in the primitives. They are the absence of the supervising loop that the docs imply exists. Either build a small supervisor (process manager tick, cooldown expiry sweep, lease renewal timer) or reword the docs to describe the primitives as building blocks for consumers.

### 3.3 Duplicated subsystems that have already drifted

- **Three secret scanners**: `core-contracts/src/redaction.ts:15-58` (5 text patterns), `identity-isolation/src/secret-redaction.ts:20-45` (the same 4 copied verbatim plus `auth_header`, plus the only recursive object walker in the repo), `state-ledger/src/evidence-store.ts:9-17` (7 different patterns, e.g. catches `AKIA` which core does not). Consolidate into one exported scanner in core-contracts with the recursive walker, and one shared positive/negative corpus fixture that all three call sites run.
- **Three lease stores**: `state-ledger/src/coordination.ts` `CoordinationStore` (test-only caller; keys leases by `repo:branch:mode`, so an `exclusive_write` request does not see a `read_only` lease on the same branch, non-exclusive requests silently overwrite, `listActiveLeases` returns expired leases, and no release/renew exists), `worktree-leasing/src/lease-manager.ts` registry, and `worktree-leasing/src/lease-store.ts` `LocalLeaseStore` / `SupabaseLeaseStore` for the Consiliency contract. Delete `CoordinationStore.acquireExclusiveLease` or fold it into worktree-leasing.
- **Two filesystem locks** (`state-ledger/src/append-only-store.ts:73-113`, `worktree-leasing/src/locks.ts:16-124`) with the same algorithm and the same missing stale-lock handling; **two `writeJsonAtomic`** (`state-ledger/src/schema.ts:115-123`, `worktree-leasing/src/lease-manager.ts:59-66`); **three JSONL scanners** (`append-only-store.ts:115-169`, `replay.ts:68-109`, plus the truncation-free variant); **two Supabase RPC wrappers** with identical `RpcResult` types and opposite failure postures (`supabase-coordination-channel.ts:23-33` throws, `supabase-lease-store.ts:27-36` plus `catch {}` swallows everything into `backend-unavailable`).
- **Transport**: `mapSessionState` byte-identical in `http-provider.ts:32` and `cli-client.ts:76`; `normalizeBackgroundTasks` (`http-client.ts:72`) byte-identical to `backgroundTasks` (`sse-stream.ts:105`); `isRecord` and `epochToIso` duplicated; `mapCliFailure` exported from `failure-mapper.ts:134` but never used by `cli-client.ts`, which has its own cruder `commandFailure`.
- **Enums re-typed by hand**: `sameProviderAccountSwitch` (4 copies), `routeReason` (2), `launchAction` literals, `dirtyState` (3), `scope.granularity` (2), `worktreeLeaseModes` vs the literal list in `ui-read-model.ts:214`; the hard-stop `LimitType` set copied into `coordinator/adaptive-concurrency.ts:8-14`, `coordinator/cooldowns.ts:14-20`, and `rate-limit-catalog/retry-guardrails.ts:9-15`.
- The lock-file name `coordination.lock` is a string literal in four files across two packages; it works because they agree by coincidence. Add `coordinationLockPath` to `getStateLedgerPaths`.

### 3.4 Library, not runtime: everything is injected

`omnigent-transport` never imports `node:child_process`; spawn, kill, and the CLI command runner are injected callbacks, so the argv/env/cwd/pipe handling that the docs call "process ownership" lives in whichever consumer supplies them (none in this repo). The same is true of the retry counter, the cooldown sweep, and lease renewal. This is a legitimate design for a library, but the docs describe it as a running system. Decide which it is, and if it is a library, add a reference consumer (even a thin `omniagent-plus run` command) so the integration is exercised.

## 4. Package findings

### 4.1 `@omniagent-plus/state-ledger`

**SL-1 (P0) Append is O(N²) and indexes are write-only.** `appendRecord` (`append-only-store.ts:295-343`) calls `scanLedgerFile`, which reads the whole file and zod-parses every line, then `buildIndexSnapshot` over all records, then three pretty-printed `writeJsonAtomic` calls and a manifest write. `initialize()` (`237-261`) does the same on every `AuditLedger.open`, i.e. on every CLI invocation. The three index files are never read by any production code (only `retention.test.ts` reads one). Fix: keep `lastSequence` in the manifest as the only per-append metadata write, drop or lazily build the indexes, and make the append path `open → write line → fsync → close`. If indexes are wanted, make them incremental and actually use them in `queryRecords`.

**SL-2 (P0) Stale lock bricks the state root.** `withFilesystemLock` (`append-only-store.ts:79-113`) creates `locks/store.lock` with `wx` and unlinks it in `finally`. There is no PID, timestamp, or heartbeat in the file and no steal logic, so a SIGKILL, OOM kill, or power loss while any command holds the lock leaves every later `AuditLedger.open` (including `sessions list`) failing after 2 s with "Timed out waiting for state-ledger lock". `worktree-leasing/src/locks.ts` has the same defect even though it writes `expiresAt` into the lock file (nothing honors it). Fix: write `{pid, hostname, acquiredAt}` into the lock, treat a lock whose PID is dead on the same host or whose age exceeds a bound as stealable, and document a `--break-lock` escape hatch.

**SL-3 (P1) No `fsync` anywhere.** `writeFile(..., {flag: "a"})` and `writeJsonAtomic` (temp + `rename`) are safe against process crash but not OS crash or power loss; the docs claim "crash recovery". Use a file handle with `handle.sync()` (or `datasync`) before close on the ledger append and on the temp file before rename, and `fsync` the directory after rename.

**SL-4 (P1) Sequence numbers can duplicate after a crash.** `nextSequence = manifest.lastSequence + 1` (`305`) but the manifest is written after the ledger append (`334`); `initialize()` reconciles `recordCount` but not `lastSequence` (`254-259`). Derive the next sequence from `scan.records.at(-1)?.sequence` and assert monotonicity on open.

**SL-5 (P1) Schema-validation failure on the last line is treated as a torn write and truncated.** `scanLedgerFile` (`146-159`) catches both `SyntaxError` and `ZodError` for the last line and returns a `truncateOffset`; `initialize()` and `appendRecord` then call `truncate()`. A future schema tightening would silently delete the newest record and count it as a recovered tail truncation. Only `SyntaxError` on an unterminated final line should truncate; a schema failure should fail closed with a typed error. A corrupt middle line currently throws a raw `ZodError`/`SyntaxError` with no typed error.

**SL-6 (P1) Read-only commands mutate the store.** `sessions list/show` (`sessions.ts:41,69`), `identities preflight` (via `IdentityProfileStatusStore.open`, `status-store.ts:24`), and `route-task` even in dry-run (`route-task.ts:157`) all open the ledger via `AuditLedger.open`, which takes the lock and rewrites the three index files and the manifest. `control snapshot` correctly uses the lock-free `replayUiControlSnapshotFromStateRoot` (`replay.ts:600-604`), `classify-limit` opens the ledger only with `--record`, and the worktree lease manager opens it lazily. Add a read-only open mode that neither locks nor writes.

**SL-7 (P1) Inconsistent replay semantics.** `replaySession` and `sessions show` pick the *first* `session` record (`replay.ts:575`, `cli/src/commands/sessions.ts:73`); `buildUiControlSnapshot` picks the *latest* (`latestByKey`). `replaySession` also returns every route decision in the ledger regardless of session and performs three full scans. `sessions list` performs one full scan per session concurrently (`sessions.ts:52-57`).

**SL-8 (P1) `CoordinationStore` (coordination.ts) is dead code with bugs** (see §3.3). Also `readCooldownMap`/`readLeaseMap` return `{}` on any schema failure (`127-139`), so a corrupt cooldown file silently clears every cooldown.

**SL-9 (P1) Retention is not state-aware.** `applyRetentionPolicy` (`retention.ts`) prunes by kind and age only; with `maxAgeMs` set and the default `keepLatestPerKind: 0`, it can prune a `session` record while its `turn` and `runtime_event` records remain, orphaning them in replay. Protect records referenced by still-active sessions/leases.

**SL-10 (P1) Evidence store persists unsanitized paths and labels** (`evidence-store.ts:54-59`): `path` and `label` bypass `sanitizeMetadataPath`/`sanitizeMetadataText`, so absolute or `.env` paths can be persisted as `evidence_ref` despite `docs/durable-state.md`. Its own `SECRET_PATTERNS` list is the third divergent scanner.

**SL-11 (P1) Supabase coordination backend.**
- The client's wall clock is authoritative: `createLeaseFromAcquireRequest` (`worktree-leasing/src/lease-store.ts:150`) stamps `acquired_at` from `nowIsoString()`, `SupabaseLeaseStore.acquire` passes it as `now` (`supabase-lease-store.ts:63`), and `coordination_acquire_lease` runs `coordination_expire_leases(now_at)` with it (`supabase/migrations/…:148,160`). A coordinator with a fast clock expires everyone's leases. Use `now()` server-side and accept a client `now` only in a test-only RPC or behind a flag.
- `coordination_list_messages` and `coordination_query_leases` aggregate the whole table with no limit or cursor; `coordination_inbox_messages.acknowledged_at` is never set by any function; `coordination_lease_events` has no index on `lease_id`/`created_at` and no retention.
- `createSupabaseCoordinationChannelFromEnv` treats an empty-string env var as configured.
- The migration itself is well designed: advisory transaction lock, atomic acquire via upsert, RLS enabled, table and function grants revoked from `anon`/`authenticated` and granted only to `service_role`.

**SL-12 (P2)** `storeManifestSchema.schemaVersion` is any positive integer, so a manifest from a future version passes as current (`migrations.ts:107-117`). Fail closed on `schemaVersion > CURRENT`.

### 4.2 `@consiliency/runtime-provider` (core-contracts)

**CC-1 (P0) Secret scanner false negatives.** Running the built package against 23 secret-shaped strings, `sanitizeMetadataText` accepted 18 (Appendix A), including the repository's own Supabase service-role variable with a JWT value, bare JWTs, `AKIA…`, `AIza…`, `glpat-`, `npm_`, `https://user:pass@host`, `{"token": "…"}`, `password: …`, `X-Api-Key: …`, `Cookie: …`, `client_secret=`, `secret_key=`, `passwd=`, `MY_SERVICE_TOKEN=…` mid-line, `ANTHROPIC_API_KEY=…` mid-line, and the PKCS#8 header `-----BEGIN PRIVATE KEY-----`. Root causes in `redaction.ts:15-58`: key-name patterns require `=` (no `:`), `\b` never fires after `_` so `X_TOKEN=` is missed, `envDumpPattern` is anchored to line start and case-sensitive, the private-key regex requires a type word, and there are no JWT/AWS/Google/URL-userinfo patterns. `isSecretLikePath` misses `.npmrc`, `.netrc`, `.git-credentials`, `.kube/config`, `id_ecdsa`, `.docker/config.json`, `.jks`, `.pfx`. Fix: one scanner (see §3.3) with key-name matching on `[=:]`, `(?<![A-Za-z0-9_])` instead of `\b`, prefix patterns for the common token families, a JWT pattern, URL userinfo, and a corpus-driven test.

**CC-2 (P0) Schema-level bypass.** `handoffPacketSchema` (`handoff-packet.ts:297-352`) and every schema that embeds it (`agentSessionSchema`, `stateLedgerRecordSchema`, `createSessionRequestSchema`) are shape-only; all content scanning lives in `buildHandoffPacket`'s normalizers (`365-528`). `stateLedgerRecordSchema.parse` on ledger read (`append-only-store.ts:147`, `replay.ts:92`) never re-scans. A hand-built packet or a record written by another tool round-trips secrets verbatim into `renderHandoffPrompt`. Add a `.superRefine` content guard to `redactedTextSchema`/`handoffPacketSchema`, or scan on read.

**CC-3 (P1) No recursive scanner and unscanned `unknown` fields.** `metadata: Record<string, unknown>` on sessions/turns/requests (`types.ts:97`), `CoordinationMessage.body`, `argumentsRedacted`/`outputRedacted` (`events.ts:18,130`, typed `unknown`) all pass through unscanned. The only recursive walker is in identity-isolation.

**CC-4 (P1) No `.strict()` anywhere** in the package; unknown fields (and typos such as `packetID`) are silently stripped. Most schema/type pairs are hand-duplicated without `z.ZodType<T>` linkage (only `errors.ts:65` and `schemas.ts:157` have it; `schemas.ts:133` uses an `as` cast that suppresses drift), while `ui-read-model.ts` and `coordination-contract.ts` use `z.infer`. Pick one pattern (prefer `z.infer` plus `satisfies`) and apply `.strict()` on wire and ledger schemas.

**CC-5 (P1) `sanitizeWorkspacePath` (`redaction.ts:181-194`) allows absolute paths**, unlike `sanitizeMetadataPath`, so `/home/<user>/…` flows into handoff prompts sent to another provider and into the UI snapshot; the repository's own fixtures carry `/home/viperjuice/code/omniagent-plus`. Decide whether workspace paths are metadata; if they are, relativize them to the repo root.

**CC-6 (P1) Fake stream and provider bugs.** `FakeEventStream.read()` (`fake-event-stream.ts:285-303`) only checks the first returned event for a sequence gap; interior gaps pass despite `docs/lifecycle-and-events.md` calling them protocol failures. Concurrent `closeSession` double-emits `runtime.session.closed` (`fake-provider.ts:261-285`). The fake never reaches `created`/`starting`/`cancelling`, so downstream tests built on it never exercise those documented states.

**CC-7 (P2)** `sendTurnRequestSchema.message` has no `.min(1)`/`.max` (`schemas.ts:98`). `RedactedText.truncated` is `boolean` in the interface but `literal(false)` in the schema; oversize content throws instead of truncating, so one long excerpt aborts `buildHandoffPacket`. `providerPayloadPatterns` includes `/"messages"\s*:\s*\[/`, which will reject any legitimate `{"messages": [...]}` JSON (the coordination inbox shape). Types reachable through the public API but not exported: `RuntimeHeartbeatEvent`, `NormalizedFixtureResult`, `CooldownState`, `SecretRef`, `HandoffReason`/`HandoffStatus`; helpers `isSecretLikePath`, `validateHandoffContextPolicy`, `DEFAULT_*_MAX_BYTES` are not re-exported.

### 4.3 `@consiliency/omnigent-transport`

**TR-1 (P0) `redaction: "metadata_only"` is hardcoded on every event** (`event-mapper.ts:578`, `history-mapper.ts:159`), including `runtime.text.delta` and tool call/result payloads. Nothing tests `.redaction`. Either compute the posture from the event type (text and tool payloads are `content_allowed` or must be redacted) or stop claiming `metadata_only` downstream.

**TR-2 (P0) `baseUrl` path prefix is dropped.** `url()` (`http-client.ts:802-804`) does `new URL("/v1/…", baseUrl)`; `new URL("/v1/sessions", "https://api.example.com/gateway/")` yields `https://api.example.com/v1/sessions`. Any reverse-proxy or gateway prefix silently routes to the wrong path. Join relative to the base path instead.

**TR-3 (P0) No request timeout, no retry.** `requestJson` has no `AbortController`/deadline (the only abort wiring is the caller-signal bridge for the stream, `553-568`); `OmnigentHttpClientOptions` has no `timeoutMs`. A hung server blocks `createSession`/`sendTurn`/`getHistory` forever. The failure mapper computes `retryable` and `retryAfterSeconds` that nothing in the package uses.

**TR-4 (P1) Unbounded memory growth.** `OmnigentHttpProvider` holds 25 Map/Set fields; `closeSession` (`http-provider.ts:1122-1183`) only sets `state: "closed"` and never deletes any entry; `creates`/`sends` idempotency maps are deleted only on failure (`323`, `345`). Several helpers do linear scans with a `${sessionId}:` prefix over process-wide sets (e.g. `hasCancelledTurnQuarantine`, `1977-1980`). `event-mapper.ts` `seenItemIds`, `historicalItemIds`, `emitted*` sets and `emittedTextByTurnId`/`ByMessageId` (which retain full text) are never deleted; the SSE normalizer's `knownResponseIds`/`responseAliases` grow per turn. Evict on session close and bound per-session history.

**TR-5 (P1) SSE parser.** `buffer` (`sse-stream.ts:618-647`) has no maximum frame size; `data:` values are `.trim()`ed (spec strips one leading space); line splitting is `/\r?\n/` so bare-CR terminators are not handled. Every one of the 29 parser tests delivers the payload in a single `enqueue` (`sse-stream.test.ts:22-29`), so chunk-boundary accumulation is never exercised, and there are no abort/cancel tests.

**TR-6 (P1) Silently dropped event types.** The mapper's switch handles 19 of the 54 stream event types and `default: return []` (`event-mapper.ts:201`) discards the rest, including `response.elicitation_request`, `response.elicitation_resolved`, and `response.policy_denied`, which `sse-stream.ts` fully parses. Only the `browser.action_request` drop is documented. Emit a neutral `runtime.provider.unmapped` metadata event or document each drop.

**TR-7 (P1) Process manager and hybrid provider.** `enforceTimeoutCleanup`/`enforceParentDeathCleanup` have no production caller (§3.2); `ensureRunning` (`process-manager.ts:67-82`) and `ensureReady` (`hybrid-provider.ts:140-147`) have no in-flight memoization, so concurrent cold calls double-spawn. `cancelTurn`/`closeSession` throw `backend_capability_missing` unless both `withExclusiveSessionLease` and `sessionMutationFenceStore` are injected, so a provider built with only `{baseUrl}` can create and send but never cancel or close. `hybrid-provider.test.ts` has one test.

**TR-8 (P1) CLI client.** `parseJsonResult` (`cli-client.ts:68-74`) does a raw `JSON.parse(stdout)`; malformed output escapes as a native `SyntaxError` instead of a `RuntimeFailure`. `commandFailure` always yields `backend_unavailable` while the purpose-built `mapCliFailure` (`failure-mapper.ts:134`) goes unused. No test exercises a non-zero exit.

**TR-9 (P2)** `{...common, ...data}` (`http-client.ts:301`) lets a nested `data` key override `id`/`status`/`type`; `toHttpError` retains an unbounded `response.text()` body (`781-790`); `http-client.ts:583` throws a bare `Error`; no `401` branch in `failure-mapper.ts`; `fake-omnigent-server.ts` (test-only, 543 lines) is compiled into `dist/` and shipped in the tarball, and its `void this.handleRequest()` (`171`) has no catch; `capability-probe.ts` performs no live probing or version comparison (`newer_stable_release` is a hand-set fixture boolean). The package hand-rolls all wire validation while the rest of the repo uses zod. Decomposition targets: `streamEvents` (`606-878`), `cancelTurnWithExclusiveLease` (`922-1121`), `sendTurnOnce` (`443-561`), `OmnigentSseNormalizer.normalize` (`312-570`), `mapOmnigentConversationHistory` (`134-337`), `mapTextDelta` (`206-320`, which fuzzy-matches deltas with `startsWith`/`endsWith`).

### 4.4 `@omniagent-plus/coordinator` and `@omniagent-plus/rate-limit-catalog`

**CO-1 (P0) Cooldowns never expire.** `evaluateCooldownState` (`cooldowns.ts:49-81`) reads only `.active === true`; `resetAt` is passed through and never compared with the clock anywhere in the repo, and no writer ever sets a provider cooldown to `active: false`. `route-task` picks the latest cooldown record per provider and feeds it straight to the pool. Once a provider is cooled down it stays blocked until someone edits the ledger.

**CO-2 (P0) Silent identity substitution.** `planRoute` (`route-planner.ts:332`) does `findPreferredCandidate(input) ?? firstCandidate`; a `preferredIdentityProfileId` that is not in the pool is replaced by the top-ranked candidate, `fallbackUsed` is `false`, and `routeReason` is persisted as `explicit_override`. Fail closed (or record `fallbackUsed: true` with reason `preferred_identity_missing`).

**CO-3 (P0) Send-turn launch gate skips the downgrade check.** `createSessionWithRouteDecision` runs `assertCreateSessionLabels` then `assertLaunchDecision`; `sendTurnWithRouteDecision` (`launch-gate.ts:110-116`) runs only the latter, so silent harness/provider/identity downgrades are not blocked for turns despite `docs/coordinator-routing.md`'s blanket claim.

**CO-4 (P1) No exponential backoff.** `docs/rate-limit-taxonomy.md` promises it for `overload_or_transient`; neither guardrail computes a delay (`nextDelaySeconds` is the provider's `retryAfterSeconds` or `undefined`), so up to three retries can fire back to back. Two disagreeing retry-storm thresholds exist (per-type budget 1-3 with default 0 in rate-limit-catalog; flat 2 in the coordinator's no-classification path). Neither aggregates attempts across identities; the counter is caller-supplied and nothing maintains it.

**CO-5 (P1) `Retry-After` parsing** (`rules.ts:215-218`, `332-335`): `parseInt` only, so HTTP-date values become `undefined` and their presence suppresses the text fallback; negative values pass unclamped into `nextDelaySeconds`.

**CO-6 (P1) Raw stderr/stdout excerpts in classifications.** `buildClassification` (`rules.ts:526-540`) stores 160-char raw excerpts with no secret scrubbing. The CLI re-sanitizes before `--record` (`classify-limit.ts:8-22`), so the exposure is for library consumers persisting `LimitClassification` directly. `safeHeaderPattern` (`rules.ts:31`) is an unanchored substring match, so any header whose name contains `reset` (e.g. `x-preset-id`) passes the allowlist.

**CO-7 (P1) `incrementActiveTurns` cannot decrement** (`active-turns.ts:6-12`, `54`): the delta is clamped to `>= 0`, so a `-1` adds 0. No production caller; only `delta: 2` is tested.

**CO-8 (P2)** `replay.ts:51-78` explains every historical decision with the single latest classification; `route-store.ts:52-59` and `replay.ts:55-58` `parse` inside `map`, so one malformed record aborts a task's replay. `rules.ts:466-474` (403 + billing) is unreachable. Confidence tiers in the docs (0.85-0.99 requires status, regex, and reset evidence) are contradicted by base confidences of 0.86 for a single keyword hit. `adaptive-concurrency.ts` floors health-based targets at 1, has no hysteresis, and no `isFinite` guard. `planRoute` throws a bare `Error` on an empty pool (`326-329`). `rate-limit-catalog/src/fixtures.ts:14` resolves `../../../fixtures/rate-limits` (repo root) while `files` is `["src"]`. `retryBudgetByType` defaults an unmapped type to 0 and mislabels the first retry as a storm. Tests are fixture happy paths only; no boundary or property tests for scoring, backoff, or thresholds. Positive: the same-provider account-hop gate is enforced by default (`route-planner.ts:43-70`), `lease-arbiter` fails closed on hard mode with an unavailable backend and does not swallow exceptions, and none of the classifier regexes are vulnerable to catastrophic backtracking.

### 4.5 `@omniagent-plus/worktree-leasing`

**WL-1 (P1) Cleanup deletes an unvalidated path.** `cleanupLeasedWorktree` (`cleanup.ts:94-101`) removes `options.worktreePath ?? lease.path` with `git worktree remove` when a repo root is known, otherwise with `rm -rf`. The path comes from the JSON registry (or a caller option) and is never re-validated against a worktree root; `assertPlacementWithinRoot` (`mounted-workspace.ts:86-114`) exists but is only applied at placement time. The `rm` fallback also leaves stale `.git/worktrees/*` metadata. Re-validate the path against the placement root and against `git worktree list --porcelain` before deleting, and never fall back to `rm -rf` silently.

**WL-2 (P1) The CLI's fencing-token check is tautological.** `worktrees cleanup` passes `activeFencingToken: stored.lease.fencingToken` (`cli/src/commands/worktrees.ts:100`) read from the same registry that `cleanup.ts:42` compares it against, so it can never mismatch. Either require the token as an argument (proving the caller is the holder) or drop the check from the CLI path and document that cleanup is an operator override.

**WL-3 (P1) A lease whose directory has vanished can never be cleaned.** `inspectWorktreeDirtyState` returns `unknown` when the directory is missing (git fails, `git.ts:96-103`), and cleanup blocks on `unknown_dirty_state` (`cleanup.ts:55-59`). There is no `--force` or missing-directory path, so an out-of-band deletion leaves a permanent active lease.

**WL-4 (P1) Registry, active map, and ledger can diverge.** `acquireLease`/`renewLease` perform three separate writes under the lock (`lease-manager.ts:182-184`, `237-239`): registry, active map, then ledger append. A crash after the registry write leaves a lease that stale recovery can never reclaim, because `evaluateStaleLeaseRecovery` requires `ledgerEvidencePresent` (`stale-recovery.ts:32-36`). `releaseLease` (`245-278`) appends no ledger record at all, so the ledger and the UI snapshot show released leases as active forever. Add a `worktree_lease_released` record (or a `status` field on the lease record) and write the ledger first.

**WL-5 (P1) TTL expiry never frees a branch.** `evaluateBranchCollision` (`branch-policy.ts:16-32`) treats every `status: "active"` record as blocking regardless of `expiresAt`; only release or stale recovery clears it. Combined with the caller-driven heartbeat (§3.2) and the 300 s default TTL, the TTL is effectively decorative for collisions while still gating recovery.

**WL-6 (P1) Corrupt state is read as empty.** `readRegistry` (`lease-manager.ts:317-323`), `readActiveLeaseMap` (`325-331`), and `LocalLeaseStore.readState` (`lease-store.ts:~350`) return an empty structure on any parse or schema failure, so a corrupt file silently forgets every lease and permits double acquisition. Fail closed with a typed error.

**WL-7 (P2)** `LocalLeaseStore` appends an event to `consiliency-leases.json` on every acquire/renew/release/expire and never prunes, so the file grows without bound and every operation reads and rewrites it; `query()` takes the exclusive lock for a read; re-acquiring an existing `lease_id` by the same holder returns `conflict`. `process-liveness.ts` treats `EPERM` as alive (correct) but has no start-time or boot-id, so a reused PID blocks cleanup (fail closed, acceptable). `diff-summary.ts` counts untracked files in `changedPaths` but `git diff --numstat` excludes staged and untracked changes, so additions/deletions undercount. `locks.ts` has 28% statement coverage and `branch-policy.ts` 52%.

### 4.6 `@omniagent-plus/cli` and `@omniagent-plus/identity-isolation`

The CLI is in better shape than the docs suggest: per-command options use Node's `util.parseArgs` in strict mode (unknown flags, missing values, and `--flag=value` are handled correctly, verified empirically), exit codes are set via `process.exitCode`, every command result passes through a zod schema, human output is rendered from the same envelope as JSON with sorted keys, and `health` and `control snapshot` create nothing on disk.

**CLI-1 (P1) `route-task --record` has side effects beyond persistence.** With a coordination scope it runs `LeaseArbiter.arbitrate` (`route-task.ts:130-142`), which acquires a real lease in the local or Supabase store and may send a yield message to the inbox. README and `docs/architecture.md` describe `--record` as "persists metadata-only records" and promise "no provider launch side effects"; a lease acquisition is a coordination side effect and should be documented (or split into a separate flag).

**CLI-2 (P1) Failure causes are discarded.** The dry-run coordination probe (`route-task.ts:120-127`) and every `SupabaseLeaseStore` method collapse all errors (auth, CHECK violations, network) into `coordination_unavailable`/`backend-unavailable` with no diagnostic. Preserve a bounded, sanitized cause in the result.

**CLI-3 (P1) `identities preflight` runs with an empty host environment.** `identities.ts:109` passes `hostEnv: {}`, so `launchEnvKeys` is always empty and the persisted preflight evidence about the env allowlist is vacuous. It also appends a status record on every invocation of what reads like a check command.

**CLI-4 (P2)** The error envelope on a parse failure reports `command: "unknown"` and the default state root even when `--state-root` was supplied (`runtime.ts:53,85`). `--preferred-provider`/`--preferred-harness` are passed through `as never` casts (`route-task.ts:216-217`) without enum validation, so a typo silently routes to the top candidate (see CO-2). Active-turn accounting in `route-task` comes from operator-supplied `--active-sessions/--active-turns` on the last preflight, not from observation. `health` prints absolute, username-bearing state paths while the rest of the surface rejects absolute paths as non-metadata. Phase labels (`IF-0-CLI-11`, `IF-0-UI-12`) are baked into result schemas as `z.literal` (`cli/src/types.ts:59,131`), so every phase relabel is a wire-format change.

**ID-1 (P1) Cross-package relative import.** `process-profile.ts:2` and `omnigent-isolation-policy.ts:2` import `OmnigentProviderMode` from `"../../omnigent-transport/src/types.js"` instead of the declared dependency `@consiliency/omnigent-transport`. It is type-only, so it compiles today, but it breaks if the transport package is ever consumed from `dist`, and the repo's dependency-direction tests cannot catch it because they allow any `../` specifier.

**ID-2 (P2)** The environment model is a true allowlist (`environment.ts:24-29`) and `host_env` is correctly restricted to development profiles with a non-empty allowlist; there is no denylist for dangerous keys (`PATH`, `LD_PRELOAD`, `NODE_OPTIONS`, `GIT_*`) and no value validation. `profile-loader.ts` validates with the schema and runs the secret scanner (good) but has no duplicate-id detection and surfaces JSON syntax errors raw. `preflight.ts` checks cooldown `.active` only (CO-1 again). `scanForSecretLeaks` returns a 48-character sample of each detected secret (`secret-redaction.ts:56-58`), which is the whole token for most formats; callers must never log it.

### 4.7 Build, CI, packaging, and repository hygiene

**HY-1 (P0) No pull-request CI.** `.github/workflows/publish.yml` is the only workflow and runs on release/dispatch. Nothing runs lint, typecheck, or tests on a PR or on `main`, and the publish workflow's `verify` job runs `pnpm -r build`, `test:pack`, and `pnpm test` but not `pnpm lint` or `pnpm typecheck`. CODEOWNERS is advisory. Add a `ci.yml` on `pull_request` and `push` to `main` that runs the full gate from the README, and make the publish job depend on the same gate.

**HY-2 (P0) Three public npm packages have no license.** No root `LICENSE` file, and none of the ten `package.json` files has a `license` field (the `@consiliency/contract` dependency is MIT). Publishing without a license leaves consumers with no usage rights. Also missing on every package: `description`, `engines`, `sideEffects`, `publishConfig`; the two older public packages still point `repository.url` at `ViperJuice/omniagent-plus` while the transport package points at `Consiliency/omniagent-plus`.

**HY-3 (P1) Committed build artifacts and machine-local state.** `conformance-agent-harness.log`, `conformance-mutation.log`, `dist-build.log`, `ts-conformance.log`, and `scripts/smoke-fake-provider.out` are committed and contain `/mnt/HC_Volume_105438154/...` paths from another machine. `.advisor-panel/` and `.dev-skills/` (56 files, ~500 KB of agent transcripts and logs) and `plans/manifest.json` (the most-changed file in the repo, 32 commits) embed `/home/viperjuice/...` paths. `.gitignore` lacks `*.log`, `coverage/`, and `.phase-loop/` even though `eslint.config.mjs` ignores the last two. Fixtures use `/home/viperjuice/code/omniagent-plus` as sample paths. No secrets were found in tracked files.

**HY-4 (P1) Packaging.** `fake-omnigent-server.ts` (test-only) is compiled and shipped in the transport tarball. `@types/node` is a runtime dependency of the transport package; `tsx` is a runtime dependency of the CLI. `smoke-packed-omnigent-transport.mjs` hardcodes the expected version `"0.6.0"` and must be edited for every release. `rate-limit-catalog/src/fixtures.ts` resolves fixtures outside its `files` allowlist. The two `conformance.v0.1.json` copies (package and `examples/`) are byte-identical duplicates. The fixture copy into `dist/fixtures` and the two-location fallback in `contract-fixtures.ts` do work for consumers.

**HY-5 (P1) Toolchain gaps.** ESLint has no type-aware rules (`parserOptions.project` is unset), so `no-floating-promises`, `no-misused-promises`, `switch-exhaustiveness-check`, and `require-await` never run; the codebase currently has no floating promises, which makes now the cheap moment to enable them. Vitest has no coverage configuration, no per-test timeout, and no pool isolation settings; coverage measured for this review is 86.5% statements and 82.2% branches. TypeScript project references are not used, so each of the ten `tsc -p` runs re-checks its dependencies through `src` exports; private packages' `build` script is a no-emit typecheck. `tsconfig` lists `vitest/globals` in `types` although every test imports from `vitest` explicitly.

**HY-6 (P2)** Thirteen test files read README/docs prose or grep source text as assertions (for example `coordinator/src/phase-verification.test.ts:52` asserts that the package source does not contain `process.env`); those are lint rules and should move to ESLint `no-restricted-syntax`/`no-restricted-imports`. The dependency-direction tests in both adapter packages allow any relative specifier and so cannot detect ID-1. `check-omnigent-openapi-delta.mjs` fetches from GitHub at verification time and is not wired into CI. The adapter packages themselves (`phase-loop.ts`, `governed-pipeline.ts`) are pure mapping functions that sanitize free text; no defects found.

## 5. Test strategy

What exists is good at what it does: fixture-driven conformance against pinned Omnigent tags, cross-process lock and lease tests that spawn real Node processes (`state-ledger/src/cross-process.test.ts`, `worktree-leasing/src/locks.test.ts`, `race-proof.test.ts`), and a real `node:http` fake server for the transport. The gaps are systematic rather than local:

- **No end-to-end path.** Nothing drives provider → ledger → CLI. The highest-impact findings (§3.1, §3.2, SL-1, CO-1) are invisible to the suite because each layer is tested against fixtures of the layer below.
- **Happy-path fixtures, no boundaries.** No property or boundary tests for scoring, backoff, thresholds, expiry math, or parsers; no negative `Retry-After`, no empty identity pool, no unknown preferred identity, no chunk-split SSE frames (every SSE test enqueues one chunk), no abort/cancel tests for streams or HTTP.
- **Large multi-assert tests.** Many files have one to three `it` blocks with dozens of assertions; a single failure hides the rest. `http-provider.test.ts` is 7,368 lines.
- **Low-coverage hot spots** (from the coverage run): `state-ledger/coordination.ts` 11%, `worktree-leasing/locks.ts` 28%, `branch-policy.ts` 52%, `coordinator/launch-gate.ts` 54% (the downgrade checks at lines 58-98 are partly uncovered), `cli/errors.ts` 61%, `cli/commands/coordination.ts` 64%, `transport/cli-client.ts` 68%, `fake-provider.ts` 70%, `lease-arbiter.ts` 71%, `git.ts` 72%.
- **Docs-as-tests.** Assertions on README wording keep prose and code aligned, but they also make docs edits break the build and do not verify behavior.
- **Cross-process tests spawn real Node processes with wall-clock waits** (`locks.test.ts` 2.3 s, `cross-process.test.ts` 4.6 s). They are valuable; keep them, but mark them as integration tests with an explicit timeout so a slow CI runner does not flake, and note that `locks.ts` shows 28% coverage precisely because its lock path runs in child processes that the coverage provider does not instrument.
- **Recommended configuration**: `coverage.provider: "v8"` with per-package thresholds, an explicit `testTimeout`, `pool: "forks"` for the process-spawning suites, and a `test:unit` / `test:integration` split.

Recommended additions, in order: (1) one integration test that runs the fake Omnigent server through `OmnigentHttpProvider` into a real `AuditLedger` and then through `control snapshot`; (2) a shared secret-corpus fixture (positive and negative samples) executed by all scanner call sites; (3) crash-injection tests for the ledger (kill between append and manifest write, stale lock present, torn last line vs. schema-invalid last line); (4) chunk-boundary and abort tests for the SSE parser; (5) property tests (`fast-check`) for `planRoute`, `evaluateAdaptiveConcurrency`, the retry budgets, and `Retry-After` parsing.

## 6. Documentation claims that do not match the code

| Document | Claim | Reality |
|---|---|---|
| `docs/hardening-readiness.md:10-11` | Crash recovery cleans up owned Omnigent processes after heartbeat timeout and parent death | Primitives exist; nothing calls them in production (§3.2) |
| `docs/hardening-readiness.md:8` | Retry storm guardrails stop repeated backend failures | Pure functions; no maintained counter, no backoff (CO-4) |
| `docs/durable-state.md:29` | Sidecar indexes are a cache rebuilt when startup detects drift | Rebuilt unconditionally on every open and append; never read (SL-1) |
| `docs/durable-state.md:7` | "crash recovery ... proven" | No fsync; stale lock has no recovery; duplicate sequences after a crash (SL-2..SL-4) |
| `docs/durable-state.md`, `docs/security-and-secrets.md` | Evidence stores only bounded, redacted, metadata-only refs | `evidence-store.ts` persists unsanitized `path`/`label` (SL-10) |
| `docs/security-and-secrets.md:10-11` | Rejects bearer tokens, API keys, auth headers, password/token/credential fields | 18 of 23 secret shapes pass, including colon-form headers and JWTs (CC-1) |
| `docs/handoff-packets.md:50-51` | The packet builder rejects secrets before packet construction | True for `buildHandoffPacket`; the exported schema and the ledger read path do not (CC-2) |
| `docs/lifecycle-and-events.md` | Missing sequence numbers are protocol failures | Fake stream only checks the first event of a window (CC-6) |
| `docs/coordinator-routing.md:27-29` | Silent downgrade is always blocked by the launch gate | Only for create-session; send-turn skips the check (CO-3) |
| `docs/coordinator-routing.md:44-47` | Replay stays metadata-only without raw provider payloads | Library-level `LimitClassification.rawSignal` keeps raw excerpts (CO-6) |
| `docs/rate-limit-taxonomy.md:73` | Exponential backoff for `overload_or_transient` | None exists (CO-4) |
| `docs/rate-limit-taxonomy.md:27-31` | 0.85-0.99 confidence requires status, regex, and reset evidence | Single keyword hit yields 0.86 (CO-8) |
| `docs/ui-read-model.md`, `docs/architecture.md` | `redactionPosture: "metadata_only"` on the control snapshot | Transport labels raw text deltas `metadata_only` (TR-1); workspace paths are absolute (CC-5) |
| `docs/omnigent-transport.md:59` | The stream "closes on every exit" | Only through `streamSession`'s `finally`; direct `openSessionStream` callers must call `close()` themselves (TR-9) |
| README, `docs/architecture.md` | `route-task` has no launch side effects; `--record` only persists records | `--record` with a coordination scope acquires a lease and may send inbox messages (CLI-1) |
| README verification section | `phase-loop validate-roadmap specs/phase-plans-v1.md` | External tool not in the repo; the documented gate cannot be run from a clean checkout |

## 7. Efficiency improvements

1. **Ledger append path** (SL-1): measured per-append cost of 3.5 ms at 100 records, 6.3 ms at 1,600, 10.2 ms at 3,200, and 18.8 ms at 6,400 (Appendix B), i.e. the cost doubles with each doubling of the ledger because the whole file is re-read and re-validated each time. Target: constant-time append (open handle, write line, fsync) with `lastSequence` from the manifest, validated on open only.
2. **Drop or make incremental the three index files** (SL-1); they cost three pretty-printed JSON rewrites per append and nothing reads them. If queries by session/task are needed, keep a single compact index updated incrementally, or simply scan (the scan is already what `queryRecords` does).
3. **Read-only open mode** (SL-6) so `sessions list`, `identities preflight`, and `route-task` stop taking the lock and rewriting files; and a single scan per command instead of one per session (`sessions.ts:52-57`) or three per replay (`replay.ts:568-592`).
4. **Bound in-memory growth** in the transport (TR-4): evict per-session maps on `closeSession`, cap dedupe sets per session, and stop retaining full text in `emittedTextByTurnId`/`ByMessageId`.
5. **SSE buffer cap and request timeouts** (TR-3, TR-5) to bound memory and latency under a slow or hung server.
6. **LocalLeaseStore event log** (WL-7): prune or rotate `events`, and avoid taking the exclusive lock for reads.
7. **Retention** (SL-9): single pass instead of a filter+sort per kind, and state-aware protection.
8. **Build**: TypeScript project references (or a single root `tsc -b`) to stop re-checking dependency sources ten times; the private packages' `build` scripts are currently no-emit typechecks and can be removed or renamed.
9. **Supabase**: add `limit`/cursor to `coordination_list_messages` and `coordination_query_leases`, an index on `coordination_lease_events(lease_id, created_at)`, and retention for events and acknowledged messages.
10. **Idempotency caches** (TR-4): give `creates`/`sends` an LRU bound with a TTL instead of keeping every successful key forever, and index `provisionalTurnAliases`/`cancelledTurnQuarantineKeys` by session instead of scanning with a string prefix.
11. **Compact JSON for machine-read files**: every sidecar, manifest, registry, and lease-state write uses `JSON.stringify(value, null, 2)`, roughly doubling bytes and parse time for files no human reads.
12. **Repeated CLI reads**: a small cache keyed by ledger `mtime`/size would make repeated reads on an unchanged ledger free; today every command re-parses the whole file.

## 8. Recommended roadmap

**P0, before publishing another release or building on the ledger**
1. Add PR CI running the full gate; make publish depend on it (HY-1). Add a LICENSE and `license` fields; fix repository URLs (HY-2).
2. Rewrite the ledger append path: constant-time append with fsync, sequence derived from the tail, torn-write vs schema-failure distinction, stale-lock detection with PID/timestamp and a documented `--break-lock`, and a read-only open mode (SL-1..SL-6).
3. Consolidate the secret scanner into core-contracts with the recursive walker, the missing token families, colon/underscore-aware key matching, JWT and URL-userinfo patterns, a corpus test, and a content guard on the persisted schemas (CC-1, CC-2, CC-3; SL-10).
4. Fix the coordinator P0s: cooldown expiry against `resetAt` with a writer that deactivates; fail closed on an unknown preferred identity; run the label check in `sendTurnWithRouteDecision` (CO-1..CO-3).
5. Fix the transport P0s: compute `redaction` per event type; join URLs relative to the base path; add request timeouts (TR-1..TR-3).
6. Wire the provider to the ledger through one recording decorator and add the first end-to-end test (§3.1).

**P1, next milestone**
7. Build (or explicitly scope out) the supervising loop: process-manager tick, cooldown sweep, lease renewal timer, retry counter; then re-word `docs/hardening-readiness.md` to match (§3.2).
8. Delete `CoordinationStore`; unify the two locks, two `writeJsonAtomic`s, three JSONL scanners, two Supabase RPC wrappers, and the duplicated transport helpers; export the hard-stop type set and the shared enums from one place (§3.3).
9. Worktree safety: validate deletion paths, real fencing tokens, a missing-directory cleanup path, ledger-first writes with a release record, expiry-aware collisions, fail-closed reads (WL-1..WL-6).
10. Transport hygiene: evict per-session state on close, bound the SSE buffer, surface dropped event types, use `mapCliFailure`, catch JSON parse errors in the CLI client, dedupe `ensureReady`/`ensureRunning` (TR-4..TR-8).
11. Coordinator: exponential backoff with a single retry policy, correct `Retry-After` parsing, header allowlist anchoring, decrement support in active-turn accounting, per-record `safeParse` in replay (CO-4..CO-8).
12. Server-side clock for Supabase RPCs, pagination and retention for messages and events, preserve failure causes instead of `backend-unavailable` (SL-11, CLI-2).
13. Enable type-aware ESLint rules, add coverage thresholds to Vitest, and convert docs-grep tests into lint rules (HY-5, HY-6).
14. Remove committed logs, transcripts, and machine paths; add `.gitignore` entries; stop shipping the fake server; move `@types/node` and `tsx` to devDependencies (HY-3, HY-4).

**P2, opportunistic**
15. `.strict()` and `z.infer`-derived types across core-contracts; export the reachable-but-unexported types (CC-4, CC-7).
16. Decompose the five 200+ line functions in the transport (TR-9) and the parser table in the CLI.
17. Relativize workspace paths in handoff packets or document that they are absolute (CC-5); drop phase labels from wire schemas (CLI-4).
18. Property tests for scoring, backoff, expiry, and parsing (§5).

## Appendix A. Redaction probe

Run against the built `@consiliency/runtime-provider` (`packages/core-contracts/dist/index.js`) at `9b66d53`. Each string was passed to `sanitizeMetadataText(text, "probe", 4096)`; "passed through" means the function returned the string unchanged.

```
PASSED THROUGH | OMNIAGENT_COORDINATION_SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi... (repo's own env var + JWT)
PASSED THROUGH | token was eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xl... (bare JWT)
PASSED THROUGH | aws key AKIAIOSFODNN7EXAMPLE used
PASSED THROUGH | {"aws_secret_access_key": "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"}
PASSED THROUGH | key AIzaSyDaGmWKa4JsXZ-HjGw7ISLn_3namBGewQe (Google API key)
PASSED THROUGH | glpat-xxxxxxxxxxxxxxxxxxxx (GitLab PAT)
PASSED THROUGH | npm_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789 (npm token)
PASSED THROUGH | cloning https://user:hunter2pass@github.com/org/repo.git (URL userinfo)
PASSED THROUGH | {"token": "abcdef0123456789abcdef"} (colon form)
PASSED THROUGH | password: correct-horse-battery-staple (YAML)
PASSED THROUGH | X-Api-Key: 0123456789abcdef0123456789abcdef (header)
PASSED THROUGH | set MY_SERVICE_TOKEN=abc123xyz789 before running (mid-line env assignment)
PASSED THROUGH | client_secret=abcdef0123456789
PASSED THROUGH | secret_key=abcdef0123456789
PASSED THROUGH | passwd=hunter2hunter2
PASSED THROUGH | -----BEGIN PRIVATE KEY----- (PKCS#8 header)
blocked        | -----BEGIN OPENSSH PRIVATE KEY-----
blocked        | -----BEGIN RSA PRIVATE KEY-----
PASSED THROUGH | using ANTHROPIC_API_KEY=abc123xyz789 today (mid-line)
blocked        | sk-proj-abcdefghijklmnop
blocked        | Authorization: Bearer abcdefghijklmnop
blocked        | ghp_abcdefghijklmnopqrstuvwxyz0123456789
PASSED THROUGH | Cookie: session=abcdef0123456789abcdef

18/23 secret-shaped strings passed through sanitizeMetadataText
```

`sanitizeMetadataPath` results for secret-bearing paths: `.npmrc`, `.netrc`, `.git-credentials`, `.kube/config`, `id_ecdsa`, `.docker/config.json`, `keystore.jks`, `cert.pfx` were **allowed**; `.aws/credentials`, `config/.env.production`, `.ssh/id_rsa`, `secrets/app.pem` were blocked.

## Appendix B. Ledger append benchmark

`AuditLedger.open` on a fresh temp state root, then N sequential `appendEvidenceRef` calls (Node 22, container SSD):

| Appends | Total | Per append |
|---|---|---|
| 100 | 0.35 s | 3.5 ms |
| 200 | 0.56 s | 2.8 ms |
| 400 | 1.37 s | 3.4 ms |
| 800 | 3.03 s | 3.8 ms |
| 1,600 | 10.0 s | 6.3 ms |
| 3,200 | 32.6 s | 10.2 ms |
| 6,400 | 120.4 s | 18.8 ms |

## Appendix C. Verification gate output (summary)

```
pnpm install --frozen-lockfile   OK (166 packages)
pnpm build                       OK (10 projects)
pnpm lint                        OK (0 warnings)
pnpm typecheck                   OK (10 projects)
pnpm test                        Test Files 100 passed; Tests 345 passed | 1 skipped; 18.2 s
pnpm audit --prod                No known vulnerabilities found
```
