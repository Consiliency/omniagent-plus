# Live Omnigent Smoke

The live Omnigent smoke contract is optional and skip by default. CI and
default local verification keep the gate off, so no credentials required are
needed for the normal repo test path.

## Environment Gate

| Variable | required | Purpose |
| --- | --- | --- |
| `OMNIAGENT_PLUS_LIVE_OMNIGENT` | required to enable live smoke | Set to `1` only when an operator intentionally wants the live check. |
| `OMNIAGENT_PLUS_LIVE_OMNIGENT_BASE_URL` | required when live smoke is enabled | Points at the operator-controlled Omnigent HTTP surface. |
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
- Keep subscription ownership and account use outside committed fixtures or
  repository docs.
- If the env gate is not explicitly enabled, the live test must remain skipped.
