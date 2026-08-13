# Omnigent Upstream Readiness

## Current Decision

- Stable authority: `v0.9.0`
- Commit: `cc4720a79fbdf9ccee56724bf571e7d48e1d9ac2`
- Published: `2026-08-11T21:02:42Z`
- PyPI: `omnigent 0.9.0`, Python `>=3.12`
- Stream vocabulary: unchanged at 52 event types
- OpenAPI: unchanged sets and 97 operations

`omniagent-plus` consumes the tagged v0.9 wire through
`@consiliency/omnigent-transport@0.5.0`. The six additive schema changes are
frozen in `fixtures/omnigent/discovery/`.

## Development Main

The 2026-08-12 probe observed `0.10.0.dev0` at
`3f9d0a3212c61710bceddc37967c615720bf378c`, 145 commits ahead of v0.9, with
two additional paths and no additional stream events. This is informational,
not authority.

Development main includes a security fix that roots sub-agent sessions at
their own bundle directory rather than inheriting parent skills and tools.
Because that fix is not in v0.9, operators must not claim tagged parity with it.

## Next Release Gate

Re-run the release, PyPI, OpenAPI, API-guide, schema, CLI, and stream probes when
a newer stable release appears. Amend this freeze if that release contains the
bundle-root fix or otherwise changes the public transport contract. Do not pin
unreleased main or turn smart routing and administration surfaces into lease,
lock, approval, or authority capability.
