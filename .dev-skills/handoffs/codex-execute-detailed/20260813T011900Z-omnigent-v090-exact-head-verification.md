# Omnigent v0.9 exact-head verification

Summary: PRE-PUBLICATION PASS. This receipt supersedes the original execution
receipt for merge consideration and applies to the exact PR commit containing
this file. The final implementation parent is `0c528d1`, and no source or evidence
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

- Focused transport suite: PASS, 15 files and 93 tests passed; one credentialed
  live smoke skipped by default. Coverage includes malformed acknowledgement
  rejection, exact snapshot/history wire normalization, idle-stream iterator
  cancellation, cross-stream terminal-candidate retirement, late persisted-history
  reconciliation, stable-message reconnect continuation, pre-acknowledgement
  stream correlation, and legacy CLI root session creation isolation.
- `pnpm build`: PASS
- `pnpm lint`: PASS
- `pnpm typecheck`: PASS
- `pnpm test`: PASS, 100 files and 265 tests passed; one credentialed live smoke
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
- An explicit synchronous policy denial remains authoritative even when a
  lifecycle event reconciles the provisional handle before the acknowledgement
  arrives. Denial fully removes both provisional and official registration,
  restores prior session state, and remains cached as non-retryable. A
  concurrent-stream regression proves the denial, one POST, and cleared active
  identity while the separate lost-connection regression still returns the
  stream-proven accepted handle.

## Boundaries

This remains transport-only and additive. It does not broaden child-session,
harness, routing, approval, XG-1, lease, or lock authority. The existing trusted
publish workflow is unchanged and was not dispatched before merge because its
manual path also publishes. The primary checkout's unrelated `mcp_server.log`
was not modified, staged, or included.
