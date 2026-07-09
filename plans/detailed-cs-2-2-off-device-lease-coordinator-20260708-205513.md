# Detailed plan: CS-2.2 off-device lease backend and coordinator

## Metadata

- Task: CS Phase 2 / CS-2.2 multi-agent off-device LEASE/LOCK backend and coordinator.
- Repo: `omniagent-plus`
- Plan hub: `~/code/consiliency-portal/plans/unification/`
- Run ID: `20260708-205513`
- Created: `2026-07-08T20:55:13Z`
- Owner skill: `codex-plan-detailed`
- Branch state: detached HEAD at merged Omnigent v0.4 adaptation history.

## Decision

The existing design is sufficient, but the CS-2.2 label needs a scope refresh.
Treat CS-2.2 as the control-plane lease layer: a Supabase-backed durable
`LeaseStore`, append-only coordination inbox, and `omniagent-plus` coordinator
that arbitrates concurrent agents across the fleet.

Do not treat CS-2.2 as canon extraction, gp-runner work, Portal projection work,
compute-offload runner work, or an upstream Omnigent API chase.

## Current evidence

- `ROADMAP-consiliency-standardization.md` already deferred the hard-mode
  off-device backend from CS-0.10d into CS-2.2: Portal Supabase control-plane
  store, fleet inbox, and omniagent-plus coordinator with crash recovery.
- `COORDINATION-deconfliction.md` defines the right boundary:
  - freshness pointer is git-derived and reactive;
  - intent lease is proactive and authoritative only in the lease store;
  - inbox is negotiation only and never mutates leases by itself.
- `DESIGN-compute-offload.md` is adjacent only. CS-2.2 may coordinate remote
  work, but it must not build or mutate the compute runner.
- `COORDINATION-PLAN.md` keeps XG/canon/spec/gp/portal projection work separate.
- Local repo state has only local coordination today:
  - `packages/state-ledger/src/coordination.ts` stores cooldowns and exclusive
    leases in local files.
  - `packages/worktree-leasing/src/lease-manager.ts` supports local acquire,
    renew, release, stale recovery, and fencing tokens.
  - `packages/worktree-leasing/src/locks.ts` is filesystem-only.
  - `packages/coordinator/src/route-planner.ts` and `route-store.ts` do not
    arbitrate off-device leases or fleet inbox messages.
- Published contract artifacts are available:
  - npm `@consiliency/contract@0.6.3`
  - PyPI `consiliency-contract==0.6.3`
  - npm pack includes `core/schemas/lease-store-protocol.schema.json`,
    `lease.schema.json`, `lease-event.schema.json`,
    `coordination-channel-protocol.schema.json`, `coordination-scenario.schema.json`,
    and lease/coordination conformance vectors.
- Upstream Omnigent state checked on `2026-07-08`:
  - release `v0.4.0`, published `2026-07-03T01:36:56Z`, target
    `release/v0.4.0`, tag commit `31669e1b413216c865d0ed7dfb469fb142c889f5`;
  - upstream `main` at `f1226aaa51068ace55f7d31a4b379b138ae7e221`;
  - `v0.4.0` OpenAPI has 57 paths, `main` has 59 paths;
  - `main` adds `/v1/hosts/{host_id}/worktrees` and
    `/v1/sessions/{session_id}/resources/files:copy`;
  - neither `v0.4.0` nor `main` exposes lease, lock, coordination, or inbox API
    paths;
  - `active_response_id`, `/v1/harnesses`, and
    `/v1/sessions/{session_id}/read-state` remain present.

## Deconfliction

CS-2.2 owns only the off-device coordination control plane inside
`omniagent-plus`.

Clear boundaries:

- Do not modify `consiliency-spec`, `governed-pipeline`,
  `consiliency-portal`, `agent-harness`, or canon/gp/portal-projection runtime.
- Do not change XG-1 authority crypto or canonical byte generation.
- Do not implement CS-2.3 public canon extraction here.
- Do not implement compute-offload execution, Dagger runner behavior, or host
  scheduling here.
- Do not depend on unmerged upstream Omnigent `main` APIs for lock semantics.
- Consume the published Consiliency contract package by version pin; no vendored
  schema fork and no third source of truth.

Blockers:

- No cross-repo blocker is present as of this plan. The published contract
  artifacts already contain lease store and coordination channel schemas plus
  vectors.
- If execution discovers that `@consiliency/contract@0.6.3` lacks a needed
  lease/inbox semantic, stop and request a contract release. Do not patch the
  contract repo from this CS-2.2 PR.

## Target architecture

Implement three local interfaces in `omniagent-plus` and back them with
Supabase when enabled:

