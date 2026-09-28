# Omnigent Upstream Readiness

## Current target

The latest stable target checked on 2026-09-28 is Omnigent `v0.15.0`, published
to PyPI on 2026-09-22 with Python `>=3.12`. The formal GitHub release followed
on 2026-09-24. Its tag resolves to
`c8b9b85f822f2c9203ff995c10f3cc49d064bbe5`. Tagged OpenAPI contains 117
operations, 88 paths, 163 schemas, and 55 stream event types. The published
transport remains `@consiliency/omnigent-transport@0.7.0` with v0.12 support;
v0.15 accommodation is a candidate awaiting its acceptance gates.

The direct v0.12→v0.14→v0.15 comparisons and immutable OpenAPI digests are
recorded in `plans/evidence/omnigent-v0-15-upstream-20260922.json` and checked
by `scripts/check-omnigent-openapi-delta.mjs`. V0.15 removes `session.skills` from
its target union while the transport retains it as a passive historical input.
The new sidechat and Codex approval-mode frames are passive; they add no
Consiliency approval or control authority. Informational persisted errors,
explicit durable/preview message identity, and exact stale pagination cursors
are the transport behavior changes under test.

The v0.12, v0.11, v0.10, and v0.9 fixtures remain historical regression evidence.
Project ordering, skills discovery, sandbox model options, file sharing, and
other new administration endpoints do not become provider capabilities. The
legacy required-agent JSON create shape and canonical `omnigent server
--background`, `server status --json`, and `server stop` lifecycle remain.

## Qualification limits

Fake-server, contract, and packed-consumer tests do not install or exercise an
upstream Omnigent runtime. The candidate cannot claim v0.15 compatibility or
v2 closure until the accepted GUARD gate, DATA interface freeze, and full plan
verification are complete. Exclusive transport ownership is recorded in
Consiliency/omniagent-plus#25. The older
2026-09-03 development-main probe is historical only and has no release
authority.
