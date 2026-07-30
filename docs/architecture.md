# Architecture

CLI and the frozen UI read model extend the repository with an API-ready
control surface that reads the durable ledger, identity preflight state,
worktree lease state, limit classifications, route decisions, approvals,
handoff metadata, and cooldown state through one local entrypoint:

```text
consumer repos
  -> @consiliency/runtime-provider
  -> @omniagent-plus/state-ledger
  -> @omniagent-plus/identity-isolation
  -> @omniagent-plus/worktree-leasing
  -> @consiliency/omnigent-transport
  -> @omniagent-plus/coordinator
  -> @omniagent-plus/cli
  -> Omnigent runtime boundary
```

## Package Boundary

`@consiliency/runtime-provider` still owns the runtime-neutral public
contract:

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
- `UiControlSnapshot` plus the UI session/tree/approval/cooldown/read-model
  summary schemas that stay runtime-neutral and `metadata_only`

`@omniagent-plus/state-ledger` still owns the durable local backend slice:

- append-only JSONL ledger plus sidecar indexes
- schema-versioned migrations and retention compaction
- audit persistence for sessions, turns, events, routes, approvals, cooldowns,
  leases, capability snapshot records, and evidence refs
- replay APIs that do not require live Omnigent
- read-only replay that projects a `UiControlSnapshot` from durable records
- shared cooldown and worktree lease coordination across Node processes

`@omniagent-plus/identity-isolation` and `@omniagent-plus/worktree-leasing`
still own the reusable metadata-only operator primitives:

- committed identity profile loading and `identities preflight` status
  generation without hidden credential lookup
- worktree lease registry state, active-process checks, dirty-state checks, and
  cleanup blocking reasons

`@consiliency/omnigent-transport` still owns the real transport boundary for
`IF-0-TRANSPORT-4`:

- HTTP session creation, history reads, event posts, stream parsing, reconnect
  snapshot dedupe, and duplicate terminal normalization
- CLI fallback around documented `run`, `resume`, `attach`, and
  `server --background`, `server status --json`, and `server stop` commands
- hybrid local-server process ownership, heartbeat probes, parent-death
  cleanup, and timeout cleanup
- failure normalization into `RuntimeFailure` plus bounded limit-classification
  candidates
- capability snapshot generation and persistence through the durable ledger

`@omniagent-plus/coordinator` still owns `IF-0-COORDINATOR-9`:

- identity-pool inventory with cooldown, capability-fit, and active-turn
  accounting
- adaptive concurrency that reduces active-turn targets under burst,
  concurrency, health, and hard-cap pressure
- portability scoring and route planning across provider families when policy
  allows it
- durable route persistence that is persisted before launch and fails closed if
  append-before-launch cannot complete
- CS-2.2 lease arbitration that can acquire a published Consiliency soft/hard
  lease before launch and fail closed on hard conflicts or unavailable hard
  backends
- retry storm guardrails, failure policy, and replay-safe route explanations
  that stay `metadata_only`

`@omniagent-plus/cli` now owns `IF-0-CLI-11`:

- one local entrypoint,
  `pnpm --filter @omniagent-plus/cli cli -- <command>`,
  for `health`, `sessions list`, `sessions show`, `control snapshot`,
  `route-task`, `classify-limit`, `identities list`,
  `identities preflight`, `worktrees list`, and `worktrees cleanup`
- a schema-backed `--json` envelope with `schema`, `ok`, `command`,
  `stateRoot`, and typed `result` or `error` payloads
- human-readable output derived from the same redacted `metadata_only` command
  result used for JSON output
- explicit `state-root` selection so repeated invocations share the same
  durable backend
- read-only `control snapshot` replay that does not append ledger records,
  does not require live Omnigent, and can return an empty snapshot when the
  selected `state-root` has no durable ledger yet
- typed exit code categories for argument errors, missing records, validation
  failures, policy blocks, cleanup blocks, route blocks, and unexpected
  internal failures
- coordination lease and inbox commands for local or Supabase-backed
  control-plane state, with metadata-only output and no secret values
- dry-run-by-default `classify-limit` and `route-task` behavior that records
  durable metadata only when `--record` is passed

## UI Read Model

`IF-0-UI-12` deliberately stops at an API-ready surface:

- `@consiliency/runtime-provider` validates the exported session tree, active
  turn, route decision, approval, cooldown, worktree lease, handoff, limit
  classification, and evidence-ref summaries.
- `@omniagent-plus/state-ledger` replays durable records into
  `UiControlSnapshot` without importing Omnigent transport internals,
  `.phase-loop` runtime state, ignored/private inputs, or secret-bearing env
  config.
- `@omniagent-plus/cli` exposes that snapshot through
  `pnpm --filter @omniagent-plus/cli cli -- control snapshot [--state-root <path>] [--json]`.
- Every UI-facing string/path is bounded through the existing metadata and
  untrusted-text sanitizers, so the surface stays `metadata_only` and never
  exposes raw transcripts, provider payloads, or secret-bearing paths.

See [docs/ui-read-model.md](./ui-read-model.md) for the command contract,
redaction posture, verification commands, and the `no_spec_delta` closeout
decision for this phase.

## Explicit Non-Goals

- No live Omnigent requirement in CI.
- No global install or release packaging for the CLI package in this phase.
- No hidden credential lookup, bearer token output, raw provider payload
  output, or unbounded transcript output from CLI commands.
- No provider launch side effects from `route-task` or `classify-limit`.
- No same-provider quota bypass through account hopping during provider-family
  cooldowns.
- No browser UI shell, marketing page, or account-mutation surface in this
  phase.

CLI freezes the operator-facing `state-root`, `--json`, and exit-code
behavior, while the UI read model freezes the API-ready `metadata_only`
control snapshot without pretending a browser UI or hardening/release surface
is already complete.
