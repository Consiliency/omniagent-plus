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
  locks/
    store.lock
```

`manifest.json` tracks the durable schema version, record count, sequence
high-water mark, and crash-recovery truncation count. The sidecar indexes are a
cache rebuilt from the ledger whenever startup detects drift or an interrupted
tail write.

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
aged record kinds while preserving the latest records needed for coordination
and replay. Payload sizes are bounded before persistence.

Redaction is fail-closed:

- secret-bearing excerpts are rejected
- raw transcripts are rejected
- raw provider payloads are rejected
- full environment dumps are rejected
- durable evidence stores only bounded redacted excerpts or metadata-only
  artifact refs

## Cross-Process Coordination

Shared provider-family cooldowns and exclusive worktree leases use the ledger
plus coordination sidecars so two independent Node processes observe the same
state. Exclusive write leases reject a second claimant while the active lease
remains unexpired.

## Release Surface

This phase updates the repo docs for the new durable-state surface but does not
dispatch a release. `CHANGELOG.md`, release notes, and post-dispatch evidence
remain unchanged because STATELEDGER is a non-dispatch phase.