1. `LeaseStore`
   - `acquire(request): Promise<LeaseAcquireResult>`
   - `renew(leaseId, fencingToken, ttl): Promise<LeaseRenewResult>`
   - `release(leaseId, fencingToken, reason): Promise<LeaseReleaseResult>`
   - `query(scope): Promise<LeaseSnapshot>`
   - hard mode requires atomic acquire;
   - soft mode records intent but does not block;
   - TTL expiry and fencing token mismatch are hard failures.

2. `CoordinationChannel`
   - `send(message): Promise<CoordinationMessageReceipt>`
   - `list/query(filters): Promise<CoordinationMessage[]>`
   - `subscribe(filters, handler)` when running as a long-lived coordinator;
   - messages include announce-intent, request-yield, handoff, and done;
   - messages never acquire, release, renew, or transfer a lease by themselves.

3. `LeaseArbiter`
   - called by route planning before launching work;
   - uses published contract schemas, current lease projection, inbox messages,
     and local route/handoff context;
   - chooses acquire, wait, request-yield, reroute, or fail-closed;
   - owns crash-recovery sweeps and heartbeat renewal.

## Supabase data model

Create migrations owned by this repo, with no secrets checked in.

Tables:

- `coordination_lease_events`
  - append-only event stream;
  - event id, lease id, event type, repo id, scope kind, canonical scope key,
    holder identity, mode, fencing token, ttl/expires-at, payload jsonb,
    created-at.
- `coordination_current_leases`
  - projected live state;
  - one row per active or recently expired lease;
  - holder, mode, scope, fencing token, acquired-at, renewed-at, expires-at,
    released-at, state.
- `coordination_inbox_messages`
  - append-only negotiation messages;
  - message type, repo id, scope, sender, target holder optional, handoff packet
    ref optional, payload jsonb, created-at, acknowledged-at optional.

RPC/functions:

- `coordination_acquire_lease(request jsonb) returns jsonb`
  - runs in one transaction;
  - expires stale rows first;
  - obtains a transaction advisory lock for repo plus normalized scope;
  - rejects live hard-mode scope overlap;
  - inserts acquire event and projection row;
  - returns lease plus fencing token.
- `coordination_renew_lease(request jsonb) returns jsonb`
  - requires matching lease id and fencing token;
  - extends `expires_at`;
  - inserts renew event.
- `coordination_release_lease(request jsonb) returns jsonb`
  - requires matching lease id and fencing token unless called by the recovery
    sweeper with service-role authority;
  - inserts release event and updates projection.
- `coordination_expire_leases(now timestamptz) returns integer`
  - expires stale projection rows and appends expire events.

Scope overlap rules:

- `repo` scope conflicts with all scopes in the repo.
- `path_set` scope conflicts on same path, ancestor, or descendant path.
- `symbol` scope is exact-key only and opt-in.
- line-level scope is explicitly out of scope.

Security:

- The coordinator uses a Supabase service role credential from the Consiliency
  deployment vault or local environment; agents do not receive this secret.
- CLI and logs must print only redacted metadata: project identity, table names,
  lease ids, holder ids, and validation status.
- Hard-mode Supabase unavailability fails closed. It must not silently downgrade
  a hard acquire to local soft coordination.

## Phased execution plan

### Phase 0 - Refresh pins and contract adapter

Owned files:

- `package.json`
- `pnpm-lock.yaml`
- `packages/core-contracts/package.json`
- `packages/core-contracts/src/coordination-contract.ts`
- `packages/core-contracts/src/coordination-contract.test.ts`
- `fixtures/coordination/contract/*.json`

Tasks:

1. Add a pinned dependency on `@consiliency/contract@0.6.3`.
2. Add a small adapter that loads the published JSON schemas and vectors from
   the package without copying them into source.
3. Map published lease and coordination schema terms to local TypeScript types.
4. Add tests that prove the package exposes required schema and vector files.

Verification:

```bash
pnpm install --frozen-lockfile
pnpm --filter @omniagent-plus/core-contracts test -- --run packages/core-contracts/src/coordination-contract.test.ts
pnpm --filter @omniagent-plus/core-contracts typecheck
```

Exit criteria:

- The plan consumes published contract artifacts by pin.
- No schema file is vendored or reauthored in `omniagent-plus`.

### Phase 1 - Supabase lease store backend

Owned files:

- `supabase/migrations/*_coordination_leases.sql`
- `packages/worktree-leasing/src/lease-store.ts`
- `packages/worktree-leasing/src/supabase-lease-store.ts`
- `packages/worktree-leasing/src/supabase-lease-store.test.ts`
- `packages/worktree-leasing/src/index.ts`
- `docs/worktree-leasing.md`

