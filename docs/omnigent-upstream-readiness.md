# Omnigent Upstream Readiness

This document tracks upstream Omnigent movement beyond the frozen release
contract in `docs/omnigent-contract.md`. It does not replace the
`IF-0-CONTRACT-1` freeze.

## Current Decision

- Latest published GitHub release: `v0.7.0`
- Release commit: `35519fb04743f66b30cac8a40695d5d72fa163ea`
- Release published: `2026-07-27T22:40:00Z`
- Latest PyPI package: `omnigent 0.7.0`
- Python requirement: `>=3.12`
- Current upstream `main` probe: `48a1cb33a9a7507fc61e47ede43d2d869d826cab`
- Probe time: `2026-07-30T03:53:08Z`

`omniagent-plus` is adapted to the latest published release. `v0.7.0` is the
authoritative freeze because it is the current GitHub and PyPI release.

## Stable Release Delta

Relative to the previous `v0.6.0` freeze, v0.7.0 adds:

- projects and usage administration routes
- detected-credential, credential-store, harness-install, and harness
  model-option routes
- optional `project_id` on session list/detail/update surfaces
- typed native `model_options` on full session responses
- optional MCP server headers and import sources for Claude, Codex, Kimi, Kiro,
  OpenCode, Pi, and Qwen
- `omnigent server --background` in place of the removed start subcommand, plus
  direct machine status from `omnigent server status --json`

The tagged event vocabulary remains exactly 52 entries. Existing v0.6 browser
action and tool-output-delta events remain metadata-only no-ops. Project, usage,
credential, installation, model lookup, import, and automatic title surfaces
are not provider requirements.

Still not upgraded to public transport capability:

- Public harness override remains blocked; `GET /v1/harnesses` is catalog-only.
- Stable public spawn-under-parent child-session creation remains blocked.
- Parent lineage, projects, usage, credentials, installation, model options,
  import, and automatic title APIs do not provide lease, lock, coordination, or
  inbox semantics.

## Unreleased Main Delta

Current `main` is ahead of the official v0.7.0 tag. Its OpenAPI path, schema,
and event sets are unchanged from the tag; optional `can_approve` and `kind`
fields are a non-authoritative probe only. They do not change the provider
contract until a later release or explicit SHA freeze, and no current-main
observation is promoted into CS-2.2 lease semantics.

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
