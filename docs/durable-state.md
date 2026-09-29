# Durable State

`@omniagent-plus/state-ledger` is the early durable-state backend for
`agent-runtime-provider-omnigent`. It uses an append-only JSONL ledger with
sidecar indexes because the source spec allowlists that design for the first
implementation slice when atomic append discipline, cross-process reads, schema
versioning, and crash recovery are proven.

## File Layout

```text
state-root/
  ledger.jsonl
  manifest.json
  indexes/
    by-kind.json
    by-session.json
    by-task.json
  coordination/
    provider-cooldowns.json
    worktree-leases.json
    consiliency-leases.json
    coordination-inbox.json
  locks/
    store.lock
```

`manifest.json` tracks the durable schema version, record count, historical
sequence high-water mark, and recovery count. Indexes are rebuildable checkpoints:
writable startup and compaction rebuild them; append deliberately leaves them
stale. Reads validate the ledger rather than trusting an index.

The private ledger package and root workspace require Node `^22.13.0 || >=24.0.0`.
Public runtime-provider and transport platform requirements are unchanged.
`locks/store.lock` is a permanent, versioned SQLite arbitration database, not an
owner file to delete. SQLite owns the writer transaction and releases it on
process death. Legacy, identity-less or invalid lock files block writers without
modification; read-only inspection remains available. Supported writers must not
remove or replace a live arbitration inode. Replacement checks leave a foreign
pathname intact but do not fence arbitrary external tampering during a callback.

## Write And Recovery Protocol

Supported topology is one host/PID namespace on a local filesystem with SQLite
locking, hard links, same-directory atomic rename, and file/directory fsync.
Unsupported durability operations fail explicitly. Newly created directories
are synced through every new ancestor and the first existing parent. A lock
candidate is initialized, closed and synced before exclusive hard-link
publication and parent sync. No owner unlinks the canonical database.

Append holds the writer transaction, validates sequence allocation against both
the ledger and historical manifest high-water, writes and syncs the ledger,
syncs its parent, then replaces a synced manifest temporary and syncs its parent.
Compaction first persists historical high-water, then replaces a synced ledger
temporary, syncs the parent, rebuilds indexes with the same atomic protocol, and
checkpoints the manifest. An interrupted operation may be visible without having
been acknowledged; replay visibility is not a writer commit receipt.

Complete malformed JSON, invalid schemas, duplicate identities, non-increasing
sequences, unsafe integers and unsupported versions fail without deleting bytes.
Only a syntactically valid but incomplete final JSON/UTF-8 prefix is repairable.
Recovery writes exact rejected bytes to `.recovery/<random-id>.tail`, using a
0700 directory and 0600 files, and syncs the file and directory before truncating
and syncing the ledger. Recovery bytes and references are never exported.
A valid record missing only its newline is finalized rather than dropped.
Tests inject process death at write, sync, rename, publication and recovery
boundaries. They do not simulate every filesystem or a physical power failure.

## Read Contract

`readLedgerSnapshot(rootDir, { maxBytes, maxAttempts })` defaults to 64 MiB and
three attempts. Limits must be positive safe integers. It captures and checks
file identity, size and change timestamps plus manifest metadata. `complete`
and `incomplete_tail` contain only validated newline-terminated records;
`pendingRecord` identifies a valid record without its final newline.
Exhausted retries return `in_progress`, no records and null byte/sequence fields.
Typed `LedgerReadError` diagnostics contain codes and offsets, never raw payload.
Array and replay APIs reject an incomplete snapshot rather than returning a
misleading successful prefix.

Store `maxSnapshotBytes` sets the same positive bounded capacity for writer
recovery, compaction and default store reads. Initialization and append check
serialized manifest and ledger capacity before publishing a checkpoint or
acknowledging growth, so a warmed cache cannot create a ledger
that its configured writer cannot reopen. Raise this option consistently for
larger stores; standalone snapshot inspection retains the 64 MiB default.

`readOnly: true` open, manifest/list/query reads and CLI session inspection do not
create directories, acquire writer locks, repair tails or migrate manifests.
CLI route dry-run uses this ledger mode; coordination effects remain COORD-owned.
Session replay selects the latest entity state in ledger sequence order from
one snapshot. Explicit session scope wins over task fallback.

