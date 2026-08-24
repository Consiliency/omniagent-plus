# Security And Secrets

identity isolation uses a metadata_only posture for credentials, runtime
evidence, and status persistence.

## Required Rules

- Persist secret ref ids, auth-volume refs, and `RedactedConfigValue`
  placeholders, not raw secrets.
- Reject bearer tokens, API keys, auth headers, password/token/credential
  fields, and full env dumps before any ledger or handoff write.
- Treat `OMNIGENT_*` provider credential aliases, such as
  `OMNIGENT_ANTHROPIC_API_KEY`, as secret-shaped even when values are redacted.
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

## Omnigent Telemetry

- Omnigent v0.7 enables anonymous telemetry by default. Operators can opt out
  with `OMNIGENT_ANALYTICS=0`, `DISABLE_TELEMETRY=true`,
  `OMNIGENT_DISABLE_TELEMETRY=true`, `DO_NOT_TRACK=1`, or `telemetry: false` in
  `~/.omnigent/config.yaml`.
- Telemetry posture is explicit operator configuration. The transport and
  process manager must not silently inject or override these settings.
- Do not persist telemetry payloads, raw Omnigent config, or environment values
  in fixtures, ledgers, handoffs, or diagnostics.

## Omnigent v0.10 Deployment Posture

- Official v0.10 roots sub-agent skills and tools at each sub-agent's own
  bundle directory. This is an upstream runtime guarantee at the frozen tag;
  the transport records it but does not implement or re-enforce isolation.
- v0.8 added explicit `env_passthrough`, harness `extra_args`, and recursive
  dotfile scanning. This repository does not enable those surfaces. Any future
  use requires a separate credential, command, and workspace-boundary review.
- Smart routing, session routing overrides, and child routing metadata do not
  grant approval, authority, lease, lock, child-create, or harness-override
  capability in this repository.
- v0.10 permits any upstream shared-session editor to approve. That is
  Omnigent collaboration behavior only: it grants no Consiliency approval,
  coordinator authority, lease, lock, child-create, harness-override, or route
  decision.

## Coordination Backend Secrets

- Supabase coordination uses
  `OMNIAGENT_COORDINATION_SUPABASE_URL` and
  `OMNIAGENT_COORDINATION_SUPABASE_SERVICE_ROLE_KEY`.
- The service role key is coordinator-only. Agents should interact through the
  coordinator/CLI surface and must not receive the raw key.
- CLI diagnostics may report missing env var names and backend availability,
  but must not print URL values, service role keys, bearer tokens, or raw env
  dumps.
