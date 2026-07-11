# Omnigent Upstream Readiness

This document tracks upstream Omnigent movement beyond the frozen release
contract in `docs/omnigent-contract.md`. It does not replace the
`IF-0-CONTRACT-1` freeze.

## Current Decision

- Latest published GitHub release: `v0.5.1`
- Release commit: `08285468e098244ac0b0bf98cb470d5c1a1a7070`
- Release published: `2026-07-10T23:26:54Z`
- Latest PyPI package: `omnigent 0.5.1`
- Python requirement: `>=3.12`
- Current upstream `main` probe: `f55e16f84e1b2c757deb3ee56229feace309cb6c`
- Probe time: `2026-07-11T03:10:00Z`

`omniagent-plus` is adapted to the latest published release. The `v0.5.1`
OpenAPI document is structurally identical to `v0.5.0`; `v0.5.1` is
the authoritative freeze because it is the current GitHub and PyPI release.

## Stable Release Delta

Relative to the previous `v0.4.0` freeze, v0.5.1 adds:

- `GET /v1/hosts/{host_id}/worktrees`
- `POST /v1/sessions/{session_id}/resources/files:copy`
- `GET /v1/sharing` and `PUT /v1/sharing`
- optional `SessionResponse.mcp_startup` metadata
- optional `SessionListItem.search_snippet` metadata
- optional `SessionGitOptions.existing_worktree`
- `session.mcp_startup` and `response.policy_denied` stream events
- `omni session export --id`, `omnigent debug logs`, and ACP harness launch
  command documentation

`SessionForkRequest.model_override` was removed. The provider does not send
that field.

The adapter preserves `mcp_startup` session metadata and recognizes the two
new events as metadata-only no-ops. The optional routes, git option, sharing
surface, and newly documented CLI commands are not provider requirements.

Still not upgraded to public transport capability:

- Public harness override remains blocked; `GET /v1/harnesses` is catalog-only.
- Stable public spawn-under-parent child-session creation remains blocked.
- Worktree, file-copy, and sharing APIs do not provide lease, lock,
  coordination, or inbox semantics.

## Unreleased Main Delta

Current `main` is ahead of the official v0.5.1 tag. It is a non-authoritative
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
- Do not treat upstream UI, worktree, file-copy, or sharing features as lease
  authority.
- Do not mark harness override or child-session spawn supported without a
  stable public API and conformance proof.
- Do not expose credential values in fixtures, CLI output, or live-smoke
  evidence.
