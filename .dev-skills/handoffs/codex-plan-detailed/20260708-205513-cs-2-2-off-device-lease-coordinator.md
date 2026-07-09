# Handoff: CS-2.2 off-device lease backend and coordinator plan

- Plan artifact: `plans/detailed-cs-2-2-off-device-lease-coordinator-20260708-205513.md`
- Repo: `omniagent-plus`
- Created: `2026-07-08T20:55:13Z`
- Skill: `codex-plan-detailed`
- Branch state: detached HEAD

## What changed

Produced an execute-ready phased plan for CS-2.2 as the off-device
control-plane lease layer: Supabase `LeaseStore`, append-only coordination
inbox, and omniagent-plus coordinator arbitration.

## Key decisions

- Existing portal unification design is sufficient.
- CS-2.2 scope is refreshed away from stale "Omnigent integration blockers" and
  toward the durable lease/backend coordinator slice.
- Published Consiliency contract artifacts are available at version `0.6.3` and
  include lease/inbox schemas plus conformance vectors.
- Official Omnigent release target remains `v0.4.0`; upstream `main` adds
  worktree/file-copy paths but still has no lease/lock/coordination API.
- No cross-repo blocker is present.

## Deconfliction

The execution plan is clear of canon, gp-runner, Portal projection, compute
offload runner, and harness runtime changes. It consumes published contract
artifacts only and keeps all implementation work in `omniagent-plus`.

## Recommended next step

Start with the Phase 0/Phase 1 slice:

1. pin `@consiliency/contract@0.6.3`;
2. add the contract adapter and schema/vector presence tests;
3. introduce the `LeaseStore` interface;
4. add the Supabase migration and fake-adapter hard acquire tests.
