# Omnigent Upstream Readiness

## Current Decision

- Stable authority: `v0.12.0`
- Commit: `f04b0354fb5344c1ea8b92795ceb6760a9ad7595`
- Published: `2026-09-01T22:18:22Z`
- PyPI: `omnigent 0.12.0`, Python `>=3.12`
- Stream vocabulary: 54 event types
- OpenAPI: 101 operations, 73 paths, and 146 schemas

The v0.12 accommodation freezes the tagged wire for
`@consiliency/omnigent-transport@0.7.0`. Relative to v0.11, only
`POST /v1/imports/local` and three schemas are added; six schemas change after
documentation and generator annotations are excluded; and no operation, path,
schema, or event is removed. The v0.11, v0.10, and v0.9 fixtures remain
historical regression evidence.

The existing 54-event vocabulary, legacy required-agent JSON create, and
production server lifecycle remain compatible. The optional elicitation
verdict is identity-free metadata only. Project-aware create/import,
configurable forks, existing-branch worktrees, title bounds, and bare-`omni`
behavior are observed upstream administration surfaces, not provider
capabilities.

## Development Main

The 2026-09-03 probe observed `0.13.0.dev0` at
`385830d871145d0aca1c46be5e293b0192e24398`. Its history was 195 commits ahead
of and two commits behind the v0.12 tag. This is informational, not authority.

The sub-agent bundle-root isolation fix is included in stable v0.10. The
transport records that upstream guarantee but does not claim to enforce it.

## Next Release Gate

Re-run the release, PyPI, OpenAPI, API-guide, schema, CLI, and stream probes when
stable v0.13 or later appears. Freeze only a stable release and never pin a
daily development tag. Do not turn upstream events or shared
editor approvals, smart routing, and administration surfaces into lease, lock,
approval, or authority capability.
