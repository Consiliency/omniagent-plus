# Coordination Backend

CS-2.2 adds the off-device control-plane lease layer for multi-agent
coordination. The layer lives in `omniagent-plus`; it does not modify
Consiliency canon, governed-pipeline, Portal projection code, or harness
runtime code.

## Contract Pin

The implementation consumes the published Consiliency contract package by pin:

- npm: `@consiliency/contract@0.6.3`
- PyPI counterpart: `consiliency-contract==0.6.3`

The package provides the authoritative lease store and coordination channel
schemas plus conformance vectors. `omniagent-plus` loads those package files at
runtime for tests and adapters; it does not copy or fork the schemas.

## Store Authority

The lease store is the only source of truth for lock state.

- `LeaseStore.acquire` grants `soft` or `hard` leases with TTL and heartbeat.
- `LeaseStore.renew` extends heartbeat for the holder.
- `LeaseStore.release` is holder-only and idempotent for missing leases.
- `LeaseStore.query` reads the current projection.
- `CoordinationChannel.send/list` is append-only inbox traffic.

Inbox messages such as `announce-intent`, `request-yield`, `handoff`, and
`done` never acquire, renew, release, transfer, or expire a lease. They may
prompt an actor to call the store, but the store operation is the mutation.

## Backends

The local backend is file-backed under the selected `--state-root` and is useful
for development, tests, and dry-run operator workflows.

The Supabase backend is enabled by:

```bash
OMNIAGENT_COORDINATION_BACKEND=supabase
OMNIAGENT_COORDINATION_SUPABASE_URL=<redacted>
OMNIAGENT_COORDINATION_SUPABASE_SERVICE_ROLE_KEY=<redacted>
```

The service role key belongs to the coordinator process. Agents and CLI output
must not print or receive the raw secret value.

Hard-mode Supabase unavailability fails closed. It must not silently downgrade
to local soft coordination.

## Supabase Schema

The migration creates:

- `coordination_lease_events`, an append-only lease event stream
- `coordination_current_leases`, the current lease projection
- `coordination_inbox_messages`, an append-only negotiation channel
- RPC functions for acquire, renew, release, query, expiry, send, and list

Hard acquire runs in a database transaction and checks live hard-mode scope
overlap before inserting the projection row and event.

## Operator Commands

The CLI exposes:

```bash
pnpm --filter @omniagent-plus/cli cli -- coordination leases list --json
pnpm --filter @omniagent-plus/cli cli -- coordination leases acquire --holder holder-a --scope path-set:packages/cli --mode hard --ttl-seconds 300 --json
pnpm --filter @omniagent-plus/cli cli -- coordination leases renew --lease-id lease:... --holder holder-a --json
pnpm --filter @omniagent-plus/cli cli -- coordination leases release --lease-id lease:... --holder holder-a --json
pnpm --filter @omniagent-plus/cli cli -- coordination inbox send --type request-yield --sender holder-b --scope path-set:packages/cli --json
pnpm --filter @omniagent-plus/cli cli -- coordination inbox list --json
```

`route-task` can opt into lease arbitration with:

```bash
pnpm --filter @omniagent-plus/cli cli -- route-task --task-id task-1 --coordination-scope path-set:packages/cli --coordination-holder holder-a --json
```

When a hard conflict is found, route planning records lease arbitration metadata
and returns a route block before provider launch.

Local smoke proof:

```bash
pnpm exec vite-node scripts/coordination-smoke-test.ts
```

## Upstream Omnigent State

Official Omnigent `v0.5.1` is the supported release target. Its read-only
worktree inventory, resource file-copy, and sharing APIs are optional transport
surfaces; they do not expose lease, lock, coordination, or inbox semantics.
CS-2.2 therefore continues to own this control-plane layer in
`omniagent-plus`.
