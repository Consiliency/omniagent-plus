# Omnigent v0.9 exact-head verification

Summary: PRE-PUBLICATION PASS. This receipt supersedes the original execution
receipt for merge consideration and applies to the exact PR commit containing
this file. The final implementation parent is `a2783a9`, and no source or evidence
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

- Focused transport suite: PASS, 15 files and 125 tests passed; one credentialed
  live smoke skipped by default. Coverage includes malformed acknowledgement
  rejection, exact snapshot/history wire normalization, idle-stream iterator
  cancellation, cross-stream terminal-candidate retirement, late persisted-history
  reconciliation, stable-message reconnect continuation, pre-acknowledgement
  stream correlation, and legacy CLI root session creation isolation.
- `pnpm build`: PASS
- `pnpm lint`: PASS
- `pnpm typecheck`: PASS
- `pnpm test`: PASS, 100 files and 297 tests passed; one credentialed live smoke
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
- A successful acknowledgement whose response body disconnects is now treated
  as network loss rather than malformed JSON. Stream-proven acceptance keeps
  the reconciled official handle, active state, and idempotency cache, while an
  actual JSON syntax error remains a non-retryable malformed response. The
  response-body termination regression proves one POST and no rollback.
- Native pending acknowledgements received after a stream is already open are
  removed from that stream's fallback candidates immediately after provisional
  identity replacement. They become eligible again only through the existing
  consumed-input or exact-history joins. A stream-first regression proves an
  unrelated response cannot capture or terminalize the pending handle.
- Delivered text is now accumulated once per stable runtime event identity.
  Re-reading the same persisted message therefore cannot inflate the
  cursor-recovery prefix ledger and consume a later distinct message with equal
  bytes. A regression reads one `same` message twice, appends a second `same`
  message under the same response, and proves the second message remains visible
  after the prior cursor.
- An identity-free terminal status is no longer attributed through the scalar
  fallback when multiple unbound turns are eligible. The ambiguous status stays
  metadata-only for turn correlation, and the next official response still
  claims the oldest turn through the authoritative FIFO. A normalizer regression
  proves the newest pending turn cannot be terminalized without identity.
- SSE framing now accepts both LF and RFC-compatible CRLF separators, including
  multiple frames in one body. A CRLF regression proves response lifecycle and
  text frames parse independently rather than collapsing into invalid JSON.
- Synthetic event IDs are namespaced by HTTP stream connection while upstream
  item, message, response, and sequence identities remain stable. Identity-free
  events on a later connection therefore cannot reuse a prior sequence below
  the reconnect cursor. A two-stream regression proves the second reply remains
  visible and every event is strictly above the first cursor.
- Delivered-text trimming retains unmatched bytes while scanning later
  persisted events for already-delivered live text. A regression starts from an
  external cursor after persisted A, delivers identity-free B live, commits A+B,
  and proves B is not replayed.
- Queued-only recovery excludes conversation items observed before the send,
  while preserving exact-count fail-closed matching for newly eligible rows. A
  pre-ack identity-free terminal also restores the queued-only provisional to
  FIFO order when the acknowledgement arrives. Regressions prove both prior
  history and delayed acknowledgement paths reconcile to the official response.
- Authoritative policy-denied and malformed acknowledgements now quarantine both
  the request provisional and any stream-reconciled official identity. Open
  normalizers disown the rejected current response, and provider tombstones drop
  its trailing deltas and terminals before mapping or state mutation. Extended
  concurrent regressions prove trailing frames cannot resurrect active state,
  emit output, or trigger another POST.
- Delivered text is retained as stable event records with sequence numbers, so
  replay suppression is evaluated only against bytes delivered at or before the
  caller's cursor. An ordinary prior reader can no longer consume output for a
  later independent `afterSequence: 0` subscriber.
- Reconnect live events now use the same cursor-bounded text trimming and final
  cursor filter as persisted events. A repeated `response.created` remains below
  the prior cursor and is omitted, while cumulative `Hel` to `Hello` emits only
  `lo` with a new stable continuation identity and sequence above the cursor.
