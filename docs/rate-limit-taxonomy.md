# Rate-Limit Taxonomy

`@omniagent-plus/rate-limit-catalog` satisfies `IF-0-LIMITS-5`.
It classifies provider and harness failures into deterministic
`LimitClassification` objects without exposing secret-bearing payloads.

## Taxonomy

The package uses the frozen contract types:

- `burst_rate_limit`
- `token_rate_limit`
- `concurrency_limit`
- `fixed_window_usage_cap`
- `monthly_spend_or_quota_cap`
- `acceleration_limit`
- `overload_or_transient`
- `auth_or_billing_problem`
- `abuse_or_policy_block`
- `unknown_limit`

`burst_rate_limit`, `token_rate_limit`, `concurrency_limit`,
`fixed_window_usage_cap`, `auth_or_billing_problem`,
`abuse_or_policy_block`, and `unknown_limit` stay explicit in both the docs and
the source surface so downstream routing can consume the same frozen names.

## Confidence Tiers

- `0.85` to `0.99`: strong match from status, regex, and retry-after or reset evidence
- `0.65` to `0.84`: likely class with fewer corroborating signals
- `0.40` to `0.64`: ambiguous or partial evidence that should remain `unknown_limit`

## Fixture Format

The fixture corpus is stored under `fixtures/rate-limits/` and each file follows
one catalog shape:

```json
{
  "family": "openai-api",
  "fixtures": [
    {
      "id": "openai-burst-rpm",
      "signal": {
        "provider": "openai-api",
        "statusCode": 429,
        "bodyText": "Rate limit reached for requests per minute.",
        "headers": {
          "retry-after": "20"
        }
      },
      "expected": {
        "type": "burst_rate_limit",
        "scope": "provider_family"
      }
    }
  ]
}
```

Coverage includes Claude Code, Codex, Gemini Antigravity, OpenCode, Pi,
OpenAI API, Anthropic API, Google API, ZAI, MiniMax, and generic
OpenAI-compatible providers.

## Routing Action Matrix

- `burst_rate_limit`: retry the same session, reduce concurrency, and route new work elsewhere if queues back up
- `token_rate_limit`: honor retry-after, shrink token pressure, and migrate portable work if necessary
- `concurrency_limit`: keep the session, lower parallelism, and retry when active work drops
- `fixed_window_usage_cap`: do not retry before reset; route portable work elsewhere
- `monthly_spend_or_quota_cap`: stop until billing or quota resets and require manual review
- `acceleration_limit`: cool the provider family and ramp back up slowly
- `overload_or_transient`: exponential backoff and route elsewhere after repeated failures
- `auth_or_billing_problem`: stop and require reauth or billing repair
- `abuse_or_policy_block`: stop and require manual review
- `unknown_limit`: stop automatic retries until a stronger signal appears

`sameProviderAccountSwitch` is always one of:

- `forbidden`
- `manual_confirmation_required`
- `allowed_by_policy`

## Negative-Fixture Posture

The negative corpus proves that:

- non-limit 429 validation errors return `none`
- auth failures return `auth_or_billing_problem`
- policy blocks return `abuse_or_policy_block`
- provider outages return `overload_or_transient`
- malformed or low-confidence limit-like signals return `unknown_limit`

Hard usage caps are never treated like burst retries, and unknown fixtures do
not get promoted to success.

## Account-Switching Policy

Same-provider account switching is not framed as quota bypass. Retryable
pressure classes keep `sameProviderAccountSwitch=forbidden`. Hard usage caps
default to `sameProviderAccountSwitch=manual_confirmation_required`. Only a
downstream policy surface may opt into `sameProviderAccountSwitch=allowed_by_policy`.
