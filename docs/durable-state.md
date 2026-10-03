# Durable State

## COORD behavior

COORD physical ownership is governed by a validated private registry with stable
pending-transition and reclamation journals. Supported shared-root retention is
WorktreeLeaseManager.retainHistory; direct DATA retention on such roots is
unsupported. It retains DATA roots and active/pending/unknown/genuinely referenced
ownership evidence in one locked snapshot. Expired live or uncertain physical
holders remain owners. See [worktree leasing](worktree-leasing.md).

Local inbox reads validate existing entries once. Sends recheck new input after
asynchronous waits, validate retained metadata and detach it before serialization;
publication operates on validated detached values. Query never initializes,
takes a writer lock, repairs or prunes. Inbox expiry/history limits are described
in [coordination backend](coordination-backend.md).

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
Unsupported durability operations fail explicitly. Each directory-initialization,
lock-acquisition and checkpoint-write path
syncs every writable ancestor, even when another initializer created the entries,
and stops before the first ancestor this user cannot modify. Pre-existing
execute-only workspace parents are not opened; this user cannot publish entries
there. This prevents an initializer from acknowledging work before the creator
has synced mutable entries. A lock
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
The repair counter can undercount if a later capacity check fails after a tail
repair; private recovery evidence remains intact and sequences are unaffected.
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
recovery, compaction and default store snapshots. Initialization, append and
compaction check serialized manifest and ledger capacity before publishing a checkpoint or
acknowledging growth, so a warmed cache cannot create a ledger
that its configured writer cannot reopen. Finalizing an unterminated valid record
also checks capacity for the newline before writing it. Raise this option consistently for
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
durable tool bodies and coordination messages. Public runtime tool bodies retain
their unknown-value compatibility, including normal home paths and code. A finite corpus covers known secret and
provider-payload shapes plus safe lookalikes; it is not universal secret detection.
Retained metadata is inert JSON data: boxed primitives, functions, accessors, proxies, custom
prototypes and serialization hooks reject at direct durable boundaries and are
replaced during export/audit projection without invocation. Payload byte sizing
follows durable schema validation. Public tool-body compatibility is unchanged.
Array projection copies own indexed entries into ordinary arrays and preserves
sparse indices; extra array properties are discarded without invoking constructors
or `Symbol.species` hooks.
Descriptor checks include symbol keys and precede durable schema parsing, including
hidden known fields and Zod's initial type inspection. Both exported ledger record
and record-array schemas guard their own entrypoints; callers must guard arbitrary
outer schemas that inspect inputs before delegating. Runtime-event audit parsing first copies inert data without changing text;
unsupported audit values, including known scalar fields, become placeholders before
schema validation; text policy still applies afterward. The exported schemas retain
their concrete effects and array APIs. Derived or caller-built schemas that inspect
raw roots first require the caller's guard.
Append and local coordination recheck inputs after asynchronous waits and validate
the complete inbox immediately before serialization. RPC sends use a detached inert
copy so later caller mutations cannot change the serialized request.
RPC sends retain the whole input and therefore apply the full metadata check before
copying; they do not have the local schema's unknown-field stripping stage.
Compaction revalidates and bounds kept records, including the supported private
record version, after callbacks and before serialization or checkpoint publication.
Callbacks remain trusted selectors and can change records within those invariants.
Retained numeric values must be finite; native `JSON.rawJSON` carriers and own
undefined array entries reject. Optional undefined object fields are omitted and
sparse holes retain normal JSON null serialization. Export projection replaces
nonfinite/raw values, omits undefined object fields and maps undefined array entries
to null. Inert preparse checks permit ordinary discarded nonfinite extensions so
unknown-field stripping remains compatible. Descriptor traversal is depth bounded;
shared-reference in-process graphs can still cost more than JSON-origin trees.
Pending-record finalization requires the newline write to report one byte before
syncing or returning success. A zero-progress write fails with `incomplete_snapshot`
and leaves the ledger and manifest available for a later recovery attempt.
Unknown-field stripping/passthrough behavior remains boundary-specific. Authorized
runtime prompts, including empty, whitespace and long multibyte messages, remain
usable. Durable started-message/text-delta records omit runtime content rather
than trusting a `metadata_only` label. Tool bodies exceeding the existing 16 KiB
payload bound still fail closed; INTEG owns bounded lifecycle composition.
Evidence bounds include the original bytes, including whitespace padding.
Private recovery references are forbidden in values, object keys and encoded
JSON strings. Credential fields cover the corpus's container/header/vendor
variants; fencing handles and boolean auto-refresh controls remain metadata.
The audit helper performs omission; direct ledger schemas/store writes reject
those known content fields unless already omitted. Existing complete records
that violate this stricter rule are corruption and remain intact for diagnosis.
This is a deliberate persistence-policy tightening, not transparent read
compatibility for historical raw content. Readonly inspection reports a bounded
error; writers do not silently redact, migrate, truncate or discard such records.
Preserve the old root for private inspection and remediation before adopting a
metadata-only root. Terminal runtime summaries/reasons and tool bodies are projected before
audit persistence; their source runtime events remain unchanged.

Private ledger reads and writes derive omitted envelope scope from session,
turn, event, approval-request, lease-holder and classification payload IDs, and
derive route task IDs from the route payload. Conflicting duplicate IDs fail
with bounded diagnostics. Approval responses and evidence require explicit
caller context; matching nearby IDs never supplies it. Retention keeps a
retained request's latest response so a resolved approval cannot become pending.

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
before DATA and 113/102/67 ms in the `279f315` candidate run on this host. These are single
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
