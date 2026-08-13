# Omnigent v0.9 exact-head verification

Summary: PRE-PUBLICATION PASS. This receipt supersedes the original execution
receipt for merge consideration and applies to the exact PR commit containing
this file. The final implementation parent is `7b5126c`, and no source or evidence
files may change after this receipt is committed without another full run.

## Scope

- PR: `Consiliency/omniagent-plus#14`
- Branch: `codex/implement-omnigent-v0-9`
- Plan: `plans/detailed-omnigent-v0-9-accommodations-20260812-180838.md`
- Stable authority: Omnigent `v0.9.0` at
  `cc4720a79fbdf9ccee56724bf571e7d48e1d9ac2`
- Release candidate: `@consiliency/omnigent-transport@0.5.0`
- Sibling public package versions: `0.2.0`, unchanged

## Exact-Head Gates

- Focused transport suite: PASS, 15 files and 104 tests passed; one credentialed
  live smoke skipped by default. Coverage includes malformed acknowledgement
  rejection, exact snapshot/history wire normalization, idle-stream iterator
  cancellation, cross-stream terminal-candidate retirement, late persisted-history
  reconciliation, stable-message reconnect continuation, pre-acknowledgement
  stream correlation, and legacy CLI root session creation isolation.
- `pnpm build`: PASS
- `pnpm lint`: PASS
- `pnpm typecheck`: PASS
- `pnpm test`: PASS, 100 files and 276 tests passed; one credentialed live smoke
  skipped by default.
- `pnpm --filter @consiliency/omnigent-transport test:pack`: PASS
- Omnigent fixture JSON validation: PASS
- `git diff --check`: PASS
- `phase-loop validate-roadmap specs/phase-plans-v1.md`: PASS, 13 phases
- GitHub commit status `exact-head-verification`: posted as success only after
  every command above completed on the receipt-containing commit.

## Review Reconciliation

- Status-only terminalized provisional IDs leave the reconnect FIFO but retain
  exact-history reconciliation keys. The provider integration test closes the
  first stream, binds turn three on a new stream, then supplies persisted rows
  for turns one and two and proves both old handles reconcile exactly.
- Tagged HTTP child `session.created` remains metadata-only. Legacy CLI resume
  history and attach streams use a dedicated legacy mapper and retain root
  `runtime.session.created` behavior.
- Event acknowledgements are runtime-normalized. Accepted input requires literal
  `queued: true` with optional non-empty `item_id` or `pending_id`; synchronous
  denial requires `denied: true`, `queued: false`, and a non-empty reason. Empty,
  false-queued send-turn, or mistyped shapes fail as non-retryable
  `malformed_response` and cannot create an active handle. Control events retain
  the official successful `{queued:false}` response.
- Official v0.9 has two persisted-item wire shapes. Session snapshots retain the
  nested Pydantic `data` object, while `GET /sessions/{id}/items` uses flat
  `ConversationItem.to_api_dict()` rows. The authority fixture and fake server
  model both shapes, and the HTTP boundary normalizes nested snapshot items into
  the same flat internal history model used by paginated rows. Non-empty
  snapshot and paginated-history tests prove both paths reach the mapper.
- Returning or throwing from an HTTP stream iterator aborts the request before
  waiting for the suspended SSE read. The parser cancels its locked reader on
  abort, and the hybrid adapter preserves that cancellation behavior. A
  pre-first-frame idle-stream regression proves iterator return completes and
  the request signal is aborted.
- Persisted/live text deduplication is message-scoped when v0.9 supplies a
  `message_id`, with response-wide matching retained only for identifier-free
  streams. A provider race test opens the stream with message B in-flight, then
  reads history after A and B share one response and B has committed. The
  resulting neutral text is exactly A then B; buffered B is not emitted twice.
- Native `pending_id` acknowledgements retain their submitted message and the
  snapshot's ordered `pending_inputs`. The nested `session.input.consumed`
  `cleared_pending_id -> item_id` join is preserved until history supplies the
  item's response ID. If consumption happened before stream subscription, the
  remaining snapshot pending IDs plus ordered exact-message history reconcile
  consumed handles without positional cross-assignment. Single live-join and
  two-turn reconnect tests prove both paths.
- Reconnect recovery follows v0.9's authoritative FIFO drain contract rather
  than comparing transcript text. Exact consumed-event aliases reconcile first;
  remaining consumed pending handles pair in FIFO order with the newest
  unclaimed persisted user rows. Regression history reformats quotes,
  attachments, and whitespace and still preserves both turn identities.
- `response.output_item.done` now takes `item.response_id` as official identity
  and emits assistant message text when no delta preceded it. Message- and
  response-scoped emitted-text indexes suppress content already delivered as
  deltas. The authority fixture and provider tests prove a terminal-backed,
  no-delta reply is emitted exactly once before completion.
- Turn registration now precedes the send-turn network acknowledgement, closing
  the race where an already-open SSE stream could receive an official lifecycle
  before the provisional handle existed. If the acknowledgement wins, its item
  or pending ID atomically replaces the request provisional in provider and
  stream state; if the stream wins, the handle is already reconciled and the
  later acknowledgement cannot overwrite it. Denied or failed sends remove the
  pre-acknowledgement fallback. A regression delivers both response-created and
  response-completed before releasing a valid acknowledgement and proves the
  returned handle remains official and the session remains idle.
