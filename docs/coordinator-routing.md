# Coordinator Routing

## COORD behavior

COORD evaluates every cooldown source at one injected clock (default current
time). Valid expired resets release fixed-window, monthly and unknown-limit
cooldowns; missing/invalid resets and auth/billing/policy blocks remain blocked.
Stale reset-bound classifications no longer pause an available identity.
Only the three named reset-bound reason codes expire automatically. Free-text
reasons such as provider_family_cooldown remain conservative blocks; an elapsed
date does not establish their meaning. INTEG owns persisted status transitions.

Preferred provider, harness and identity form one conjunctive target. Unknown or
contradictory preferences reject before effects. Substitution follows existing
portability/account-switch policy with explicit fallback and reason. sendTurn
matches the established session ID/provider/harness/identity before persistence
and sending; lookup failure refuses. Matching sends remain persisted before launch.

Retries respect failure.retryable, classification budgets and supplied idempotency
posture. Mutation retries require idempotencySafe=true. Counters are nonnegative
safe integers. Complete integer or HTTP-date Retry-After values are relative to
injected now and capped at300seconds; invalid/overflow values are ignored.
Missing valid delay evidence uses bounded deterministic exponential backoff.
Delays on refused decisions are bounded recheck hints, not permission to retry
or a replacement for the recorded reset time.
The caller owns counters/timers; there is no automatic retry loop. Confidence is
heuristic, not calibrated accuracy. Publication uses anchored known rate headers
and DATA-safe excerpts before truncation.

incrementActiveTurns stays increment-only; decrementActiveTurns settles explicit
counts. ActiveTurnAccounting is a task-lifetime owner: begin requires a new
(sessionId,turnId) tuple; settle(turnId,sessionId) decrements that owner once
across repeated terminal signals, even when other sessions reuse the turn ID. INTEG owns
scheduling and lifecycle persistence. Replay uses only preceding matching
provider/harness/identity classifications; task scope does not imply session scope.
Live routing applies the same target matching and expires reset-bound evidence
before capacity, account-switch policy, fallback or reason generation. A declared
session/model/project/organization scope without matching routing context cannot
control a new unrelated route. CLI task-scoped evidence is limited to the selected
classification task, and later mismatched evidence cannot mask an earlier match.

`IF-0-COORDINATOR-9` freezes a durable coordinator boundary that plans and
replays route decisions before any provider launch.

## Package Surface

`@omniagent-plus/coordinator` owns:

- identity-pool inventory and active-turn accounting
- adaptive concurrency and cooldown evaluation
- portability scoring and route planning
- route persistence and launch gating
- failure policy, retry storm guardrails, and replay helpers

The package exports replay-safe types and functions only. It does not export
raw provider payload helpers or secret-bearing diagnostics.

## Route Decisions

Every `RouteDecision` is persisted before launch through
`AuditLedger.appendRouteDecision`. The record carries the selected provider,
selected harness, selected identity, preferred target, fallback reason,
capability fit, provider health, current capacity, active-turn target,
cooldown state, and bounded evidence refs.

`silent downgrade` stays forbidden. If request labels do not match the selected
provider, harness, or identity, the launch gate fails closed before Omnigent is
called.

## Cooldown And Portability

Provider-family cooldowns, identity cooldowns, and active-turn pressure all
feed the route planner. Fixed usage caps, monthly caps, auth or billing
problems, policy blocks, and unknown limits pause the affected provider family
or identity instead of allowing same-provider account hopping.

High portability work may migrate across provider families when capability fit,
policy, worktree lease state, and handoff evidence permit it. Low portability
work waits or retries the same provider by default.

## Failure And Replay

Retry storm guardrails cap repeated transient failures and explain the chosen
action in the durable ledger. Replay stays `metadata_only`: route explanations
summarize provider, harness, identity, portability, cooldown, active-turn, and
evidence refs without storing secrets or raw provider payloads.

## Release Surface

COORDINATOR is a non-dispatch phase. The release-surface closeout remains
`no_doc_delta` for README, CHANGELOG, and workflow dispatch evidence because
this phase only freezes routing and replay behavior.
