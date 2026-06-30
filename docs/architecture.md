# Architecture

COORDINATOR extends the repository with the first durable routing layer that
selects providers only after transport, limits, identity, worktree, and
handoff evidence are available:

```text
consumer repos
  -> @omniagent-plus/core-contracts
  -> @omniagent-plus/state-ledger
  -> @omniagent-plus/omnigent-transport
  -> @omniagent-plus/coordinator
  -> Omnigent runtime boundary
```

## Package Boundary

`@omniagent-plus/core-contracts` still owns the runtime-neutral public contract:

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

`@omniagent-plus/state-ledger` still owns the durable local backend slice:

- append-only JSONL ledger plus sidecar indexes
- schema-versioned migrations and retention compaction
- audit persistence for sessions, turns, events, routes, approvals, cooldowns,
  leases, capability snapshot records, and evidence refs
- replay APIs that do not require live Omnigent
- shared cooldown and worktree lease coordination across Node processes

`@omniagent-plus/omnigent-transport` now owns the real transport boundary for
`IF-0-TRANSPORT-4`:

- HTTP session creation, history reads, event posts, stream parsing, reconnect
  snapshot dedupe, and duplicate terminal normalization
- CLI fallback around documented `run`, `resume`, `attach`, and
  `server start/status/stop` commands
- hybrid local-server process ownership, heartbeat probes, parent-death cleanup,
  and timeout cleanup
- failure normalization into `RuntimeFailure` plus bounded limit-classification
  candidates
- capability snapshot generation and persistence through the durable ledger

`@omniagent-plus/coordinator` now owns `IF-0-COORDINATOR-9`:

- identity-pool inventory with cooldown, capability-fit, and active-turn
  accounting
- adaptive concurrency that reduces active-turn targets under burst,
  concurrency, health, and hard-cap pressure
- portability scoring and route planning across provider families when policy
  allows it
- durable route persistence that is persisted before launch and fails closed if
  append-before-launch cannot complete
- retry storm guardrails, failure policy, and replay-safe route explanations
  that stay `metadata_only`

## Explicit Non-Goals

- No live Omnigent requirement in CI.
- No governed-pipeline, CLI, or UI adapter code yet.
- No same-provider quota bypass through account hopping during provider-family
  cooldowns.
- No secret-bearing raw Omnigent payload exports from the public package.

COORDINATOR freezes transport-adjacent routing, replay, and cooldown behavior
without pretending downstream adapters, operator CLI UX, UI read models, or
release-dispatch surfaces are already complete.
