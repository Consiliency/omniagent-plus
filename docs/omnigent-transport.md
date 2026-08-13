# Omnigent Transport

`@consiliency/omnigent-transport@0.5.0` implements the official Omnigent
`v0.9.0` boundary while preserving the neutral runtime-provider contract.

## Modes

- HTTP accepts an existing named agent, or uses an explicit agent-id resolver.
  It serializes official create/message JSON, normalizes epoch/snake-case
  responses, consumes complete cursor pagination, and maps persisted
  `ConversationItem` history separately from tagged SSE.
- CLI retains `omnigent run`, resume/attach, and the canonical
  `omnigent server --background` lifecycle. The hidden `server start` alias is
  evidence only and is not invoked.
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

Omnigent v0.9 interrupt and stop controls are session-scoped and carry no turn
identity or fencing token. HTTP and hybrid cancellation/close therefore fail
with `backend_capability_missing` unless `withExclusiveSessionLease` and
`sessionMutationFenceStore` are configured. Both hooks must use the same
fleet-wide authority shared by every client that can mutate the session. The
provider runs send, cancel, and close through the lease; the store keeps pending
cancellation, rejected response IDs, pending close, and logical close visible
across clients. Ambiguous stop acknowledgements retain the pending close fence;
only explicit policy denial rolls it back. Late consumption of a cancelled
pending input similarly restores its cancellation fence until correlated
lifecycle arrives. Durable lease and fence ownership remain outside this package.

## Event Boundary

The live allowlist remains exactly 52 tagged types. A stateful SSE normalizer
handles nested response objects, route/session identifiers, missing timestamps,
stable item IDs, and response context before calling the neutral mapper.
Reconnect completes the stream handshake before snapshot/history reads and
closes the stream on every exit.

Persisted history maps messages, tool calls/results, errors, and interruptions.
It does not synthesize successful completion. Metadata-only rows and stream
events remain no-ops unless they carry an existing neutral lifecycle meaning.
Child `session.created`, routing decisions, browser actions, and uncorrelated
bare turns do not broaden the neutral vocabulary.

## Boundary

Logical close and terminal uniqueness remain provider emulations. Child spawn,
public harness override, smart-routing authority, approval delegation, lease,
and lock remain outside this package. No XG-1 authority or coordinator behavior
is changed.