Tasks:

1. Introduce `LeaseStore` as the backend interface used by
   `WorktreeLeaseManager`.
2. Keep the existing local file implementation as the default backend.
3. Add `SupabaseLeaseStore` using the migration RPCs for acquire, renew,
   release, query, and expiry sweep.
4. Preserve existing fencing-token and TTL semantics.
5. Add deterministic fake-adapter tests for:
   - two concurrent hard acquires on overlapping scope;
   - non-overlapping path scopes;
   - soft-mode coexistence;
   - renew with stale fencing token rejection;
   - release with stale fencing token rejection;
   - expiry and reacquire.

Verification:

```bash
pnpm --filter @omniagent-plus/worktree-leasing test -- --run packages/worktree-leasing/src/supabase-lease-store.test.ts
pnpm --filter @omniagent-plus/worktree-leasing typecheck
```

Exit criteria:

- Hard-mode atomicity is represented in code and tests.
- Local backend behavior remains unchanged unless explicitly configured.

### Phase 2 - Coordination inbox channel

Owned files:

- `packages/state-ledger/src/coordination-channel.ts`
- `packages/state-ledger/src/supabase-coordination-channel.ts`
- `packages/state-ledger/src/coordination-channel.test.ts`
- `packages/state-ledger/src/index.ts`
- `packages/core-contracts/src/handoff-packet.ts`

Tasks:

1. Add `CoordinationChannel` interface matching the published contract.
2. Implement a Supabase append-only inbox backend.
3. Validate all outbound messages against the published contract schemas.
4. Add conformance tests for:
   - announce-intent does not acquire a lease;
   - request-yield does not release a lease;
   - handoff does not transfer holder;
   - done does not mutate lease state.
5. Keep HandoffPacket refs metadata-only and bounded.

Verification:

```bash
pnpm --filter @omniagent-plus/state-ledger test -- --run packages/state-ledger/src/coordination-channel.test.ts
pnpm --filter @omniagent-plus/state-ledger typecheck
```

Exit criteria:

- Inbox is useful for negotiation but never authoritative for locks.

### Phase 3 - Coordinator arbitration and crash recovery

Owned files:

- `packages/coordinator/src/lease-arbiter.ts`
- `packages/coordinator/src/lease-arbiter.test.ts`
- `packages/coordinator/src/route-planner.ts`
- `packages/coordinator/src/route-store.ts`
- `packages/coordinator/src/types.ts`
- `packages/cli/src/commands/route-task.ts`

Tasks:

1. Insert lease arbitration before route launch.
2. Teach route decisions to include lease decision metadata:
   `acquired`, `blocked_hard_conflict`, `requested_yield`, `soft_conflict`,
   `expired_reclaimed`, or `coordination_unavailable`.
3. Add heartbeat renewal around active sessions where omniagent-plus owns the
   lease.
4. Add crash-recovery sweep that expires stale leases and records audit events.
5. Do not call or require new upstream Omnigent lease APIs; upstream has none.
6. Preserve the v0.4.0 session/read-state/active-response integration shape.

Verification:

```bash
pnpm --filter @omniagent-plus/coordinator test -- --run packages/coordinator/src/lease-arbiter.test.ts packages/coordinator/src/route-planner.test.ts
pnpm --filter @omniagent-plus/cli test -- --run packages/cli/src/route-task.test.ts
pnpm --filter @omniagent-plus/coordinator typecheck
```

Exit criteria:

- A coordinator can prevent two hard-mode agents from working the same scope.
- Stale leases can be reclaimed only after TTL expiry and fencing validation.

### Phase 4 - Operator CLI and read model

Owned files:

- `packages/cli/src/args.ts`
- `packages/cli/src/command-registry.ts`
- `packages/cli/src/commands/coordination.ts`
- `packages/cli/src/commands/control.ts`
- `packages/cli/src/control.test.ts`
- `packages/cli/src/coordination.test.ts`
- `packages/core-contracts/src/ui-read-model.ts`
- `packages/state-ledger/src/replay.ts`
- `docs/ui-read-model.md`

Tasks:

1. Add operator commands:
   - `coordination leases list --json`
   - `coordination leases acquire --repo-id --scope --mode --ttl --json`
   - `coordination leases renew --lease-id --fencing-token --json`
   - `coordination leases release --lease-id --fencing-token --json`
   - `coordination inbox send/list --json`
2. Update control snapshot output to include off-device backend status, active
   leases, and inbox metadata only.
3. Ensure CLI output redacts environment and credential values.
4. Provide fail-closed errors for hard-mode Supabase outages.

