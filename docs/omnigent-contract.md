# Omnigent Contract Freeze

This document defines `IF-0-CONTRACT-1` for `agent-runtime-provider-omnigent`.
It freezes the Omnigent surface that downstream phases may rely on for v0.1.

## Supported Version

- Freeze target: `omnigent` release `v0.4.0`
- Release commit: `31669e1b413216c865d0ed7dfb469fb142c889f5`
- Release published: `2026-07-03T01:36:56Z`
- Python requirement at the freeze target: `>=3.12`
- Authoritative downstream gate: `IF-0-CONTRACT-1`

The upstream `main` branch remains ahead of the freeze
(`b9332cc655b2ad7dbe70d2ad5b9cd78214dd3e17` observed on
`2026-07-05`), so `main` is not authoritative for this contract. Current main
movement is tracked separately in `docs/omnigent-upstream-readiness.md`.

## Source Provenance

This phase used metadata-only source inspection and safe command probes. No
credentials, live provider accounts, or secret-bearing environment dumps were
required.

Primary sources inspected at `v0.4.0`:

- `pyproject.toml`
- `README.md`
- `openapi.json`
- `omnigent/server/API.md`
- `omnigent/server/routes/harnesses.py`
- `omnigent/harness_plugins.py`
- `omnigent/server/schemas.py`
- `omnigent/cli.py`
- `sdks/python-client/omnigent_client/_sessions.py`
- `sdks/python-client/omnigent_client/_events.py`
- `omnigent/tools/builtins/spawn.py`

Local metadata-only probes on the execution host:

- `command -v omnigent` returned no path
- `command -v omni` returned no path

Consequence: CLI surface is frozen from tagged source plus README, not from a
live local installation.

## HTTP API Surface

Pinned public provider surface at `v0.4.0`:

| Method | Path | Provider use |
| --- | --- | --- |
| `GET` | `/v1/harnesses` | read-only harness catalog |
| `POST` | `/v1/sessions` | create session |
| `GET` | `/v1/sessions` | list sessions |
| `GET` | `/v1/sessions/{session_id}` | snapshot / reconnect |
| `PATCH` | `/v1/sessions/{session_id}` | bind runner and mutate session settings |
| `DELETE` | `/v1/sessions/{session_id}` | destructive delete, not logical close |
| `GET` | `/v1/sessions/{session_id}/items` | history read |
| `GET` | `/v1/sessions/{session_id}/stream` | live SSE stream |
| `POST` | `/v1/sessions/{session_id}/events` | send turn, interrupt, stop session |
| `GET` | `/v1/sessions/{session_id}/child_sessions` | observe child sessions |
| `POST` | `/v1/sessions/{source_id}/fork` | fork an existing session |
| `POST` | `/v1/sessions/{session_id}/switch-agent` | switch bound agent in place |
| `PUT` | `/v1/sessions/{session_id}/read-state` | update viewer read state |

Session event input types explicitly documented in `API.md` include:

- `message`
- `interrupt`
- `compact`
- `stop_session`

Session status and snapshot fields that downstream code must handle:

- `openapi.json` exposes `SessionResponse.status` values `idle`, `running`,
  `waiting`, and `failed`
- `session.status` SSE events document `launching`, `running`, `waiting`,
  `idle`, and `failed`
- `active_response_id` is an optional reconnect hint for an active in-flight
  response
- `background_task_count`, `viewer_last_seen`, and `viewer_unread` are optional
  metadata fields

Downstream implication: `waiting` is no longer release OpenAPI drift, but
`launching` remains a tolerated raw stream edge that maps to the neutral
`starting` state.

## CLI Surface

Entry points pinned at `v0.4.0`:

- `omnigent = omnigent.cli:main`
- `omni = omnigent.cli:main`

Documented runtime commands relevant to the provider boundary:

| Command | Purpose |
| --- | --- |
| `omnigent run <agent>` | launch agent from bundle/spec |
| `omnigent resume [conversation]` | resume a session |
| `omnigent attach <session_id>` | co-attach to a running session |
| `omnigent server start` | start managed local server |
| `omnigent server status` | show managed local server status |
| `omnigent server stop` | stop managed local server |
| `omnigent stop` | stop Omnigent services on the machine |
| `omnigent host [server]` | register local machine as a host |
| `omnigent setup` | choose models/credentials |
| `omnigent login <server_url>` | authenticate with remote server |
| `omni upgrade` / `omni upgrade --check` | upgrade or check for update |
| `omnigent claude` / `codex` / `cursor` / `opencode` / `hermes` / `pi` | native harness wrappers |

