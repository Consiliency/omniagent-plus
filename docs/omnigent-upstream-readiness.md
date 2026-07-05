# Omnigent Upstream Readiness

This document tracks upstream Omnigent movement beyond the frozen release
contract in `docs/omnigent-contract.md`. It is not a replacement for the
`IF-0-CONTRACT-1` freeze.

## Current Decision

- Latest published GitHub release: `v0.4.0`
- Latest published release commit: `31669e1b413216c865d0ed7dfb469fb142c889f5`
- Latest release published: `2026-07-03T01:36:56Z`
- Latest PyPI package: `omnigent 0.4.0`
- Python requirement: `>=3.12`
- Current upstream `main` probe: `b9332cc655b2ad7dbe70d2ad5b9cd78214dd3e17`
- Probe time: `2026-07-05T01:00:26Z`

`omniagent-plus` is adapting to the latest published release. Previous
`v0.4.0dev0` compatibility is now historical context; the stable freeze target
is the official GitHub/PyPI `v0.4.0` release.

Stable `v0.4.0` transport-relevant surface now includes:

- `GET /v1/harnesses` as a read-only harness catalog.
- `PUT /v1/sessions/{session_id}/read-state`.
- `active_response_id` on session snapshots for reconnect state.
- Optional `background_task_count`, `viewer_last_seen`, and `viewer_unread`
  fields on session/read-state surfaces.
- `waiting` in the release OpenAPI session status enum.
- Expanded `ServerStreamEvent` discriminators for session UI metadata,
  resources, reasoning, usage, compaction, heartbeat, retry, error, and
  elicitation events.

Still not upgraded to public transport capability:

- `harness_override` remains internal and allowlist-gated.
- Child-session spawn-under-parent remains internal; public transport can
  observe children and fork sessions but should not claim stable child spawn.

## Unreleased Main Delta

Current `main` is ahead of the official `v0.4.0` tag. The observed movement is
non-authoritative for this repo until a release or explicit SHA pin lands.

The current notable non-freeze movement is terminal transport work, including
tmux control-mode web-terminal transport. The provider-bound OpenAPI path set
checked for this adaptation did not require additional stable paths beyond the
official `v0.4.0` freeze.

## Maintenance Plan

Use a detailed-plan lane, not a full new roadmap, when the next Omnigent release
lands. The change is contract-maintenance scoped unless upstream publishes a
breaking transport contract.

1. Refresh upstream release evidence:
   - GitHub release metadata.
   - tag SHA and package version.
   - PyPI package metadata when available.
   - local safe CLI probe (`command -v omnigent`, `command -v omni`).

2. Regenerate contract fixtures:
   - `fixtures/omnigent/discovery/source-metadata.json`
   - `fixtures/omnigent/discovery/http-surface.json`
   - `fixtures/omnigent/discovery/capability-probes.json`
   - fake-server scenarios for any non-additive release changes.

3. Update contract docs:
   - `docs/omnigent-contract.md`
   - `docs/lifecycle-and-events.md`
   - `docs/omnigent-transport.md`
   - `docs/identity-isolation.md`
   - `docs/security-and-secrets.md`

4. Update TypeScript contracts only for public, stable release fields:
   - promote compatible optional fields only when downstream consumers need
     them beyond transport-level acceptance;
   - keep additive upstream fields optional unless acceptance needs them;
   - keep `read-state` metadata-only unless a consumer needs it in the neutral
     provider boundary.

5. Update credential handling:
   - keep prefixed provider variables covered by allowlist and redaction tests;
   - never print the corresponding values in CLI output or live-smoke evidence.

6. Verify:
   - `pnpm build`
   - `pnpm lint`
   - `pnpm typecheck`
   - `pnpm test`
   - `find fixtures/omnigent -name '*.json' -print | sort | xargs -r -n1 python3 -m json.tool >/dev/null`
   - optional live smoke only when explicitly enabled.

## Non-Goals

- Do not pin this repo to unreleased upstream `main` by default.
- Do not treat upstream web UI-only changes as provider-contract requirements.
- Do not mark `harness_override` or child-session spawn as supported unless the
  public API explicitly exposes and documents them.
- Do not expand environment-variable allowlists by copying the full host env.
