# Omnigent Fake-Server Fixture Contract

These fixtures are metadata-only inputs for downstream fake-server and transport
tests. They intentionally capture schema shape, provenance, redaction posture,
and scenario boundaries instead of raw provider payload dumps.

## schema

- Discovery fixtures use `omnigent.*.v1` metadata contracts.
- Event fixtures use `omnigent.event_fixture.v1`.
- Error fixtures use `omnigent.error_fixture.v1`.
- Scenario catalog uses `omnigent.fake_server_scenarios.v1`.

## provenance

- Every fixture points back to the tagged upstream source that justified it.
- The freeze target is `omnigent` `v0.5.1`.
- `main` observations are metadata only and are not authoritative for the fake
  server unless a later contract freeze re-pins them.

## redaction

- `redaction` is always `metadata_only`.
- Do not add secrets, bearer tokens, local env dumps, raw transcripts, or full
  provider payload bodies to this directory.

## scenario

- Each scenario in `scenarios.json` maps required provider capabilities to the
  minimum fixtures needed to simulate or normalize that case.
- Downstream transport tests should treat `blocked` capabilities as typed
  blocked or unavailable results, not as missing fixture bugs.
- The `v0_4_harness_catalog_and_read_state` scenario covers the official
  read-only harness catalog, read-state metadata, `active_response_id`, and
  representative v0.4 event parsing.
- The `v0-5-noop-events.json` fixture separately proves the two new release
  events remain known metadata-only no-ops; the historical v0.4 scenario stays
  unchanged.
