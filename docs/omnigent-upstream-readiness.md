# Omnigent Upstream Readiness

This document tracks upstream Omnigent movement beyond the frozen release
contract in `docs/omnigent-contract.md`. It does not replace the
`IF-0-CONTRACT-1` freeze.

## Current Decision

- Latest published GitHub release: `v0.6.0`
- Release commit: `375f540421baf3ad46fae0805b78063682f281de`
- Release published: `2026-07-21T08:25:31Z`
- Latest PyPI package: `omnigent 0.6.0`
- Python requirement: `>=3.12`
- Current upstream `main` probe: `76281b9438578e472810879e18fc60acc64d3d6c`
- Probe time: `2026-07-24T20:20:32Z`

`omniagent-plus` is adapted to the latest published release. `v0.6.0` is the
authoritative freeze because it is the current GitHub and PyPI release.

## Stable Release Delta

Relative to the previous `v0.5.1` freeze, v0.6.0 adds:

- `POST /v1/imports`
- `POST /v1/sessions/{session_id}/auto-title`
- optional `SessionListItem.parent_session_id` metadata
- `browser.action_request` and `response.function_call_output.delta` stream
  events, bringing the tagged event count from 50 to 52
- the `omni import --harness <claude|codex>` operator command
- anonymous telemetry enabled by default, with documented environment/config
  opt-outs
- the optional extra rename `memory` to `hindsight`, with a compatibility alias
- standardized `OMNIGENT_<NAME>_PATH` harness path variables, with legacy
  `HARNESS_*_PATH` support through v0.8

The adapter recognizes both new events as metadata-only no-ops. Import,
automatic title selection, and the newly documented CLI command are not
provider requirements. No local dependency or environment path uses the two
deprecated v0.6 names.

Still not upgraded to public transport capability:

- Public harness override remains blocked; `GET /v1/harnesses` is catalog-only.
- Stable public spawn-under-parent child-session creation remains blocked.
- Parent lineage, import, and automatic title APIs do not provide lease, lock,
  coordination, or inbox semantics.

## Unreleased Main Delta

Current `main` is ahead of the official v0.6.0 tag. It is a non-authoritative
probe only and does not change the provider contract until a later release or
explicit SHA freeze. No current main observation is promoted into CS-2.2 lease
semantics.

## Maintenance Plan

Use a detailed-plan lane, not a new roadmap, when the next Omnigent release
lands unless it introduces a breaking transport contract.

1. Refresh GitHub release, tag SHA, PyPI, Python, OpenAPI, and safe local CLI
   probe evidence.
2. Regenerate discovery fixtures and add focused event fixtures for changed
   discriminators.
3. Update TypeScript contracts only for public stable fields used or safely
   accepted at the provider boundary.
4. Keep provider capability statuses unchanged unless a release exposes the
   full required semantic contract.
5. Run format, lint, typecheck, fixture tests, transport tests, and the full
   workspace test suite.

## Non-Goals

- Do not pin this repo to unreleased upstream `main` by default.
- Do not treat upstream UI, lineage, import, auto-title, worktree, file-copy, or
  sharing features as lease authority.
- Do not mark harness override or child-session spawn supported without a
  stable public API and conformance proof.
- Do not expose credential values in fixtures, CLI output, or live-smoke
  evidence.
