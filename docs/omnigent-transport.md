# Omnigent Transport

`@consiliency/omnigent-transport` satisfies `IF-0-TRANSPORT-4`.
It adds the first real Omnigent transport package on top of the frozen
contract, the runtime-neutral core contracts, and the durable state ledger.

## Transport Modes

- `HTTP` mode uses only the pinned harness catalog, session, items, stream,
  event, child-session, fork, patch, switch-agent, and read-state endpoints from
  `docs/omnigent-contract.md`. `read-state` and `GET /v1/harnesses` are official
  `v0.7.0` public surface and remain metadata-only at this provider boundary.
- `CLI` mode uses only documented `omnigent run`, `resume`, `attach`, and
  `server --background`, `server status --json`, and `server stop` commands.
  Background-start prose is treated as command output; machine status is read
  from the direct JSON status object. `cancel` remains a typed blocked
  capability because the freeze does not publish a stable cancel command.
- `hybrid` mode starts or probes the local Omnigent server through the CLI
  surface, then delegates session traffic through the HTTP provider.

## Event And Failure Mapping

The package maps Omnigent session/history/stream traffic into
`AgentRuntimeProvider` sessions, turn handles, and runtime events. Raw event and
history payload types remain internal; the read-only session snapshot and native
model-option response types are deliberate public exports.

- reconnect opens the stream, reads the snapshot, uses `active_response_id` as
  active turn identity when present, and dedupes by `item.id`
- malformed SSE frames are skipped instead of poisoning the stream
- duplicate upstream terminal markers collapse into one normalized terminal turn
- upstream `launching` session status maps to the neutral `starting` state
- official `v0.7.0` UI/admin/resource/reasoning/usage/heartbeat events are
  accepted and no-op mapped unless they affect provider state
- `session.mcp_startup` metadata is preserved on the session metadata object;
  `session.mcp_startup` and `response.policy_denied` stream events remain
  known no-ops
- `browser.action_request` and `response.function_call_output.delta` preserve
  raw metadata but remain neutral no-ops; this transport neither executes
  desktop browser actions nor promotes tool output to assistant text
- HTTP, CLI, stream, process, auth/billing, policy, rate-limit-like, and
  unsupported-capability failures normalize to `RuntimeFailure`
- auth/billing, policy, and rate-limit-like signals also produce bounded
  `LimitClassification` candidates with metadata-only diagnostics

## Capability Snapshot And Process Ownership

Capability probe and storage stay durable:

- `probeOmnigentCapabilities` builds frozen `OmnigentCapabilitySnapshot` records
  from provider health plus the pinned contract metadata
- `OmnigentCapabilityStore` persists those capability snapshot records through
  the structural `OmnigentCapabilityLedger` contract;
  `AuditLedger.appendCapabilitySnapshot` remains the workspace implementation

CLI and hybrid process ownership are explicit:

- the process manager owns one process group at a time
- heartbeat and parent-death probes trigger timeout cleanup
- `closeSession` remains provider-emulated logical close
- no live Omnigent process is required in CI because the suite uses the fake
  server, fake command runners, and metadata-only fixtures

## Release Surface

The v0.7.0 project, usage, credential, installation, model-option, MCP-header,
expanded import, auto-title, lineage, host-worktree, resource-copy, sharing, and
`existing_worktree` surfaces are not provider requirements. Session project and
native model options are accepted as additive response metadata only. Export,
import, debug-log, and ACP harness CLI commands are likewise outside the adapter
command contract. No administration method is added to `OmnigentHttpClient`,
and none of these surfaces substitute for the CS-2.2 lease store.

TRANSPORT is a non-dispatch phase. The docs were updated for HTTP, CLI, hybrid,
process ownership, capability snapshot persistence, and no live Omnigent CI
posture, while changelog and release-note surfaces stay untouched.
