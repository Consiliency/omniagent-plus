---
from: codex-plan-detailed
timestamp: 2026-07-05T00:20:32Z
repo: omniagent-plus
repo_root: /home/viperjuice/code/omniagent-plus
branch: main
branch_slug: main
commit: 4d57b26f588f208be39a006c0ec919fe19d68487
run_id: 20260705-002032-omnigent-v0-4-adaptation
artifact: plans/detailed-omnigent-v0-4-adaptation-20260705-002032.md
---

# Detailed Plan Handoff

Created `plans/detailed-omnigent-v0-4-adaptation-20260705-002032.md` for the official Omnigent `v0.4.0` adaptation.

## Status

automation.status: planned_amended
verification_status: not_run
artifact_state: dirty

## Scope

- Refresh Omnigent contract evidence from `v0.3.0` / `v0.4.0dev0` to official `v0.4.0`.
- Promote already-implemented forward compatibility for `read-state`, `waiting`, `launching`, background task count, and viewer read-state fields.
- Add missing `GET /v1/harnesses` client/fake-server/test coverage.
- Add `active_response_id` snapshot handling for reconnect state.
- Expand the official `v0.4.0` SSE event allowlist while no-op mapping UI/resource-only events.
- Preserve blocked posture for public `harness_override` and child-session spawn-under-parent.

## Panel Amendment

- Three-agent panel ran with Codex, Gemini, and Claude Fable.
- Codex returned `DISAGREE` while treating the repo as if implementation already existed; use it as a scope reminder, not a plan blocker.
- Gemini returned `DEGRADED`/`DISAGREE` and challenged `GET /v1/harnesses` plus `active_response_id`; implementation must re-confirm those facts from official `v0.4.0` tag/OpenAPI evidence before coding them.
- Claude Fable returned `PARTIALLY AGREE` and identified `packages/omnigent-transport/src/capability-probe.test.ts:24`, which still asserts `snapshot.version` is `"0.3.0"`.
- The plan was amended to add the upstream preflight gate, the capability-probe test update, and a stale freeze-literal sweep for `v0.3.0`, `v0.4.0dev0`, `4edb4d9`, and old `waiting` OpenAPI drift text.

## Next

- Execute the plan in one bounded implementation PR.
- Before edits, re-fetch official `v0.4.0` OpenAPI/tag evidence and stop for another amendment if `GET /v1/harnesses` or `active_response_id` is absent.
- Do not chase unreleased upstream `main` terminal transport changes except as a non-authoritative readiness note.
- Do not run a phase roadmap; this is contract maintenance against one official release.

## Verification To Run During Implementation

```bash
pnpm --filter @omniagent-plus/omnigent-transport test -- --run packages/omnigent-transport/src
pnpm test -- --run packages/omnigent-transport/src packages/core-contracts/src/fake-event-stream.test.ts
pnpm build
pnpm lint
pnpm typecheck
pnpm test
find fixtures/omnigent -name '*.json' -print | sort | xargs -r -n1 python3 -m json.tool >/dev/null
sh -c 'rg -n "v0\\.3\\.0|v0\\.4\\.0dev0|4edb4d9|waiting.*OpenAPI|OpenAPI.*waiting" docs fixtures packages/omnigent-transport || true'
git diff --check
phase-loop validate-roadmap specs/phase-plans-v1.md
```

## Notes

- Planning ran outside Plan Mode, so only artifacts were written; no implementation or verification commands were run.
- Initial repo status was clean on `main...origin/main`.
- A broad parent-directory `find` for AGENTS/CLAUDE files was interrupted after it produced no output; a repo-local `rg --files -g 'AGENTS.md' -g 'CLAUDE.md'` found none.
- Manifest helper import via plain `python3` failed with `ModuleNotFoundError: No module named 'phase_loop_runtime'`; manifest update was handled manually in the existing JSON shape.
