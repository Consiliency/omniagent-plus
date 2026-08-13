# Omnigent v0.9 exact-head verification

Summary: PRE-PUBLICATION PASS. This receipt supersedes the original execution
receipt for merge consideration and applies to the exact PR commit containing
this file. The final implementation parent is `dab6dd5`, and no source or evidence
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

- Focused transport suite: PASS, 15 files and 79 tests passed; one credentialed
  live smoke skipped by default. Coverage includes malformed acknowledgement
  rejection, exact snapshot/history wire normalization, idle-stream iterator
  cancellation, cross-stream terminal-candidate retirement, late persisted-history
  reconciliation, stable-message reconnect continuation, and legacy CLI root
  session creation isolation.
- `pnpm build`: PASS
- `pnpm lint`: PASS
- `pnpm typecheck`: PASS
- `pnpm test`: PASS, 100 files and 251 tests passed; one credentialed live smoke
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

## Boundaries

This remains transport-only and additive. It does not broaden child-session,
harness, routing, approval, XG-1, lease, or lock authority. The existing trusted
publish workflow is unchanged and was not dispatched before merge because its
manual path also publishes. The primary checkout's unrelated `mcp_server.log`
was not modified, staged, or included.
