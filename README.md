# omniagent-plus

The current local surface combines the operator CLI with the frozen
`IF-0-UI-12` read-model layer so operators can inspect durable state, project
an API-ready control snapshot, classify limits, plan routes, and manage
worktree leases through one local entrypoint:

`pnpm --filter @omniagent-plus/cli cli -- <command>`

`control snapshot` is read-only, replays the durable ledger without requiring
live Omnigent, and returns the same redacted `UiControlSnapshot` in both JSON
and deterministic human output. The existing CLI commands still support
`--json`, read or write the selected `--state-root`, keep output
`metadata_only`, and map nonzero exit code categories for argument errors,
missing records, validation failures, policy blocks, cleanup blocks, route
blocks, and unexpected internal failures.

The current release remains alpha and local-operator focused. It is not production,
not public beta, and not multi-user SaaS.

## Workspace Surface

- `packages/core-contracts` exports the runtime-neutral contracts, schemas,
  redaction helpers, fake provider, and the schema-backed UI read-model types
  used by downstream phases.
- `packages/state-ledger` owns the durable append-only ledger, indexes,
  migrations, retention, replay, cooldown coordination, worktree lease
  coordination APIs, and the read-only control snapshot projection.
- `packages/omnigent-transport` owns the HTTP, CLI, and hybrid Omnigent
  transport boundary without requiring a live Omnigent installation in CI.
- `packages/identity-isolation` and `packages/worktree-leasing` supply the
  metadata-only identity preflight and worktree cleanup primitives consumed by
  the operator CLI.
- `packages/coordinator` owns the route planner, portability scoring, retry
  guardrails, and durable route-decision persistence used by `route-task`.
- `packages/cli` registers `health`, `sessions list`, `sessions show`,
  `control snapshot`, `route-task`, `classify-limit`, `identities list`,
  `identities preflight`, `worktrees list`, and `worktrees cleanup` under one
  local entrypoint. `control snapshot` replays durable state without writing
  records, while `classify-limit` and `route-task` default to dry-run and only
  persist metadata-only records when `--record` is passed.
- `fixtures/cli/` carries metadata_only JSON fixtures for the operator CLI
  suites, `fixtures/ui/` carries the frozen read-model fixtures, and
  `fixtures/identity/`, `fixtures/state-ledger/`, and `fixtures/worktree/`
  remain the committed contract inputs for downstream tests.
- `docs/architecture.md` and `docs/ui-read-model.md` describe the package
  boundary, `state-root` behavior, `--json` envelope contract, redaction
  posture, read-only control snapshot surface, non-goals, and the
  `no_spec_delta` closeout decision for this phase.

## Verification

Run the HARDEN gate from the repo root:

```bash
pnpm install --frozen-lockfile
pnpm test -- --run packages/coordinator/src/hardening-recovery.test.ts packages/omnigent-transport/src/hardening-recovery.test.ts packages/worktree-leasing/src/hardening-recovery.test.ts packages/state-ledger/src/hardening-replay.test.ts packages/omnigent-transport/src/live-omnigent-smoke.test.ts packages/cli/src/hardening-readiness.test.ts
pnpm build
pnpm lint
pnpm typecheck
pnpm test
find fixtures/hardening -name '*.json' -print | sort | xargs -r -n1 python3 -m json.tool >/dev/null
phase-loop validate-roadmap specs/phase-plans-v1.md
```

The verification gate now also checks retry storm handling, crash recovery,
worktree locks, interrupted state-ledger replay, the skip-by-default live
Omnigent smoke contract, and the alpha/local operator readiness language across
README and docs.