Verification:

```bash
pnpm --filter @omniagent-plus/cli test -- --run packages/cli/src/coordination.test.ts packages/cli/src/control.test.ts
pnpm --filter @omniagent-plus/cli cli -- coordination leases list --json
pnpm --filter @omniagent-plus/cli typecheck
```

Exit criteria:

- Operators can inspect and exercise the lease backend without direct database
  access or secret disclosure.

### Phase 5 - Supabase integration test harness

Owned files:

- `scripts/coordination-smoke-test.ts`
- `fixtures/coordination/smoke/*.json`
- `.github/workflows/ci.yml` if CI already exists for repo-wide tests
- `docs/security-and-secrets.md`

Tasks:

1. Add a smoke command that runs against either local Supabase or an injected
   test project:
   - acquire hard lease;
   - reject overlapping hard acquire;
   - send inbox request-yield;
   - prove inbox did not release;
   - renew;
   - release;
   - reacquire.
2. Gate integration tests on redacted env presence:
   - `OMNIAGENT_COORDINATION_BACKEND=supabase`
   - `OMNIAGENT_COORDINATION_SUPABASE_URL`
   - `OMNIAGENT_COORDINATION_SUPABASE_SERVICE_ROLE_KEY`
3. Keep unit tests always-on and integration tests opt-in if credentials are not
   available in CI.

Verification:

```bash
pnpm exec vite-node scripts/coordination-smoke-test.ts --json
pnpm test
pnpm build
pnpm lint
pnpm typecheck
git diff --check
```

Exit criteria:

- There is a reproducible dry-run proof that a downstream coordinator can use
  the pinned package and Supabase backend.

### Phase 6 - Documentation and PR closeout

Owned files:

- `docs/coordination-backend.md`
- `docs/worktree-leasing.md`
- `docs/durable-state.md`
- `docs/security-and-secrets.md`
- `docs/omnigent-contract.md`
- `README.md`
- `plans/manifest.json`

Tasks:

1. Document backend modes:
   - local file backend for development;
   - Supabase backend for fleet hard locks;
   - hard-mode fail-closed behavior.
2. Record upstream Omnigent state:
   - official release `v0.4.0` remains the compatible target;
   - `main` adds worktree/file-copy paths but no lease API.
3. Document Consiliency contract pin `0.6.3`.
4. Document deconfliction from canon/gp/portal/harness runtime.
5. Open PR without merge.

Verification:

```bash
pnpm test
pnpm build
pnpm lint
pnpm typecheck
git diff --check
```

Exit criteria:

- PR is execute-ready and reviewable as an `omniagent-plus` control-plane change.
- No code in spec, gp, Portal, or harness runtime is changed.

## Acceptance criteria

1. `@consiliency/contract@0.6.3` is pinned and used for lease/inbox schemas and
   conformance vectors.
2. No Consiliency contract schema is copied or forked into `omniagent-plus`.
3. Supabase migrations create append-only lease events, current lease projection,
   coordination inbox, and atomic acquire/renew/release/expire functions.
4. Hard-mode overlapping acquires are atomic and cannot both succeed.
5. Soft-mode intent can coexist but is visible in route decisions and inbox.
6. Inbox messages never mutate lease state without an explicit lease-store
   operation.
7. Coordinator route planning arbitrates leases before launch and records
   fail-closed reasons.
8. Crash recovery expires stale leases only through TTL/fencing-aware store
   operations.
9. CLI/read-model surfaces expose lease and inbox metadata without secrets.
10. Full verification passes with unit tests always-on and Supabase smoke proof
    documented or run when credentials are available.

## Risk controls

- Atomicity risk: keep hard acquire inside a database transaction/RPC; do not
  implement read-then-write locking in client TypeScript.
- Scope-overlap risk: normalize paths before writing locks and test ancestor,
  descendant, same-path, and disjoint path cases.
- Secret risk: never print service role keys or raw env values; report only
  presence and project identity.
- Upstream drift risk: keep Omnigent integration pinned to `v0.4.0` until a
  release, not `main`, requires adaptation.
- Cross-repo drift risk: stop if the published contract package is insufficient;
  do not modify contract/spec/gp/portal/harness from this implementation PR.

## Handoff for executor

Start with Phase 0 and Phase 1. The smallest useful first PR is:

1. pin `@consiliency/contract@0.6.3`;
2. add the contract adapter and schema/vector presence tests;
3. introduce `LeaseStore` while preserving the local file backend;
4. add Supabase migration and fake-adapter tests for hard acquire atomicity.

That PR proves the control-plane boundary without touching canon/gp/portal or
requiring a live Supabase secret in CI.
