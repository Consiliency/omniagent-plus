# Omnigent Contract Freeze

`IF-0-CONTRACT-1` is frozen to official Omnigent `v0.12.0` at commit
`f04b0354fb5344c1ea8b92795ceb6760a9ad7595`, published 2026-09-01. PyPI
reports `omnigent==0.12.0` with Python `>=3.12`.

The direct `v0.11.0` to `v0.12.0` comparison grows from 100 to 101 operations,
72 to 73 paths, and 143 to 146 schemas. It adds only `POST /v1/imports/local`
and `ImportedSessionRef`, `LocalImportRequest`, and `LocalImportResponse`; no
operation, path, schema, or event is removed. Ignoring documentation and
generator-only `format` annotations, six schemas change structurally:
`AutomaticSessionRenameRequest`, `ElicitationResolvedEvent`,
`ImportSessionRequest`, `SessionForkRequest`, `SessionGitOptions`, and
`UpdateSessionRequest`.

The stream union remains the exact existing 54 event types.

Tagged `openapi.json`, `omnigent/server/API.md`, and
`omnigent/server/schemas.py` are the authority. The checked-in fixtures are
metadata-only conformance evidence, not another source of truth.

## HTTP Contract

JSON session creation requires an existing `agent_id` and `initial_items`.
The adapter supports `named_agent` directly and an optional resolver for human
names. Inline and bundle-path specs fail closed until a separately reviewed
multipart bundle flow exists. The neutral initial message becomes one tagged
user message item; workspace uses `worktree.path ?? repoRoot`.
V0.12 additionally supports project-aware creation, but requests without a
non-null `project_id` retain the legacy required-`agent_id` shape. The adapter
does not serialize project-like keys from generic request metadata.

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

V0.11 pre-allocation `response.failed` frames may carry `status: "failed"` and
error detail without a response ID. They receive synthetic transport event
identity and reuse conservative existing turn correlation; no upstream response
ID is invented, and ambiguous failures emit no falsely attributed neutral turn.
Session permission-mode and title frames are accepted as raw metadata and emit
no neutral runtime event. Background-task detail is preserved best-effort from
snapshots and status frames and never controls lifecycle authority.

V0.12 adds an optional verdict to `response.elicitation_resolved`. The
transport requires a non-empty `elicitation_id`, accepts only `accept`,
`decline`, or `cancel` when an action is present, and normalizes an absent or
explicit-null action to `undefined`. The event keeps only that metadata and a
synthetic event ID. Supplied response, turn, message, item, call, and action
identities are ignored before mapper, deduplication, cancellation, or fence
state can be touched.

## CLI And Capabilities

Production lifecycle remains `omnigent server --background`, with
`omnigent server status --json` and `omnigent server stop`. The hidden
deprecated `omnigent server start` alias is evidence only and is never invoked
here. v0.10 introduced `omnigent start` and `omnigent host --background` as
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

V0.11 project icons, other-harness usage attribution, live permission-mode
mutation, scheduled-task controls, and model vocabulary remain operator or
reporting surfaces. No typed or public TUI-control path is added.

V0.12 project-aware creation and import, configurable forks, existing-branch
worktrees, and title bounds are likewise operator or administration surfaces.
The adapter exposes no new method or capability for them. A recorded
elicitation verdict is observational metadata and grants no approval authority.

Sub-agent bundle-root isolation is an upstream stable v0.10 guarantee. The
transport records that guarantee but does not implement or re-enforce it.
V0.10 also reverted upstream shared-session approval attribution so any shared
editor can approve. That is upstream collaboration behavior only and grants no
Consiliency approval, authority, lease, lock, child-create, harness-override,
or route-decision capability.

## Development Watch List

The 2026-09-03 upstream development `main` probe observed `0.13.0.dev0` at
`385830d871145d0aca1c46be5e293b0192e24398`, 195 commits ahead of and two
commits behind the v0.12 tag. Development `main` remains observational only.
