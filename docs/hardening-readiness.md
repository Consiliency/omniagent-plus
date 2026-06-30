# Hardening Readiness

`IF-0-HARDEN-13` is the terminal hardening gate for the current release. The
repo remains alpha, not production, not public beta, and not multi-user SaaS.

## Reliability Evidence

- retry storm guardrails stop repeated backend failures and surface cooldown
  evidence instead of allowing indefinite retries.
- crash recovery covers owned Omnigent process cleanup after heartbeat timeout
  and parent-process death.
- State-ledger replay ignores interrupted tail writes and rejects secret-bearing
  evidence instead of replaying partial payloads.
- worktree locks require clean-state, ledger-evidence, expiry, branch, host,
  and fencing-token checks before stale recovery or cleanup continues.

## Live Omnigent Smoke

- The live Omnigent smoke contract is opt-in and skip by default.
- Default CI and default local verification remain metadata_only and do not
  require live Omnigent credentials.
- When an operator enables the live gate, the evidence stays metadata_only and
  records only bounded session/health facts.

## Release Posture

- The supported surface is a local operator workflow with documented hardening
  limits.
- README and readiness docs must continue to say not production, not public
  beta, and not multi-user SaaS.
- Security, commercialization, and hosted rollout work stay out of this phase
  unless later roadmap phases explicitly reopen them.