Platform note from the tagged README:

- Windows supports `omnigent server`, the web UI, and SDK-based harnesses
- Windows does not support the native tmux/PTY wrapper commands

Exit-code freeze for v0.1:

- successful command completion or help output: treat `0` as stable
- non-zero codes: upstream does not publish a stable numeric exit-code table at
  `v0.4.0`, so classify failures from stderr/body semantics instead of numeric
  codes alone

## Event Stream

Pinned stream contract:

- endpoint: `GET /v1/sessions/{session_id}/stream`
- mode: live tail only
- replay: none
- close sentinel: `data: [DONE]`
- reconnect contract:
  1. open the SSE stream
  2. fetch the snapshot with `GET /v1/sessions/{id}`
  3. dedupe snapshot items against streamed items by item id

Relevant event families for v0.1 mapping:

- session-scoped events:
  - `session.created`
  - `session.status`
  - `session.input.consumed`
  - `session.interrupted`
  - `session.child_session.updated`
  - `session.usage`
  - `session.model`
  - `session.model_options`
  - `session.reasoning_effort`
  - `session.collaboration_mode`
  - `session.agent_changed`
  - `session.todos`
  - `session.terminal_pending`
  - `session.sandbox_status`
  - `session.skills`
  - `session.superseded`
  - `session.presence`
  - `session.resource.created`
  - `session.resource.deleted`
  - `session.changed_files.invalidated`
  - `session.terminal.activity`
  - `session.heartbeat`
- response lifecycle and metadata events:
  - `response.created`
  - `response.queued`
  - `response.in_progress`
  - `response.output_text.delta`
  - `response.output_item.done`
  - `response.output_file.done`
  - `response.reasoning.started`
  - `response.reasoning_text.delta`
  - `response.reasoning_summary_text.delta`
  - `response.retry`
  - `response.error`
  - `response.compaction.in_progress`
  - `response.compaction.completed`
  - `response.compaction.failed`
  - `response.client_task.cancel`
  - `response.heartbeat`
  - `response.elicitation_request`
  - `response.elicitation_resolved`
  - `response.completed`
  - `response.failed`
  - `response.incomplete`
  - `response.cancelled`
- turn lifecycle events:
  - `turn.started`
  - `turn.completed`
  - `turn.failed`
  - `turn.cancelled`

Malformed stream handling is not a server replay feature. The official Python
client logs and skips malformed JSON, non-object payloads, and unknown event
types so one bad frame does not poison the stream.

## Error Taxonomy

Pinned error classes that downstream code may normalize:

| Surface | Class | Notes |
| --- | --- | --- |
| HTTP route | `400 bad_request` | malformed event payload, invalid fork/input shape, or unsupported event schema |
| HTTP route | `403 forbidden` | permission or owner-level requirement failures |
| HTTP route | `404 not_found` | missing session, source session, or child-session parent |
| HTTP route | `422 validation_error` | request validation error from route schema |
| SSE transport | `malformed_frame` | client must skip/log malformed or unknown frames |
| Capability gap | `blocked_capability` | child-session creation and harness override are not public v0.4.0 guarantees |
| Capability gap | `emulated_capability` | logical close and terminal uniqueness need provider-side normalization |

## Capability Matrix

| Capability | Status | Provenance | Downstream rule |
| --- | --- | --- | --- |
| `create_session` | `supported` | `POST /v1/sessions` in `API.md` and `openapi.json` | Safe to model as native transport capability |
| `send_turn` | `supported` | `POST /v1/sessions/{id}/events` with `message` | Safe to model as native transport capability |
| `stream_events` | `supported` | `GET /v1/sessions/{id}/stream` | Safe to model as native transport capability |
| `read_history` | `supported` | `GET /v1/sessions/{id}/items` and snapshot items | Safe to model as native transport capability |
| `cancel_turn` | `supported` | `interrupt` event bypasses queue and co-emits cancel markers | Safe to model as native transport capability |
| `close_session` | `emulated` | public surface has `stop_session` and destructive `DELETE`, but no stable non-destructive close endpoint | Provider may expose logical close only as a provider-owned emulation |
| `list_sessions` | `supported` | `GET /v1/sessions` | Safe to model as native transport capability |
| `harness_catalog` | `supported` | `GET /v1/harnesses` | Safe as read-only metadata; not launch authorization |
| `child_session` | `blocked` | public surface lists children and supports fork, but not public spawn-under-parent create | Downstream phases must return typed blocked/unavailable behavior |
| `harness_override` | `blocked` | `GET /v1/harnesses` is read-only; internal `sys_session_send args.harness` remains allowlist-gated in `spawn.py` | Do not model as public transport capability |
| `malformed_event` | `emulated` | invalid POST bodies fail `400`; official client skips malformed/unknown SSE frames | Provider must implement parser hardening locally |
| `reconnect` | `supported` | explicit stream-plus-snapshot dedupe contract and `active_response_id` reconnect hint | Safe to model as native transport capability |
| `terminal_event_uniqueness` | `emulated` | stream exposes both `response.*` and `turn.*` terminal edges | Provider must collapse duplicate terminal markers into one normalized outcome |

