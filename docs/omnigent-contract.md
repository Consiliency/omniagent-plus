# Omnigent Contract Freeze

`IF-0-CONTRACT-1` is frozen to official Omnigent `v0.10.0` at commit
`40755dd8dddb07e1eb6e4055d1d9936e184ceb9b`, published 2026-08-19. PyPI
reports `omnigent==0.10.0` with Python `>=3.12`.

The direct `v0.9.0` to `v0.10.0` comparison is additive: operations increase
from 97 to 100, paths from 69 to 72, and schemas from 134 to 139. No path or
schema is removed, and all 52 tagged stream event discriminators remain
unchanged. The three added paths are:

- `/.well-known/omnigent.json`
- `/v1/branding/logo/{variant}`
- `/v1/sessions/{session_id}/resources/environments/{environment_id}/search/{path}`

The five added schemas are `BrandingInfo`, `BrandingLogosInfo`, `DailyCost`,
`ServerInfoResponse`, and `SmartRoutingSourcesInfo`. Six existing schemas
changed: `AgentObject`, `ChildSessionSummary`, `ErrorDetail`,
`OutputTextDeltaEvent`, `SessionUsage`, and `UsageReport`.

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
- session responses and list rows require `agent_id`; list rows also require
  `updated_at`
- snapshot and list status is `idle`, `running`, `waiting`, or `failed`, while
  the SSE-only `SessionStatusEvent` additionally permits transitional
  `launching`
- nullable titles receive a deterministic local fallback
- session and child lists are cursor page envelopes
- child summaries require `parent_session_id` and epoch timestamps; their
  lifecycle is represented by optional busy/task fields rather than session
  `status`
- child `task_summary` is optional nullable, read-only descriptive metadata;
  it grants neither child creation nor route-decision authority
- `/items` returns cursor-paginated `ConversationItem` rows
- every page is requested ascending at limit 1000 and a non-advancing cursor
  is rejected as malformed
- routing decisions require `model`, `applied`, and `rationale`, with optional
  `decision_id`, source, scope, agent, harness, and override fields; routing
  decisions, child `routed_model`/`routing_decision_id`, routing overrides, and
  `blocked_on` remain read-only metadata

Send-turn uses exactly:

```json
{"type":"message","data":{"role":"user","content":[{"type":"input_text","text":"..."}]}}
```

Accepted message acknowledgements contain `queued: true` plus optional
`item_id` or `pending_id`; they do not contain session or response identity.
Control events complete synchronously with `queued: false`. HTTP 202 may instead
return `{queued:false, denied:true, reason}`. That result is a cached,
non-retryable `policy_denied` failure and never creates an active handle.
Create and send idempotency are process-local because the tagged API provides
no durable request key.

The v0.10 `ErrorDetail` contract requires machine fields `code` and `message`
and adds nullable descriptive `title`, `cause`, and `remediation`. HTTP error
bodies remain lossless `unknown` values. Failure classification reads only a
plain-string body or canonical `code`, `message`, and legacy `error` fields,
including those fields under the supported FastAPI `detail` envelope.
Descriptive and unknown additive fields can contain billing, authentication,
quota, monthly, or usage-cap language without changing retryability, policy,
billing/auth classification, approval, or authority.

The neutral default remains one active turn per session. Distinct concurrent
sends fail with `concurrency_limit`; callers must explicitly set
`allowQueuedTurns` to consume Omnigent's pending-input queue.

The tagged interrupt and stop events are session-scoped and expose neither a
target response ID nor a conditional fencing token. The adapter refuses those
controls unless the caller supplies both `withExclusiveSessionLease` and
`sessionMutationFenceStore`, backed by the same fleet-wide authority used by
every writer of that session. Send, cancel, and close operations all enter that
lease and consult the shared state. A pending cancellation blocks every writer
until correlated lifecycle proof arrives; rejected response IDs and logical
close remain visible to replacement clients. Close records a pending terminal
fence before sending `stop_session`; only an explicit policy denial removes it,
so malformed or disconnected acknowledgements remain fail-closed. A late
consumed-input event for a cancelled pending turn reopens cancellation fencing
until that turn's lifecycle is correlated. Non-retryable or stream-proven send
rejections persist every known provisional and official identity, and replacement
history, session-info, stream, and send paths install those tombstones before
reconciliation. Default leased admission also treats upstream `running` and
`waiting` status as active work even when no response or pending ID is present.
The package consumes these guards but does not implement or own lease, lock, or
durable fence authority.

## History And Stream

Persisted `ConversationItem` history uses the official flat API row shape;
type-specific fields are spread beside the common item fields. Tagged SSE is a
separate contract.
History maps messages, function calls, function outputs, explicit errors, and
explicit interruption. Reasoning, compaction, `native_tool`, resource, routing,
slash-command, terminal-command, and meta-message rows remain metadata-only.
History never invents successful completion from `idle` or absent active state.

Reconnect opens the SSE response first, then reads the snapshot and every
history page before consuming buffered frames. The stream is always closed on
exit. Tagged response lifecycle objects, snake-case session fields, missing
timestamps, and identifier-free deltas normalize before the neutral mapper.
An idle snapshot or id-less idle status does not clear a locally accepted turn:
native terminals can report idle while paused mid-turn. Correlation clears on
an authoritative terminal response, a response-correlated idle status, or a
failed status. A correlated `session.status: failed` maps to one neutral turn
failure, including setup
failures that have no `response.failed`, and the tracked session remains failed.
Long-lived streams are reseeded whenever a later send is accepted. Raw failure
semantics keep provider state failed even when duplicate or history-overlap
terminal evidence is suppressed by neutral-event deduplication. A one-event
terminal alias links a provisional status-only failure to a later distinct
official response ID; new turn or response activity clears that alias.
`session.created` carries the parent `conversation_id` and a distinct
`child_session_id`; it does not synthesize neutral root-session creation. Bare
uncorrelated `turn.*` frames are metadata-only.

## CLI And Capabilities

Production lifecycle remains `omnigent server --background`, with
`omnigent server status --json` and `omnigent server stop`. The hidden
deprecated `omnigent server start` alias is evidence only and is never invoked
here. v0.10 also exposes `omnigent start` and `omnigent host --background` as
operator commands; neither replaces the process-manager command. CLI
`{id,event}` resume history retains its legacy mapper.

Supported transport capabilities remain create, send, stream, history,
lease-guarded cancel, list, and read-only harness catalog. Logical close and
terminal uniqueness are provider emulations. Child-session creation and public
harness override remain blocked. Smart routing, imports, projects, hosts,
credentials, model discovery, lease, lock, approval, and authority are not
promoted into the neutral provider.

Usage reporting (`SessionUsage.agent_name`, `harness`, and `llm_model`, plus
`UsageReport.daily_costs`), branding, server discovery, smart-routing source,
and environment-search additions are observed operator/admin surfaces. They do
not add transport endpoints or neutral runtime-provider capabilities.

Sub-agent bundle-root isolation is an upstream stable v0.10 guarantee. The
transport records that guarantee but does not implement or re-enforce it.
v0.10 also reverts upstream shared-session approval attribution so any shared
editor can approve. That is upstream collaboration behavior only and grants no
Consiliency approval, authority, lease, lock, child-create, harness-override,
or route-decision capability.

## Development Watch List

The 2026-08-24 upstream development `main` probe observed `0.11.0.dev0` at
`46b1ce13fef0a3ea1d208ec8a2f79951023f643c`. It adds
`session.permission_mode` and `session.title` to the stream schema. They are a
watch list only: neither event is part of the frozen 52-event v0.10 vocabulary.
