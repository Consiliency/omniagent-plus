# Coordination Backend

## COORD behavior

COORD keeps contract0.6.3 pinned. The forward PostgreSQL migration uses server time
after advisory lock acquisition for mutations; compatibility caller clocks are
ignored. Query expiry uses server statement time without mutation. Holder checks
and event/projection writes are transactional. RLS stays enabled; only
service_role executes coordination RPCs. Tests use admitted disposable SQL.

Lease and inbox lists default100, maximum500, positive whole limits. Cursor is
after-(returned timestamp,ID), ascending whole-second UTC plus UTF-8 bytewise
IDs (SQL C collation), including existing fractional rows. Scope/type/mode filters
precede pagination. Read-only hard-route admission queries overlapping hard
leases with limit1; an earlier soft page cannot hide conflict. Pages read current
state, not pinned snapshots. CLI --cursor accepts JSON timestamp/id strings.

Inbox entries expire after7days. Local creation/expiry uses an injected clock,
never message.now; SQL uses server time. Writes normalize legacy future times
and prune expiry under the same lock before enforcing10000 retained entries.
Reads filter expiry without pruning. Overflow preserves unexpired entries.
Local and SQL legacy timestamp normalization is durable even when admission is refused,
so future-dated entries can subsequently expire; their IDs and bodies remain.
These are retained advisory histories, not indefinitely append-only inboxes.
Failed yield delivery leaves hard refusal intact with private sent=false/cause.
No acknowledgement, transfer or ownership derives from delivery.

Local live leases and event history are each bounded at10000. The protected
acquisition plus latest-heartbeat records can exhaust the event budget before
the live-lease bound; capacity depends on retained proof, not just lease count.
SQL caps unprotected
released/event history at10000, preserving active acquisition/current proof.
Protected overflow refuses mutation. Bounded causes are authentication,
permission, timeout, transport, validation, malformed-response, unavailable and
capacity. Missing/blank config is unavailable; invalid URL is validation.
Real SDK/offline-fetch tests prove mapping only; SQL tests prove SQL only.
Neither establishes hosted Supabase acceptance or authorizes production migration.

TTL values are whole seconds from1through7200; invalid mutation inputs refuse
before local lock/state creation or routing arbitration effects.
Default route-task is read-only. --record with valid preferences may acquire
leases/request yield and persist actual arbitration; it never launches a provider.

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
- `CoordinationChannel.send/list` is retained, expiring advisory inbox traffic.

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

- `coordination_lease_events`, a bounded lease event history
- `coordination_current_leases`, the current lease projection
- `coordination_inbox_messages`, a bounded, expiring negotiation channel
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

Official Omnigent `v0.12.0` is the supported release target. Smart routing,
smart-routing sources, child routing and task-summary metadata, usage
reporting, branding, server discovery, environment search, session routing
override, imports, projects, hosts, credentials, and model discovery are
transport or administration surfaces. Upstream shared-editor approval behavior
and v0.11 permission-mode/title/background-task metadata, plus v0.12
project-aware create/import, configurable forks, existing-branch checkout, and
elicitation verdict metadata, also remain
upstream-only. None of these surfaces can acquire, renew, release,
transfer, or override a CS-2.2 lease or lock, create a neutral route decision,
or grant coordinator authority. The lease store remains the sole source of
truth for this control-plane layer in `omniagent-plus`.
