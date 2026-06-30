# omniagent-plus

STATELEDGER adds `@omniagent-plus/state-ledger` on top of the existing
TypeScript workspace and runtime-neutral `@omniagent-plus/core-contracts`
package for `agent-runtime-provider-omnigent`. This phase targets
`IF-0-STATELEDGER-3` by freezing the durable local ledger, retention,
redaction, cross-process coordination, and replay surface without a real
Omnigent dependency.

## Workspace Surface

- `packages/core-contracts` exports the public contracts, validation schemas,
  lifecycle helpers, and fake provider used by downstream phases.
- `packages/state-ledger` implements the append-only JSONL ledger, migrations,
  retention, audit persistence, redacted evidence storage, replay, and
  cross-process cooldown/worktree coordination APIs.
- `fixtures/core/` carries metadata-only fixtures derived from
  `IF-0-CONTRACT-1`.
- `fixtures/state-ledger/` carries metadata-only contract, migration, audit,
  evidence, and coordination fixtures for the durable-state slice.
- `docs/durable-state.md` and `docs/architecture.md` explain the ledger file
  layout, record coverage, retention/redaction posture, replay APIs, and why
  this non-dispatch phase does not update release notes or a changelog.

## Verification

Run the STATELEDGER suite from the repo root:

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm lint
pnpm typecheck
pnpm test -- --run
```

The verification gate also checks that the state-ledger fixtures stay valid,
the roadmap still validates after the phase, and no real Omnigent dependency
leaks into the durable-state slice.
