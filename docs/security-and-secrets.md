# Security And Secrets

identity isolation uses a metadata_only posture for credentials, runtime
evidence, and status persistence.

## Required Rules

- Persist secret ref ids, auth-volume refs, and `RedactedConfigValue`
  placeholders, not raw secrets.
- Reject bearer tokens, API keys, auth headers, password/token/credential
  fields, and full env dumps before any ledger or handoff write.
- Treat raw events, route decisions, and handoff payloads as unsafe until the
  secret-leak scanner reduces them to metadata_only evidence.

## Identity Isolation

- `host_env` is only for development profiles with a non-empty env allowlist.
- Shared HTTP stays blocked until per-session HOME, env, credential, and
  auth-volume isolation evidence is proven.
- Per-profile process metadata prevents auth bleed across concurrent identities.

## Prompt Injection And Tool Approvals

- Treat prompt injection strings as quoted evidence, not trusted instructions.
- tool approvals stay operator-mediated for destructive, credentialed, or
  privacy-sensitive actions.
- Runtime or handoff evidence may summarize the approval state, but never the
  raw secret-bearing payload behind the request.

## Data Retention And Evidence Posture

- Status records may include profile id, provider, harness, counts, cooldown,
  and checked timestamps.
- Status records must not include raw provider payloads, secret file contents,
  or full env maps.
- data retention stays metadata_only unless a later reviewed phase expands that
  boundary.

## Provider Terms, Subscription, And Account Use

- Live Omnigent smoke, local testing, and operator workflows must stay within
  documented provider terms.
- subscription ownership and account use stay with the operator and must not be
  inferred from shared repo state.
- Shared or hosted account management is out of scope for the current alpha
  release.
