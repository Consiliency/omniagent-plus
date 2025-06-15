# Lifecycle And Events

`@consiliency/runtime-provider` freezes the session and turn lifecycle that
BOOTCORE exposes to later phases. The package consumes
`IF-0-CONTRACT-1` without importing real Omnigent transport code and keeps the
runtime surface metadata-only.

## Session Lifecycle

The provider-owned session states are:

| State | Allowed next states |
| --- | --- |
| `created` | `starting`, `failed` |
| `starting` | `idle`, `failed` |
| `idle` | `turn_active`, `cancelling`, `closed`, `failed` |
| `turn_active` | `blocked_on_approval`, `cancelling`, `idle`, `failed` |
| `blocked_on_approval` | `turn_active`, `cancelling`, `idle`, `failed` |
| `cancelling` | `idle`, `closed`, `failed` |
| `closed` | terminal |
| `failed` | terminal |

Logical close remains provider-owned emulation. CONTRACT proved that Omnigent
offers stop-or-delete, not a stable public close state, so BOOTCORE treats
`idle -> closed` as a local contract edge.

## Turn Lifecycle

The provider-owned turn states are:

| State | Allowed next states |
| --- | --- |
| `accepted` | `queued`, `running`, `failed`, `cancelled` |
| `queued` | `running`, `cancelling`, `timed_out`, `failed`, `cancelled` |
| `running` | `blocked_on_tool_approval`, `cancelling`, `completed`, `timed_out`, `failed` |
| `blocked_on_tool_approval` | `running`, `cancelling`, `timed_out`, `failed` |
| `cancelling` | `cancelled`, `failed` |
| `cancelled` | terminal |
| `timed_out` | terminal |
| `completed` | terminal |
| `failed` | terminal |

One active turn per session is the default. In the HTTP adapter, duplicate
`sendTurn` calls reuse the same process-local promise when session and
`idempotencyKey` match.

## Event Rules

- `sequence` is monotonic per session.
- Replay starts after the supplied cursor.
- Missing sequence numbers are protocol failures.
- Heartbeats are valid but do not advance turn state.
- Exactly one normalized terminal turn event is emitted even when upstream
  fixtures contain both `response.*` and `turn.*` terminal markers.

The fake event stream keeps the CONTRACT fixture behavior for malformed SSE
frames: invalid JSON, non-object payloads, and unknown event types are skipped
instead of poisoning the stream.

## Upstream Drift

The official Omnigent `v0.12.0` freeze contains the same exact 54 stream event
types.
Reconnect opens SSE before fetching the snapshot and all cursor-paginated
history. The persisted-item mapper never manufactures successful completion
from an idle snapshot; success requires tagged response lifecycle evidence. Stream item IDs
dedupe overlap with persisted history. When an official buffered text delta has
no identity, only its matching persisted text prefix is consumed; mismatched or
continued output remains live. Tool overlap uses call identity even when the
persisted and streamed item IDs differ. Metadata-only history rows never create
a neutral turn lifecycle.

The v0.10 `OutputTextDeltaEvent` edits are descriptive only. Identity-free
equal text remains undecidable and lossless; replay deduplication still
requires item/message identity or process-local cursor evidence.

`session.created` on a parent stream describes a child session and does not
create a neutral root-session lifecycle event. The canonical CLI start remains
`omnigent server --background`; the hidden `omnigent server start` alias is
never invoked. `omnigent start` and `omnigent host --background` are operator
commands and do not replace the provider lifecycle command.

The v0.5.1 `session.mcp_startup` and `response.policy_denied` events preserve
their metadata through parsing and intentionally emit no normalized runtime
event. MCP startup metadata present on a session snapshot is retained in the
session metadata object.

The v0.6.0 `browser.action_request` and
`response.function_call_output.delta` events follow the same observational
rule: they preserve raw transport metadata, emit no normalized runtime event,
and cannot create or terminate a turn.

## V0.11 Metadata And Failure Additions

`session.permission_mode` and `session.title` are accepted as raw metadata and
emit no neutral runtime event. They cannot grant approval or permission
authority. Pre-allocation `response.failed` frames may omit response identity;
they reuse conservative turn correlation and remain unattributed when
ambiguous. Malformed background-task detail cannot suppress a status edge.

## V0.12 Elicitation Verdict Metadata

`response.elicitation_resolved` may carry `accept`, `decline`, or `cancel`, or
no recorded verdict through an absent or null action. The parser requires the
tagged non-empty `elicitation_id`, strips every supplied lifecycle and item
identity, and emits no neutral runtime event. It is discarded before mapper
deduplication and provider cancellation or fence bookkeeping, so observational
verdict metadata cannot mutate session or turn lifecycle.
