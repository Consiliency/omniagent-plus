# Live Omnigent Smoke

The live Omnigent smoke contract targets official Omnigent `v0.12.0` and is
optional and configured to skip by default. CI and default local verification
keep the gate off, with no credentials required for the normal repo test path.

## Environment Gate

| Variable | required | Purpose |
| --- | --- | --- |
| `OMNIAGENT_PLUS_LIVE_OMNIGENT` | required to enable live smoke | Set to `1` only when an operator intentionally wants the live check. |
| `OMNIAGENT_PLUS_LIVE_OMNIGENT_BASE_URL` | required when live smoke is enabled | Points at the operator-controlled Omnigent HTTP surface. |
| `OMNIGENT_AGENT_ID` | required when live smoke is enabled | Existing upstream agent id used by tagged v0.12 legacy JSON create. |
| `OMNIAGENT_PLUS_LIVE_OMNIGENT_BEARER_TOKEN` | optional | Supplies a local bearer only when the chosen endpoint requires auth. |

## Evidence Rules

- Live smoke evidence must stay `metadata_only`.
- Do not record bearer values, raw transcripts, raw provider payloads, or full
  env dumps.
- The live test checks only bounded session and health metadata and attempts
  session closure in `finally`. It does not test turn execution, durable replay,
  automatic supervision, or multi-user isolation.

## Explicit Invocation

The operator must configure the base URL and existing agent ID from the table
above locally, plus the bearer only if required. Do not paste credentials into
commands, committed fixtures, or evidence. After those settings are present:

```bash
pnpm install --frozen-lockfile
pnpm build
OMNIAGENT_PLUS_LIVE_OMNIGENT=1 pnpm exec vitest run packages/omnigent-transport/src/live-omnigent-smoke.test.ts
```

pnpm test never enables live smoke, even when live variables are inherited.
`pnpm test`, `pnpm verify`, `pnpm test:guard`, and `pnpm test:integration` use
noncredentialed child environments that remove live opt-in, Omnigent settings,
and provider credentials/routes. Direct Vitest is the separate operator opt-in
path, outside GUARD acceptance. Without the flag, nonempty base URL, and agent
ID, the live case skips; a skipped case is not live compatibility evidence.
An enabled run creates a session on the selected endpoint and attempts cleanup;
it is not a read-only connectivity probe. Inspect the test result before
reporting compatibility, and report cleanup failures without raw payloads.

This remains alpha, not production, not public beta, and not multi-user SaaS.
The metadata_only evidence contract is narrow; it does not certify transport
content labels or all secret detection. See [readiness limits](hardening-readiness.md).
No hosted CI validation or phase acceptance is claimed by this invocation.

## Operator Notes

- Use only operator-controlled environments that already satisfy provider
  terms.
- Confirm the live target reports stable v0.12 before treating a result as
  tagged compatibility evidence; development `main` is not an equivalent
  target.
- Keep subscription ownership and account use outside committed fixtures or
  repository docs.
- If the env gate is not explicitly enabled, the live test must remain skipped.
