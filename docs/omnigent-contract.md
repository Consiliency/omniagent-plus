# Omnigent Contract Freeze

This document defines `IF-0-CONTRACT-1` for `agent-runtime-provider-omnigent`.
It freezes the Omnigent surface that downstream phases may rely on for v0.1.

## Supported Version

- Freeze target: `omnigent` release `v0.3.0`
- Release commit: `4edb4d95b95fd2748f3f119628936d75511918e9`
- Release published: `2026-06-27T05:21:16Z`
- Python requirement at the freeze target: `>=3.12`
- Authoritative downstream gate: `IF-0-CONTRACT-1`

The upstream `main` branch remains ahead of the latest release
(`f46a256df68f1c7f4a577f9b53f7902b14371c53` observed on `2026-07-01`), so
`main` is not authoritative for this freeze. Unreleased-main readiness is
tracked separately in `docs/omnigent-upstream-readiness.md`.

## Source Provenance

This phase used metadata-only source inspection and safe command probes. No
credentials, live provider accounts, or secret-bearing environment dumps were
required.

Primary sources inspected at `v0.3.0`:

- `pyproject.toml`
- `README.md`
- `openapi.json`
- `omnigent/server/API.md`
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

Pinned session surface at `v0.3.0`:

| Method | Path | Provider use |
| --- | --- | --- |
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

Session event input types explicitly documented in `API.md` include:

- `message`
- `interrupt`
- `compact`
- `stop_session`

Session status drift that downstream code must handle:

- `API.md` documents session statuses `idle`, `running`, `waiting`, `failed`
- `session.status` SSE events also document `waiting`
- `openapi.json` at `v0.3.0` exposes `SessionResponse.status` as only
  `idle`, `running`, `failed`

Downstream implication: do not derive the exhaustive runtime session-state
contract from the release OpenAPI enum alone.

## CLI Surface

Entry points pinned at `v0.3.0`:

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
  `v0.3.0`, so classify failures from stderr/body semantics instead of numeric
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
  - `session.status`
  - `session.input.consumed`
  - `session.interrupted`
  - `session.created`
  - `session.child_session.updated`
- response lifecycle events:
  - `response.created`
  - `response.queued`
  - `response.in_progress`
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
| Capability gap | `blocked_capability` | child-session creation and harness override are not public v0.3.0 guarantees |
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
| `child_session` | `blocked` | public surface lists children and supports fork, but not public spawn-under-parent create | Downstream phases must return typed blocked/unavailable behavior |
| `harness_override` | `blocked` | internal `sys_session_send args.harness` is allowlist-gated in `spawn.py` only | Do not model as public transport capability |
| `malformed_event` | `emulated` | invalid POST bodies fail `400`; official client skips malformed/unknown SSE frames | Provider must implement parser hardening locally |
| `reconnect` | `supported` | explicit stream-plus-snapshot dedupe contract in `API.md` and `_sessions.py` | Safe to model as native transport capability |
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
| `fixtures/omnigent/discovery/http-surface.json` | pinned HTTP endpoints, status drift, and stream contract |
| `fixtures/omnigent/discovery/capability-probes.json` | normalized capability statuses with provenance |
| `fixtures/omnigent/events/normal-terminal.json` | successful turn terminal sequence |
| `fixtures/omnigent/events/cancel-interrupt.json` | interrupt request and cancel sequence |
| `fixtures/omnigent/events/reconnect-snapshot-dedupe.json` | reconnect ordering and dedupe contract |
| `fixtures/omnigent/events/malformed-sse-skip.json` | malformed-frame skip behavior |
| `fixtures/omnigent/events/dual-terminal-markers.json` | duplicate terminal-edge normalization case |
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
  - `reconnect`
- `close_session` is provider-side emulation only unless a later contract freeze
  proves a stable upstream public close semantic.
- `child_session` and `harness_override` must return typed blocked or
  unavailable behavior at public provider boundaries.
- Session-state normalization must account for the release drift where
  `waiting` is documented in `API.md` and `session.status` SSE but omitted from
  the `SessionResponse` enum in `openapi.json`.