## Record Coverage

The durable record surface persists the metadata-only control-plane state needed
by later phases:

- sessions
- turns
- runtime events
- route decisions
- limit classifications
- identity profile status
- provider-family cooldowns
- worktree leases
- approval requests and responses
- Omnigent capability snapshots
- evidence refs

Every durable record is versioned through the shared
`state_ledger_record.v0.1` envelope. Route decisions and runtime history can be
replayed directly from the ledger without a live Omnigent dependency.

## Retention And Redaction

Retention is explicit. The package exposes policy-driven compaction that prunes
aged record kinds while preserving active sessions, pending approvals, live
leases, ancestor sessions and cross-kind dependencies. Selection and dependency
closure share one locked snapshot. Latest terminal/released states prevent
resurrection of older active records. Payload sizes are bounded before persistence.

Redaction is fail-closed:

- secret-bearing excerpts are rejected
- raw transcripts are rejected
- raw provider payloads are rejected
- full environment dumps are rejected
- durable evidence stores only bounded redacted excerpts or metadata-only
  artifact refs

The shared scanner checks retained metadata recursively, including encoded JSON,
tool bodies and coordination messages. A finite corpus covers known secret and
provider-payload shapes plus safe lookalikes; it is not universal secret detection.
Unknown-field stripping/passthrough behavior remains boundary-specific. Authorized
runtime prompts, including empty, whitespace and long multibyte messages, remain
usable. Durable started-message/text-delta records omit runtime content rather
than trusting a `metadata_only` label.
The audit helper performs omission; direct ledger schemas/store writes reject
those known content fields unless already omitted. Existing complete records
that violate this stricter rule are corruption and remain intact for diagnosis.

Operational roots remain absolute internally. CLI JSON/text, UI and handoff
exports use repo-relative paths or opaque `path:sha256:<digest>` refs. Evidence
paths reject home paths, traversal and private recovery locations. Scanner and
manifest diagnostics never include secret samples.

## Lease And Fake-Provider Consumers

A shared release constructor keeps the lease ID/fencing token, expires the lease
at the release time and records bounded `cause`, `actor` and `releasedAt` fields.
Causes distinguish holder release, reconciliation and recovery. Older records
without attribution remain unknown. COORD owns actual emission and fencing authority.

The fake provider tests observable session idle/turn_active/closed and turn
running/completed/cancelled transitions, one active turn, interior event gaps
before heartbeat filtering, and concurrent/repeated close. Created/starting,
accepted/queued/blocked, timeout and failure scheduling are not modeled. This is
fake-provider evidence, not real upstream lifecycle acceptance.

## Measured Append Work

Thirty appends to identical 0/100/1000-record fixtures took about 16/27/161 ms
before DATA and 85/89/101 ms in the candidate run on this host. These are single
run observations, not speed guarantees. The comparison uses the same session-record workload; stronger sync increases small-ledger latency. Separate candidate controls record zero append
snapshot rescans and zero index rewrites for unchanged ledgers. Foreign writes
invalidate the cache under the writer transaction; competing-process tests check
unique sequences and complete record preservation. Fsync adds filesystem-dependent
latency, and writable startup/compaction still scan and rebuild checkpoints.
Metadata evidence and test scope are recorded in `plans/evidence/v2/DATA.json`.

## Cross-Process Coordination

Shared provider-family cooldowns and exclusive worktree leases use the ledger
plus coordination sidecars so two independent Node processes observe the same
state. Exclusive write leases reject a second claimant while the active lease
remains unexpired.

CS-2.2 adds a second coordination sidecar for the published Consiliency
`consiliency.lease.v1` shape and an append-only local inbox for negotiation
messages. The inbox is not part of lease projection and cannot mutate lease
state.

## Release Surface

This phase updates the repo docs for the new durable-state surface but does not
dispatch a release. `CHANGELOG.md`, release notes, and post-dispatch evidence
remain unchanged because STATELEDGER is a non-dispatch phase.
