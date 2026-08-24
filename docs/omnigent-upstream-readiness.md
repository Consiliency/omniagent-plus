# Omnigent Upstream Readiness

## Current Decision

- Stable authority: `v0.10.0`
- Commit: `40755dd8dddb07e1eb6e4055d1d9936e184ceb9b`
- Published: `2026-08-19T04:34:41Z`
- PyPI: `omnigent 0.10.0`, Python `>=3.12`
- Stream vocabulary: unchanged at 52 event types
- OpenAPI: 100 operations, 72 paths, and 139 schemas

The v0.10 accommodation freezes the tagged wire for
`@consiliency/omnigent-transport@0.6.0`. Relative to v0.9, three paths and five
schemas are added, six schemas change, and none are removed. The v0.9 fixture
remains historical regression evidence.

## Development Main

The 2026-08-24 probe observed `0.11.0.dev0` at
`46b1ce13fef0a3ea1d208ec8a2f79951023f643c`. Its history is currently 99
commits ahead of and 3 commits behind the v0.10 tag. It adds
`session.permission_mode` and `session.title`, increasing the development
stream schema from 52 to 54 events. This is informational, not authority.

The sub-agent bundle-root isolation fix is included in stable v0.10. The
transport records that upstream guarantee but does not claim to enforce it.

## Next Release Gate

Re-run the release, PyPI, OpenAPI, API-guide, schema, CLI, and stream probes when
stable v0.11 or later appears. Freeze only a stable release and never pin a
daily development tag. Do not import development-only events or turn shared
editor approvals, smart routing, and administration surfaces into lease, lock,
approval, or authority capability.