- Persisted suffix continuations receive an identity derived from the original
  event plus consumed-prefix length. Live identified `Hel` followed by committed
  `Hello` therefore emits `lo` above the live cursor instead of inheriting the
  colliding original sequence.
- Exact `item_id` acknowledgements now reserve their persisted row even when an
  earlier SSE lifecycle already reconciled the shared handle to its response ID.
  A race regression lets turn A complete over SSE before its item acknowledgement,
  then sends pending turn B and exposes only A's row. B remains pending rather
  than being rebound to A's response through FIFO recovery.
- Retryable send failures now clear the reused deterministic provisional's
  tombstone before registering the same idempotency key again. A 429 then
  queued-only retry regression proves two POSTs, visible start/text/completion,
  official response reconciliation, and final idle state.
- Response lifecycle SSE frames are validated for the v0.9 nested response
  identity before normalization, while the existing normalized legacy envelope
  remains accepted. A known `response.completed` type without either shape is
  logged as `invalid_event_shape` and skipped, so it cannot fabricate success or
  terminalize a provisional turn.
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
- Rejected official response identities now remain tombstoned inside each open
  stream normalizer. A trailing rejected response therefore cannot consume the
  next provisional FIFO candidate before the provider drops the frame. Unit and
  provider regressions reject turn A, register turn B, deliver late A frames,
  then prove B alone receives its official identity, output, and completion.
- History is fetched before the session snapshot, narrowing the pending-input
  consumption race, and newly visible rows are not marked permanently observed
  while a local provisional remains unresolved. A stale-snapshot regression
  exposes the committed user row while the first snapshot still reports its
  pending ID, then proves the next read reconciles the handle to the official
  response rather than losing the row.
- Provider tombstones are seeded into every replacement stream normalizer before
  provisional fallbacks. Rejected IDs also remain blocked from snapshot active
  response and exact binding paths. A two-stream regression rejects response A,
  reconnects, registers B, delivers late A before B, and proves only B receives
  identity, output, completion, and final idle state.
- When a current response is rejected, identity-free frames remain attributed to
  that quarantined response until a new non-rejected official identity arrives.
  This drops ambiguous trailing deltas and status frames instead of assigning
  them to the next provisional turn; the same-stream denial regression covers
  the identity-free case.
- Bare `{queued:true}` acknowledgements use synthetic local IDs that cannot match
  native snapshot pending IDs. A queued-only provisional is therefore treated as
  unresolved whenever any native pending input remains, and is removed from
  active-response fallback seeding. The existing unrelated-active-response
  regression now uses a bare acknowledgement and proves both `getSessionInfo()`
  and stream setup preserve the synthetic handle.
- Persisted-history text deduplication now requires message identity. The v0.9
  wire permits identifier-free deltas while multiple messages share one response,
  so response-wide substring matching could silently discard a genuine repeated
  prefix or word. Regressions prove both partial and exact historical repeats are
  emitted; message-identified buffered suffix suppression remains intact, while
  provider cursor trimming still suppresses bytes this process actually delivered.
- Provider snapshot reconciliation now treats a tombstoned active response as
  blocked in both stream setup and `getSessionInfo()`. It cannot bind a sole
  provisional or refresh local state back to the rejected identity. The
  replacement-stream regression now keeps a stale rejected A in the snapshot
  while B is accepted and proves both read-model and stream paths preserve B.
- A native `pending_id` acknowledgement now removes that ID from every open
  normalizer even when SSE already reconciled the handle to an official response.
  A stream-first regression consumes pending A before its delayed acknowledgement,
  then sends B and proves the old pending fallback cannot capture B's response;
  B reconciles, emits, completes, and leaves the session idle.

## Boundaries

This remains transport-only and additive. It does not broaden child-session,
harness, routing, approval, XG-1, lease, or lock authority. The existing trusted
publish workflow is unchanged and was not dispatched before merge because its
manual path also publishes. The primary checkout's unrelated `mcp_server.log`
was not modified, staged, or included.
