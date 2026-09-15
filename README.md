# omniagent-plus

The current local surface combines the operator CLI with the frozen
`IF-0-UI-12` read-model layer so operators can inspect durable state, project
an API-ready control snapshot, classify limits, plan routes, and manage
worktree leases through one local entrypoint:

`pnpm --filter @omniagent-plus/cli cli -- <command>`

`control snapshot` is read-only, projects existing ledger records without
requiring live Omnigent, and returns `UiControlSnapshot` in both JSON and
deterministic human output. The repository does not yet connect provider
sessions, turns, events, or approvals to ledger writers: their replay evidence
is fixture-seeded, not a provider-to-ledger restart workflow. The existing CLI
commands support `--json`, read or write the selected `--state-root`, target
`metadata_only` output, and map nonzero exit code categories for argument errors,
missing records, validation failures, policy blocks, cleanup blocks, route
blocks, and unexpected internal failures.

The current release remains alpha and local operator focused. It is not production,
not public beta, and not multi-user SaaS.

The retry storm decisions and crash recovery helpers are caller-driven primitives,
not an automatic supervisor. Durable-state recovery, content scanning, and
exported path restrictions still have known gaps; a `metadata_only` label is
not proof of sanitized content. See the source-grounded
[readiness inventory](docs/hardening-readiness.md) for limits and phase owners.

CS-2.2 adds an opt-in off-device coordination backend for fleet leases. The
lease/channel contract is pinned to `@consiliency/contract@0.6.3`, the local
backend remains available under `--state-root`, and the Supabase backend is
enabled only when coordinator credentials are configured locally. Never put
credential values in output or evidence. Local SQL tests are not hosted
Supabase acceptance. See
`docs/coordination-backend.md`.

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
  guardrails, lease arbitration, and durable route-decision persistence used by
  `route-task`.
- `packages/cli` registers `health`, `sessions list`, `sessions show`,
  `control snapshot`, `route-task`, `classify-limit`, `identities list`,
  `identities preflight`, `worktrees list`, `worktrees cleanup`, and
  `coordination leases/inbox` commands under one local entrypoint. `control
  snapshot` replays durable state without writing records, while
  `classify-limit` and `route-task` default to dry-run. `--record` persists
  classification/route records; with coordination scope, `route-task --record`
  can also acquire a lease and send inbox messages. It does not launch a
  provider. Even dry-run routing currently opens the ledger and can rewrite
  indexes/manifest; DATA owns nonmutating reads and COORD owns effect semantics.
- `fixtures/cli/` carries metadata_only JSON fixtures for the operator CLI
  suites, `fixtures/ui/` carries the frozen read-model fixtures, and
  `fixtures/identity/`, `fixtures/state-ledger/`, and `fixtures/worktree/`
  remain the committed contract inputs for downstream tests.
- `docs/architecture.md` and `docs/ui-read-model.md` describe the package
  boundary, `state-root` behavior, `--json` envelope contract, redaction
  posture, read-only control snapshot surface, non-goals, and the
  historical `no_spec_delta` closeout decision. The readiness inventory qualifies
  their audit-identified claims pending the assigned behavioral phases.

## Verification

Use Node 24 and pnpm 11.1.1. From the repo root, the shared GUARD command is:

```bash
pnpm verify
```

It runs frozen install, build, lint, workspace/tooling typecheck, source-boundary
checks, mandatory disposable PostgreSQL setup, one full root suite, and packed
transport consumer smoke using the retained verified tarball. Local full-gate
execution requires Docker and `psql`; missing SQL setup fails rather than skips.
The fixture is owned and disposable, not an ambient or production database.

For deterministic local tests or focused docs checks, build first:

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm exec vitest run packages/cli/src/hardening-readiness.test.ts
```

`pnpm test` excludes SQL-dependent cases before collection and clears inherited
DB enablement, live opt-in, and provider credentials/routes. `pnpm test:guard`
runs tooling falsifiers plus required SQL setup/integration cases;
`pnpm test:integration` runs only integration cases. Both focused commands own
a disposable fixture when run standalone, require the existing build, and are
subsets, not substitutes for `pnpm verify`. Required DB tests cannot skip.

The one permitted full-root skip is the explicitly opt-in live Omnigent case.
`pnpm test` never enables it, even with inherited live variables; use the separate
[live smoke invocation](docs/omnigent-live-smoke.md) after build. GUARD evidence
stays metadata_only and does not require live provider credentials.

`IF-0-HARDEN-13` is historical, not current GUARD acceptance. The external
phase-loop command is a planning tool, not a product-gate dependency. Workflow
wiring is not hosted CI validation: hosted runs, branch protection, integrated
review, and phase acceptance remain pending SL-2. License choice remains
pending PREP; GUARD does not release or change versions.
