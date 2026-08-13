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
- The freeze target is `omnigent` `v0.9.0` at
  `cc4720a79fbdf9ccee56724bf571e7d48e1d9ac2`.
- `main` observations are metadata only and are not authoritative for the fake
  server unless a later contract freeze re-pins them.
- The fake server emits official tagged request, epoch response, cursor page,
  `ConversationItem`, acknowledgement, and SSE shapes. It must not emit the
  adapter's normalized internal camel-case objects.

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
- The historical v0.4, v0.5, and v0.6 fixtures remain compatibility evidence.
- The `v0_6_metadata_events` scenario drives both v0.6 additions through the
  fake server's normal SSE path as known metadata-only no-ops.