## Lifecycle Semantics

Pinned lifecycle rules for downstream phases:

- session lifecycle in docs: `idle -> running -> waiting -> running -> idle`,
  with `failed` as terminal
- send-turn behavior is queued through `POST /events` except `interrupt`, which
  bypasses the queue
- cancel behavior is explicit:
  - request: `{"type":"interrupt","data":{}}`
  - transport ack: `{"queued": false}`
  - stream side effects: `response.incomplete` with
    `reason="user_interrupt"` and `session.interrupted`
- logical close is not an upstream-native public session state:
  - `stop_session` stops the live runner without deleting the conversation
  - `DELETE /v1/sessions/{id}` deletes the session and resources
  - child-session tombstoning exists only on the internal tool path
- child sessions are observable through:
  - `GET /v1/sessions/{id}/child_sessions`
  - parent-stream `session.created`
  - parent-stream `session.child_session.updated`

## Fixture Index

| Fixture | Purpose |
| --- | --- |
| `fixtures/omnigent/discovery/source-metadata.json` | freeze target, upstream head probe, and source provenance |
| `fixtures/omnigent/discovery/cli-surface.json` | entry points, commands, platform notes, and exit-code posture |
| `fixtures/omnigent/discovery/http-surface.json` | pinned HTTP endpoints, status fields, and stream contract |
| `fixtures/omnigent/discovery/capability-probes.json` | normalized capability statuses with provenance |
| `fixtures/omnigent/events/normal-terminal.json` | successful turn terminal sequence |
| `fixtures/omnigent/events/cancel-interrupt.json` | interrupt request and cancel sequence |
| `fixtures/omnigent/events/reconnect-snapshot-dedupe.json` | reconnect ordering and dedupe contract |
| `fixtures/omnigent/events/malformed-sse-skip.json` | malformed-frame skip behavior |
| `fixtures/omnigent/events/dual-terminal-markers.json` | duplicate terminal-edge normalization case |
| `fixtures/omnigent/events/v0-4-noop-events.json` | representative v0.4 metadata/UI events that parse and no-op |
| `fixtures/omnigent/errors/invalid-event-400.json` | malformed or unsupported event POST failure |
| `fixtures/omnigent/errors/close-session-gap.json` | public close gap requiring emulation |
| `fixtures/omnigent/errors/child-session-blocked.json` | blocked public child-session creation |
| `fixtures/omnigent/errors/harness-override-blocked.json` | blocked public harness override |
| `fixtures/omnigent/fake-server/scenarios.json` | fake-server scenario catalog |
| `fixtures/omnigent/fake-server/README.md` | fake-server fixture usage contract |

## Downstream Decisions

- `IF-0-CONTRACT-1` is satisfied only by this document plus the fixture set
  under `fixtures/omnigent/`.
- `BOOTCORE` must treat the contract freeze as authoritative and model typed
  capability degradation, not assume every required capability is natively
  supported.
- `TRANSPORT` may implement only the pinned supported primitives as native
  behavior in v0.1:
  - `create_session`
  - `send_turn`
  - `stream_events`
  - `read_history`
  - `cancel_turn`
  - `list_sessions`
  - `harness_catalog`
  - `reconnect`
- `close_session` is provider-side emulation only unless a later contract freeze
  proves a stable upstream public close semantic.
- `child_session` and `harness_override` must return typed blocked or
  unavailable behavior at public provider boundaries.
- Session-state normalization must account for `launching` stream status edges
  even though the official `v0.4.0` snapshot status enum is now aligned on
  `waiting`.
