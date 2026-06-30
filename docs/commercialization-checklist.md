# Commercialization Checklist

omniagent-plus remains an alpha local operator surface. It is not production,
not public beta, and not multi-user SaaS.

## Current Blockers

- Crash recovery, retry storm controls, worktree locks, and live Omnigent
  evidence are scoped to a single operator workflow.
- Provider terms, subscription ownership, and account use stay with the
  operator; the repo does not manage shared customer billing or hosted account
  lifecycles.
- The current docs and tests prove hardening posture, not go-to-market or
  revenue readiness.
- No quota-bypass claims are allowed in readiness or release material.

## Before Any Commercialization Change

- Re-review provider terms for every supported runtime path.
- Define a supported subscription and account use policy for shared operators.
- Add production-grade identity isolation, service ownership, and incident
  response controls.
- Add hosted deployment, billing, support, and retention policies that match
  the actual surface being offered.

## Current Decision

The current decision is to stay alpha, local-first, and documentation-led until
those commercialization blockers are addressed by a later roadmap phase.
