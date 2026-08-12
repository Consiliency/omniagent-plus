# Omnigent Contract Freeze

`IF-0-CONTRACT-1` is frozen to official Omnigent `v0.9.0` at commit
`cc4720a79fbdf9ccee56724bf571e7d48e1d9ac2`, published 2026-08-11. PyPI
reports `omnigent==0.9.0` with Python `>=3.12`.

The direct `v0.7.0` to `v0.9.0` comparison retains 97 OpenAPI operations and
all 52 tagged stream event discriminators. There are no path, schema, or event
set additions or removals. Six schemas changed additively:

- `ChildSessionSummary`
- `ImportSessionRequest`
- `RoutingDecisionData`
- `SessionResponse`
- `SessionStatusEvent`
- `UpdateSessionRequest`

Tagged `openapi.json`, `omnigent/server/API.md`, and
`omnigent/server/schemas.py` are the authority. The checked-in fixtures are
metadata-only conformance evidence, not another source of truth.

## HTTP Contract

JSON session creation requires an existing `agent_id` and `initial_items`.
The adapter supports `named_agent` directly and an optional resolver for human
names. Inline and bundle-path specs fail closed until a separately reviewed
multipart bundle flow exists. The neutral initial message becomes one tagged
user message item; workspace uses `worktree.path ?? repoRoot`.

The session, history, and child-list surfaces use official wire shapes:

- session timestamps are Unix epochs and normalize to required ISO strings
- nullable titles receive a deterministic local fallback
- session and child lists are cursor page envelopes
- child summaries require `parent_session_id` and epoch timestamps; their
  lifecycle is represented by optional busy/task fields rather than session
  `status`
- `/items` returns cursor-paginated `ConversationItem` rows
- every page is requested ascending at limit 1000 and a non-advancing cursor
  is rejected as malformed
- `routed_model`, `routing_decision_id`, routing overrides, and `blocked_on`
  remain read-only metadata

Send-turn uses exactly:

```json
{"type":"message","data":{"role":"user","content":[{"type":"input_text","text":"..."}]}}
```

Accepted acknowledgements contain `queued` plus optional `item_id` or
`pending_id`; they do not contain session or response identity. HTTP 202 may
instead return `{queued:false, denied:true, reason}`. That result is a cached,
non-retryable `policy_denied` failure and never creates an active handle.
Create and send idempotency are process-local because the tagged API provides
no durable request key.

## History And Stream

Persisted `ConversationItem` history and tagged SSE are separate contracts.
History maps messages, function calls, function outputs, explicit errors, and
explicit interruption. Reasoning, compaction, `native_tool`, resource, routing,
slash-command, terminal-command, and meta-message rows remain metadata-only.
History never invents successful completion from `idle` or absent active state.

Reconnect opens the SSE response first, then reads the snapshot and every
history page before consuming buffered frames. The stream is always closed on
exit. Tagged response lifecycle objects, snake-case session fields, missing
timestamps, and identifier-free deltas normalize before the neutral mapper.
`session.created` carries the parent `conversation_id` and a distinct
`child_session_id`; it does not synthesize neutral root-session creation. Bare
uncorrelated `turn.*` frames are metadata-only.

## CLI And Capabilities

Production lifecycle remains `omnigent server --background`, with
`omnigent server status --json` and `omnigent server stop`. In v0.9,
`omnigent server start` exists only as a hidden deprecated alias and is never
invoked here. CLI `{id,event}` resume history retains its legacy mapper.

Supported transport capabilities remain create, send, stream, history, cancel,
list, and read-only harness catalog. Logical close and terminal uniqueness are
provider emulations. Child-session creation and public harness override remain
blocked. Smart routing, imports, projects, hosts, credentials, model discovery,
lease, lock, approval, and authority are not promoted into the neutral provider.

## Unreleased Risk

Upstream development `main` is `0.10.0.dev0` and is not frozen. It contains a
post-v0.9 fix that roots sub-agent skills and tools at each sub-agent bundle
instead of inheriting the parent bundle root. Deployments must not claim v0.9
security parity with that unreleased fix.
