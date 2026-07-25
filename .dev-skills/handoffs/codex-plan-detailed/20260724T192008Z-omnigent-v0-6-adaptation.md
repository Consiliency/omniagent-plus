---
from: codex-plan-detailed
timestamp: 2026-07-24T19:20:08Z
repo: Consiliency/omniagent-plus
repo_root: /mnt/HC_Volume_105438154/worktrees/omniagent-plus-plan-omnigent-v0-6-adaptation
branch: codex/plan-omnigent-v0-6-adaptation
branch_slug: codex-plan-omnigent-v0-6-adaptation
commit: 9bd2cd7517354d6f3fb5ee180be5479ed78082af
run_id: 20260724T192008Z-omnigent-v0-6-adaptation
artifact: plans/detailed-omnigent-v0-6-contract-maintenance-20260724-1920.md
---

# Omnigent v0.6 contract-maintenance planning handoff

## Outcome

An execute-ready detailed plan was written for adapting the public Omnigent
transport seam from official v0.5.1 to official v0.6.0 and releasing only
`@consiliency/omnigent-transport` as `0.3.0`. This was a planning-only run in
Default mode; no implementation, build, test, formatter, generator, package,
publish, commit, push, or PR action was performed.

## Frozen decisions

- Authority is the official `v0.6.0` tag at
  `375f540421baf3ad46fae0805b78063682f281de`; upstream `main` is a dated,
  non-authoritative probe.
- Add the two official stream discriminators to the parser allowlist, preserve
  their raw fields, and map them to no neutral runtime events.
- Type optional nullable session-list `parent_session_id`, but do not reinterpret
  it as provider-owned root-session or child-creation authority.
- Record import and auto-title as optional upstream surfaces. Do not add HTTP
  client/provider methods for them.
- Document upstream telemetry defaults and opt-outs. Do not silently mutate
  process-manager environments.
- Preserve all existing capability, reconnect, terminal, lease/lock, and CS-2.2
  boundaries.
- Bump only the transport package to `0.3.0`; runtime-provider and
  pipeline-provider-adapter remain `0.2.0`.
- Update transport package repository metadata to
  `Consiliency/omniagent-plus`. Actual publication is blocked until an npm owner
  confirms the trusted-publisher repository claim was moved from the prior
  `ViperJuice/omniagent-plus` location.

## Execution entrypoint

1. Revalidate the official release/tagged OpenAPI and refresh only the dated
   current-main probe.
2. Execute the ordered changes and `automation.suite_command` in the plan.
3. Capture redacted npm trusted-publisher evidence at the plan-prescribed
   handoff path before any real publication.
4. Open an implementation PR. Do not merge or publish unless the coordinator
   separately authorizes those actions.

## Four-agent review amendment

The plan was reviewed by Grok, Sol, Gemini, and a native Terra fallback after
the Fable TUI leg degraded without a verdict. Actionable findings were amended
into the plan: packed-smoke authority, unprefixed capability version, executable
fake-server SSE coverage, precise parent lineage, absent optional client methods,
the browser event family, and explicit deferral of unchanged package metadata.

- Original plan SHA-256: `d3c2b365785fd3db48fe37a24a6f4fe9c26251de168f0a4ba402396f2919624b`
- Amended plan SHA-256: `ea2cd9210f302f99d920419fe660e5c51112b68be1301191d9d93057fdfc40e6`
- Review record: `.dev-skills/handoffs/codex-plan-detailed/20260724T200709Z-omnigent-v0-6-advisor-board-review.md`

## Worktree state

Starting status was clean at `9bd2cd7517354d6f3fb5ee180be5479ed78082af`.
The planning run created only:

- `plans/detailed-omnigent-v0-6-contract-maintenance-20260724-1920.md`
- `.dev-skills/handoffs/codex-plan-detailed/20260724T192008Z-omnigent-v0-6-adaptation.md`
- `.dev-skills/handoffs/codex-plan-detailed/20260724T200709Z-omnigent-v0-6-advisor-board-review.md`
- `.dev-skills/handoffs/codex-plan-detailed/latest.md`
- the detailed-plan manifest entry and the planner reflection required by the
  Harness planning workflow

There were no pre-existing untracked files in this worktree.
