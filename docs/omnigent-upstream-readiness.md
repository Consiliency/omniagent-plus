# Omnigent Upstream Readiness

## Current Decision

- Stable authority: `v0.11.0`
- Commit: `496b7b13f6af3ed5330b957df408fc91290b6307`
- Published: `2026-08-25T20:10:48Z`
- PyPI: `omnigent 0.11.0`, Python `>=3.12`
- Stream vocabulary: 54 event types
- OpenAPI: 100 operations, 72 paths, and 143 schemas

The v0.11 accommodation freezes the tagged wire for the still-unpublished
`@consiliency/omnigent-transport@0.6.0`. Relative to v0.10, no path changes;
four schemas and two events are added; eight schemas change; and none are
removed. The v0.10 and v0.9 fixtures remain historical regression evidence.

## Development Main

The 2026-08-26 probe observed `0.12.0.dev0` at
`820a3b50fdf9c88696eafcb1568c7bac4c2aa12d`. Its history was 75 commits ahead
of and one commit behind the v0.11 tag. OpenAPI still reported 100 operations,
72 paths, 143 schemas, and 54 events. This is informational, not authority.

The sub-agent bundle-root isolation fix is included in stable v0.10. The
transport records that upstream guarantee but does not claim to enforce it.

## Next Release Gate

Re-run the release, PyPI, OpenAPI, API-guide, schema, CLI, and stream probes when
stable v0.12 or later appears. Freeze only a stable release and never pin a
daily development tag. Do not turn upstream events or shared
editor approvals, smart routing, and administration surfaces into lease, lock,
approval, or authority capability.