- Exact item acknowledgement rows are reserved before pending FIFO recovery, so
  a mixed pending-ID then item-ID sequence cannot assign both handles to the
  latter response. A mixed acknowledgement regression proves each handle keeps
  its own official response.
- If an official SSE lifecycle reconciles a request provisional before the HTTP
  acknowledgement connection fails, the lifecycle is authoritative evidence of
  acceptance. The same idempotency key retains the fulfilled handle and cannot
  post the turn again. A deterministic lost-ack regression proves one POST.
- A native pending acknowledgement arriving after an id-less status terminal
  restores its pending ID to reconnect order without reseeding the retired
  synthetic request ID. Persisted history then reconciles the handle normally.
- Persisted terminal history now updates tracked provider state after snapshot
  refresh. A persisted error regression proves the emitted failure also clears
  active identity and leaves the session failed with the mapped error.
- Persisted history state now follows only the newest lifecycle outcome. An
  older failed turn followed by a newer cancelled turn clears the stale failure
  and leaves the session idle, while the existing single-failure regression
  continues to preserve the mapped failure.
- Persisted and live runtime events now share a provider-local per-session
  sequence ledger. Newly observed persisted lifecycle events receive sequence
  numbers above the prior live high-water mark, while stable event identities
  retain their prior sequence. A reconnect regression proves a new persisted
  failure remains visible after a cursor that previously exceeded its rebuilt
  history ordinal.
- Turn rollback now restores prior session state only while the rejected turn
  still owns the active identity. A concurrent-send regression accepts a newer
  pending turn before denying the older request and proves the newer turn
  remains active.
- Native pending IDs that remain in the authoritative snapshot pending queue are
  excluded from the stream normalizer's response-alias candidates. A live-frame
  regression proves an unrelated active response can start and complete without
  rebinding or terminalizing the queued handle. A later
  `session.input.consumed` event makes the pending ID eligible again.
- History-synthesized starts no longer activate provider state; active identity
  comes from provisional registration, authoritative snapshots, or live
  lifecycle. Regressions prove both `readHistory()` and an empty-live reconnect
  leave a successfully completed session idle.
- Provider-local delivered text is tracked by official turn and trimmed from
  later committed history before replay sequencing. Identity-free deltas and
  item-only live output therefore do not replay after their cursor. The event
  mapper also bridges identity-free deltas to a later identified terminal item
  without weakening distinct identified-message output.
- `readHistory()` now combines the session snapshot with persisted rows, so it
  can reconcile a consumed native pending handle without requiring an SSE
  subscription.
- Failure state records its turn identity. A trailing idle status for that same
  failed response preserves the error, while a different newer successful turn
  clears the stale error and leaves the session idle.
- Pending FIFO recovery now fails closed unless the number of unclaimed user
  rows exactly matches the number of locally consumed native pending handles.
  A regression proves an extra external row cannot capture the local handle,
  while the handle reconciles once the evidence becomes unambiguous.
- Delivered-text trimming is cursor-resume-only. Repeated ordinary history reads
  remain byte-equivalent with a stable cursor, while reconnect calls with an
  explicit cursor retain duplicate suppression.
- Cancel and close controls now check the normalized acknowledgement before
  mutating local state. Explicit control denials surface as non-retryable policy
  failures and preserve the active turn.
- Queued-only acknowledgements are tracked as conservative FIFO candidates when
  the authoritative snapshot has no pending inputs. Exact-count history
  reconciliation then binds a disconnected completion to its official response
  without inventing an acknowledgement ID.
- Successful HTTP responses with invalid JSON now normalize to non-retryable
  `malformed_response`. All non-retryable send failures remain cached by
  idempotency key, and a blank-202 regression proves repeated calls issue one
  POST.
- An explicit synchronous policy denial remains authoritative even when a
  lifecycle event reconciles the provisional handle before the acknowledgement
  arrives. Denial fully removes both provisional and official registration,
  restores prior session state, and remains cached as non-retryable. A
  concurrent-stream regression proves the denial, one POST, and cleared active
  identity while the separate lost-connection regression still returns the
  stream-proven accepted handle.
- Reconnect message deduplication now aligns a buffered chunk anywhere within
  the remaining persisted message, so a stream that resumes at a suffix chunk
  cannot replay that suffix. Terminal output-item deduplication uses
  response-wide emitted text only when no message ID exists; distinct identified
  messages sharing one response each retain their full text. Regressions prove a
  persisted `Hello world` suppresses buffered ` world`, while separate `Hello`
  and `Hello again` messages both emit completely.
- Snapshot active-response fallback now excludes a sole provisional ID that is
  still present in `pending_inputs`, both during stream setup and
  `getSessionInfo()`. A regression proves an unrelated active response cannot
  replace a newly pending handle through either path.
- Request-level network failures are now wrapped separately from received HTTP
  responses and acknowledgement validation. Only genuine network loss may rely
  on stream-proven acceptance; a malformed acknowledgement remains fail-closed
  even after lifecycle reconciliation. A concurrent regression proves the
  malformed failure and cleared active identity. HTTP error bodies are also read
  once before optional JSON parsing so non-JSON responses retain typed status.

## Boundaries

This remains transport-only and additive. It does not broaden child-session,
harness, routing, approval, XG-1, lease, or lock authority. The existing trusted
publish workflow is unchanged and was not dispatched before merge because its
manual path also publishes. The primary checkout's unrelated `mcp_server.log`
was not modified, staged, or included.
