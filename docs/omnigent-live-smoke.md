# Live Omnigent Smoke

The live Omnigent smoke contract targets official Omnigent `v0.10.0` and is
optional and skipped by default. CI and default local verification keep the
gate off, so no credentials are needed for the normal repo test path.

## Environment Gate

| Variable | required | Purpose |
| --- | --- | --- |
| `OMNIAGENT_PLUS_LIVE_OMNIGENT` | required to enable live smoke | Set to `1` only when an operator intentionally wants the live check. |
| `OMNIAGENT_PLUS_LIVE_OMNIGENT_BASE_URL` | required when live smoke is enabled | Points at the operator-controlled Omnigent HTTP surface. |
| `OMNIGENT_AGENT_ID` | required when live smoke is enabled | Existing upstream agent id used by tagged v0.10 JSON create. |
| `OMNIAGENT_PLUS_LIVE_OMNIGENT_BEARER_TOKEN` | optional | Supplies a local bearer only when the chosen endpoint requires auth. |

## Evidence Rules

- Live smoke evidence must stay `metadata_only`.
- Do not record bearer values, raw transcripts, raw provider payloads, or full
  env dumps.
- The live test records only bounded session and health metadata and then
  closes the session.

## Operator Notes

- Use only operator-controlled environments that already satisfy provider
  terms.
- Confirm the live target reports stable v0.10 before treating a result as
  tagged compatibility evidence; development `main` is not an equivalent
  target.
- Keep subscription ownership and account use outside committed fixtures or
  repository docs.
- If the env gate is not explicitly enabled, the live test must remain skipped.
