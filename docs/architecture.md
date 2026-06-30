# Architecture

STATELEDGER extends the repository with a durable local ledger layer:

```text
consumer repos
  -> @omniagent-plus/core-contracts
  -> @omniagent-plus/state-ledger
  -> later transport / adapter packages
  -> Omnigent runtime boundary
```

## Package Boundary

`@omniagent-plus/core-contracts` owns the public TypeScript-first contract that
later phases build on:

- `AgentRuntimeProvider`
- `AgentSession`
- `TurnHandle`
- `RuntimeEventEnvelope`
- `HandoffPacket`
- `LimitClassification`
- `RouteDecision`
- `RuntimeFailure`
- `IdentityProfile`
- `WorktreeLease`

The package also owns the lifecycle reducers and the fake provider used to
prove idempotency, one-active-turn policy, replay cursors, sequence gaps,
heartbeats, cancellation, and exactly-one terminal event normalization.

`@omniagent-plus/state-ledger` now owns the first durable backend slice:

- append-only JSONL ledger plus sidecar indexes
- schema-versioned migrations and retention compaction
- audit persistence for sessions, turns, events, routes, approvals, cooldowns,
  leases, capability snapshots, and evidence refs
- replay APIs that do not require live Omnigent
- shared cooldown and worktree lease coordination across Node processes

## Explicit Non-Goals

- No real Omnigent HTTP, CLI, or subprocess transport code.
- No governed-pipeline or agent-harness adapter code.

Those surfaces stay blocked until later interface-freeze gates. STATELEDGER
only freezes the durable local state layer needed for
`IF-0-STATELEDGER-3`; transport, routing policy, release dispatch, and external
release-note surfaces remain downstream work.
