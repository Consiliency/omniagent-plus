# Lifecycle And Events

`@omniagent-plus/core-contracts` freezes the session and turn lifecycle that
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

One active turn per session is the default. Duplicate `sendTurn` calls reuse the
same handle only when the `idempotencyKey` matches the active turn.

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

The official Omnigent `v0.4.0` freeze includes `waiting` in the release
OpenAPI session snapshot enum, so the previous waiting drift is resolved.
The `session.status` SSE family still includes `launching`; the transport
treats it as the neutral `starting` session state. Additional `v0.4.0`
metadata/UI event families are accepted by the parser and no-op mapped unless
they affect provider state.
