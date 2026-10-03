# Worktree Leasing

## COORD behavior

COORD uses an authoritative validated private registry. Mutations durably stage
a stable record ID, append it once, publish registry/map projections retaining
intent, then clear intent last. Recovery completes projections without duplicate
IDs. Ambiguous outcomes quarantine their lease/path/key. Inspection reports
incomplete mutation/reclamation without initialization, locks or repair.
Malformed/wrong-version files refuse unchanged; identifiers have no prototype
collisions. Elapsed TTL never steals a live or uncertain physical owner.

DATA SQLite arbitration retains its canonical inode permanently. Holder
sidecars are diagnostics only; do not delete locks. Legacy CoordinationStore
physical acquisition is denied on COORD-managed shared roots; standalone
compatibility remains. Default writer wait is2seconds; Git children have30second
deadlines and wait for exit. Retry contention and budget heartbeat TTL for
operation time; expiry is uncertainty, never takeover authority.

Deletion requires independently configured managedRoot before acquisition,
persisted root/path identity, holder/fence proof, actual Git registration,
recorded repo, containment and no symlink component below the root. CLI
--managed-root cannot establish legacy provenance. Under the mutation lock,
cleanup rechecks actual host/liveness/dirty/branch/path immediately before
non-force Git removal; there is no recursive rm fallback. ENOENT proof may
reconcile legacy metadata with reconciled=true/deleted=false. Removal followed
by release refusal reports deleted=true/releaseIncomplete and keeps durable
intent. Ambiguous pre-marker recovery does not infer acknowledged deletion.

Shared-ledger retention uses WorktreeLeaseManager.retainHistory(policy, now):
one DATA writer snapshot preserves active/pending/unknown/genuine references,
then journals coupled released-history/tombstone reclamation. Watermarks prevent
older clean metadata resurfacing after newer dirty proof is pruned. Protected
capacity exhaustion stays incomplete. Direct DATA retention on a COORD shared
ledger is unsupported; INTEG owns scheduling/operator wiring.

```ts
const manager = await WorktreeLeaseManager.open({ rootDir: stateRoot, managedRoot });
await manager.retainHistory({ maxAgeMs: 7 * 24 * 60 * 60 * 1000 }, new Date());
```

Worktree lists default100/max500 and use canonical UTC millisecond acquiredAt/ID
cursors with bytewise ties. Diff numstat includes staged and unstaged tracked
changes; untracked names count as files, not measured line totals.

`@omniagent-plus/worktree-leasing` satisfies `IF-0-WORKTREE-7`.

## Lease Model

- Every exclusive lease carries a unique fencing token and durable holder
  identity.
- Heartbeat renewal keeps the same fencing token while advancing `renewedAt`
  and `expiresAt`.
- The package builds on the durable `@omniagent-plus/state-ledger` record
  surface so worktree lease history stays metadata_only and cross-process.
- CS-2.2 also exports a Consiliency `LeaseStore` adapter for soft/hard
  off-device coordination leases. The local file backend supports deterministic
  tests and operator dry runs; the Supabase backend delegates hard-mode atomic
  acquire to database RPCs.

## Placement And Branch Rules

- When `/mnt/workspace` exists, created worktrees live under
  `/mnt/workspace/worktrees/<project>-<branch>`.
- Hosts without that mount fall back to repo-adjacent placement.
- Branch collision stays fail-closed unless the caller explicitly requests a
  clean sequential continuation for the same task.
- Path traversal, shell-interpreted branch names, and symlink escape roots are
  rejected before worktree creation.

## Recovery And Cleanup

- Stale recovery requires lease expiration, missing local process liveness,
  matching host identity, clean branch state, clean dirty worktree evidence,
  and ledger evidence before reuse or cleanup.
- Cleanup verifies the active fencing token and refuses dirty worktree,
  unknown-state, different-host, branch-divergent, and active-process
  deletions.
- Read-only reviewer worktrees remain untouched unless cleanup is explicitly
  authorized.

## Diff Boundary

- Diff summaries stay metadata_only: branch name, worktree path, bounded changed
  path lists, and redacted numstat totals.
- The package does not render full handoff packets, raw diffs, raw provider
  payloads, or secret-bearing diagnostics.

## Release Surfaces

This phase updates `docs/worktree-leasing.md` and
`docs/coordination-backend.md` for the CS-2.2 coordination contract. CHANGELOG
and release-note surfaces stay unchanged because CS-2.2 is a non-dispatch
implementation PR.
