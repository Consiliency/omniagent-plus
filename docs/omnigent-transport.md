# Omnigent Transport

`@consiliency/omnigent-transport@0.7.0` implements the official Omnigent
`v0.12.0` boundary while preserving the neutral runtime-provider contract.

## Modes

- HTTP accepts an existing named agent, or uses an explicit agent-id resolver.
  It serializes official create/message JSON, normalizes epoch/snake-case
  responses, consumes complete cursor pagination, and maps persisted
  `ConversationItem` history separately from tagged SSE. Child summaries
  preserve optional nullable `task_summary` as read-only metadata.
- CLI retains `omnigent run`, resume/attach, and the canonical
  `omnigent server --background` lifecycle. The hidden `server start` alias is
  evidence only and is not invoked. `omnigent start` and
  `omnigent host --background` remain non-provider operator commands.
- Hybrid retains CLI process readiness and HTTP session/history delegation.

Create and send idempotency are intentionally process-local. Duplicate keys in
one provider process share an in-flight or completed promise; transport/server
failures are evicted for retry. A synchronous policy denial remains cached and
does not create an active turn. Accepted sends return a provisional handle from
`item_id`, `pending_id`, or a namespaced local key until official response
identity arrives through snapshot or lifecycle evidence.

The neutral provider defaults to one active turn per session. A distinct send
while local state is active fails with `concurrency_limit`; Omnigent pending-input
queueing is available only through the explicit `allowQueuedTurns` option and is
reflected by the returned queued handle.

Omnigent interrupt and stop controls are session-scoped and carry no turn
identity or fencing token. HTTP and hybrid cancellation/close therefore fail
with `backend_capability_missing` unless `withExclusiveSessionLease` and
`sessionMutationFenceStore` are configured. Both hooks must use the same
fleet-wide authority shared by every client that can mutate the session. The
provider runs send, cancel, and close through the lease; the store keeps pending
cancellation, rejected response IDs, pending close, and logical close visible
across clients. Ambiguous stop acknowledgements retain the pending close fence;
only explicit policy denial rolls it back. Late consumption of a cancelled
pending input similarly restores its cancellation fence until correlated
lifecycle arrives. Non-retryable or stream-proven send rejection identities are
persisted for replacement providers, including polling paths. A fresh upstream
`running` or `waiting` snapshot blocks default admission even without identity
fields. Durable lease and fence ownership remain outside this package.

HTTP error bodies remain lossless `unknown` values, including v0.10 `title`,
`cause`, `remediation`, and unknown additive fields. Failure mapping classifies
only a plain-string body or canonical `code`, `message`, and legacy `error`
fields, including supported `detail` envelopes. Descriptive fields containing
billing, auth, quota, monthly, or usage-cap words cannot alter retryability or
failure policy.

## Event Boundary

The v0.12 live allowlist remains exactly 54 tagged types. A stateful SSE
normalizer handles nested response objects, route/session identifiers, missing
timestamps, stable item IDs, and response context before calling the neutral
mapper. Reconnect completes the stream handshake before snapshot/history reads and
closes the stream on every exit.

The two v0.11 additions, `session.permission_mode` and `session.title`, remain
raw metadata-only no-ops. A pre-allocation `response.failed` with
`status: "failed"` and no response ID is accepted, assigned only synthetic event
identity, and attributed to a turn only when existing correlation is
unambiguous. Background-task detail is preserved best-effort without becoming
lifecycle or control authority.

V0.12 `response.elicitation_resolved` verdicts are validated, identity-free
metadata-only no-ops. Only the required `elicitation_id`, an optional
`accept`/`decline`/`cancel` action, and a synthetic event ID survive. Absent and
explicit-null actions normalize alike, and forged lifecycle or item identities
cannot reach mapper, dedupe, cancellation, or fence state.

Persisted history maps messages, tool calls/results, errors, and interruptions.
It does not synthesize successful completion. Metadata-only rows and stream
events remain no-ops unless they carry an existing neutral lifecycle meaning.
Child `session.created`, routing decisions, browser actions, and uncorrelated
bare turns do not broaden the neutral vocabulary.

Project-aware create and import, configurable forks, existing-branch
worktrees, and the bare-`omni` behavior change remain upstream administration
surfaces. The HTTP provider keeps its legacy required-agent create body, and
the process manager keeps the canonical `omnigent server --background`,
`server status --json`, and `server stop` lifecycle.

`response.output_text.delta` is behaviorally unchanged. Equal identity-free
text remains undecidable and is emitted losslessly; replay is deduplicated only
when item/message identity or process-local cursor evidence supports it.

## Boundary

Logical close and terminal uniqueness remain provider emulations. Child spawn,
public harness override, smart-routing authority, approval delegation, lease,
and lock remain outside this package. No XG-1 authority or coordinator behavior
is changed. Stable upstream bundle-root isolation and shared-editor approval
behavior are recorded facts, not capabilities implemented or granted by this
transport.
