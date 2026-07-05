# Omnigent Transport

`@omniagent-plus/omnigent-transport` satisfies `IF-0-TRANSPORT-4`.
It adds the first real Omnigent transport package on top of the frozen
contract, the runtime-neutral core contracts, and the durable state ledger.

## Transport Modes

- `HTTP` mode uses only the pinned harness catalog, session, items, stream,
  event, child-session, fork, patch, switch-agent, and read-state endpoints from
  `docs/omnigent-contract.md`. `read-state` and `GET /v1/harnesses` are official
  `v0.4.0` public surface and remain metadata-only at this provider boundary.
- `CLI` mode uses only documented `omnigent run`, `resume`, `attach`, and
  `server start/status/stop` commands. It keeps `cancel` as a typed blocked
  capability because the freeze does not publish a stable cancel command.
- `hybrid` mode starts or probes the local Omnigent server through the CLI
  surface, then delegates session traffic through the HTTP provider.

## Event And Failure Mapping

The package maps Omnigent session/history/stream traffic into
`AgentRuntimeProvider` sessions, turn handles, and runtime events without
exporting raw Omnigent payload types from the public package boundary.

- reconnect opens the stream, reads the snapshot, uses `active_response_id` as
  active turn identity when present, and dedupes by `item.id`
- malformed SSE frames are skipped instead of poisoning the stream
- duplicate upstream terminal markers collapse into one normalized terminal turn
- upstream `launching` session status maps to the neutral `starting` state
- official `v0.4.0` UI/admin/resource/reasoning/usage/heartbeat events are
  accepted and no-op mapped unless they affect provider state
- HTTP, CLI, stream, process, auth/billing, policy, rate-limit-like, and
  unsupported-capability failures normalize to `RuntimeFailure`
- auth/billing, policy, and rate-limit-like signals also produce bounded
  `LimitClassification` candidates with metadata-only diagnostics

## Capability Snapshot And Process Ownership

Capability probe and storage stay durable:

- `probeOmnigentCapabilities` builds frozen `OmnigentCapabilitySnapshot` records
  from provider health plus the pinned contract metadata
- `OmnigentCapabilityStore` persists those capability snapshot records through
  `AuditLedger.appendCapabilitySnapshot`

CLI and hybrid process ownership are explicit:

- the process manager owns one process group at a time
- heartbeat and parent-death probes trigger timeout cleanup
- `closeSession` remains provider-emulated logical close
- no live Omnigent process is required in CI because the suite uses the fake
  server, fake command runners, and metadata-only fixtures

## Release Surface

TRANSPORT is a non-dispatch phase. The docs were updated for HTTP, CLI, hybrid,
process ownership, capability snapshot persistence, and no live Omnigent CI
posture, while changelog and release-note surfaces stay untouched.
