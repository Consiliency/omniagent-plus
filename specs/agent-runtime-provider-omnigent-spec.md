# Agent Runtime Provider for Omnigent

**Spec ID:** `agent-runtime-provider-omnigent.v0.1`  
**Primary repo:** `Consiliency/agent-runtime-provider-omnigent`  
**Primary language:** TypeScript / Node 22+ / ESM  
**First dependent repos:** `Consiliency/governed-pipeline`, `ViperJuice/agent-harness`  
**Runtime backend:** Omnigent, treated as an external Python runtime engine  
**Product goal:** A reusable provider/router layer that lets existing Consiliency/ViperJuice orchestration systems launch, route, observe, pause, resume, and hand off agent work across Claude Code, Codex, Gemini/Antigravity, OpenCode, Pi, and future harnesses, while reusing Omnigent’s session/runtime engineering without hard-forking it.

---

## 1. Executive Summary

Build a **TypeScript-first runtime provider** that wraps Omnigent as an execution backend and exposes a stable Consiliency-native interface for:

```text
- harness/session creation
- turn dispatch
- event streaming
- history reads
- handoff packet construction
- rate-limit classification
- identity/profile routing
- worktree leasing
- governed-pipeline executor adapter results
- agent-harness phase-loop execution
```

The new repository should be separate from both `governed-pipeline` and `agent-harness`.

`governed-pipeline` is product-agnostic and adapter-driven. It should consume this runtime provider through its existing agentic boundary rather than owning the provider implementation directly.

`agent-harness` is already a harness-neutral phase-loop runtime that dispatches phases to child executors. It should consume this provider as an optional execution backend while retaining its existing model-policy and run-mode semantics.

Omnigent should be reused as the backend session/harness substrate. It already provides significant engineering for session management, harness adapters, native TUI bridges, session trees, event streaming, and cross-harness orchestration. This project should add the missing Consiliency/ViperJuice layer:

```text
Consiliency/ViperJuice orchestration semantics
  +
Omnigent runtime backend
  +
provider-aware routing, rate-limit classification, handoff packets, identity lanes
```

---

## 2. Repository Decision

### Recommended repo

```text
Consiliency/agent-runtime-provider-omnigent
```

### Reason

This name keeps the initial scope precise: wrapping Omnigent as a runtime provider. If the repo later grows into a broader multi-backend runtime router, create or rename to:

```text
Consiliency/agent-runtime-router
```

For now, avoid overgeneralizing before the Omnigent integration is stable.

---

## 3. Design Principles

### 3.1 Use Omnigent, do not clone Omnigent

Omnigent has already built the expensive substrate:

```text
- per-session harness adapters
- native TUI bridges
- session tree
- event streaming
- inbox/session history primitives
- harness registry
- tool/session dispatch
- native session wrappers
```

Do not reimplement that unless a specific feature cannot be reached through Omnigent’s public, CLI, or server interface.

### 3.2 Do not hard-fork Omnigent initially

Use Omnigent as a pinned upstream dependency, local server, CLI, or runtime. Maintain a small patch queue only if necessary.

### 3.3 TypeScript owns the product-facing contract

Omnigent is Python. The new provider should be TypeScript-first because the first consumers are TypeScript/Node-heavy: `governed-pipeline`, `agent-harness` integrations, and likely future UI/control-plane components.

### 3.4 The new provider must not depend on `governed-pipeline` or `agent-harness`

Dependency direction:

```text
governed-pipeline → agent-runtime-provider-omnigent
agent-harness     → agent-runtime-provider-omnigent
fractal-agents    → agent-runtime-provider-omnigent later
```

The provider must expose neutral runtime primitives and optional adapter packages.

### 3.5 Handoff is explicit, not magical

Do not pretend Claude Code, Codex, Gemini, Pi, and OpenCode share one continuous context window.

Continuity comes from:

```text
- worktree state
- git diff
- structured handoff packet
- bounded session summary
- task contract
- test/log artifacts
```

### 3.6 Prefer provider diversity over same-provider account rotation

When one provider hits a limit:

```text
Preferred:
  route portable work to another provider family

Discouraged:
  immediately switch the same session to another account from the same provider
```

### 3.7 Rate-limit type is a first-class routing signal

A burst/concurrency limit is not the same as a weekly/session cap. The router must classify the limit before deciding whether to retry, wait, reduce concurrency, or route elsewhere.

### 3.8 Raw logs are evidence, not state

Raw stdout/stderr/transcripts should not become durable control-plane truth. Normalize results into bounded, redacted metadata and durable evidence references.

---

## 4. Non-Goals

This project must **not** initially attempt to:

```text
- fork and maintain all of Omnigent
- replace governed-pipeline’s orchestrator
- replace agent-harness phase-loop semantics
- build a full multi-tenant SaaS backend
- bypass provider limits
- automate account creation
- share personal subscriptions across users
- use raw transcripts as authoritative task state
- store unbounded stdout/stderr/provider payloads
- create a generic model gateway unrelated to harness sessions
```

Commercialization can be evaluated later after security, provider terms, tenant isolation, and licensing posture are reviewed.

---

## 5. Target Architecture

```text
┌───────────────────────────────────────────────────────────┐
│ Consiliency / ViperJuice Consumers                         │
│                                                           │
│ governed-pipeline       agent-harness       fractal-agents │
└─────────────┬────────────────────┬────────────────────────┘
              │                    │
              ▼                    ▼
┌───────────────────────────────────────────────────────────┐
│ agent-runtime-provider-omnigent                            │
│                                                           │
│ - AgentRuntimeProvider interface                           │
│ - Omnigent client                                          │
│ - rate-limit catalog                                       │
│ - identity/profile manager                                 │
│ - worktree lease manager                                   │
│ - handoff packet builder                                   │
│ - routing policy engine                                    │
│ - governed-pipeline adapter                                │
│ - agent-harness adapter                                    │
└───────────────────────────┬───────────────────────────────┘
                            │
                            ▼
┌───────────────────────────────────────────────────────────┐
│ Omnigent runtime                                           │
│                                                           │
│ - server/session API                                       │
│ - harness registry                                         │
│ - session tree                                             │
│ - native harness adapters                                  │
│ - Claude/Codex/Gemini/OpenCode/Pi execution                │
└───────────────────────────┬───────────────────────────────┘
                            │
                            ▼
┌───────────────────────────────────────────────────────────┐
│ Provider/harness surfaces                                  │
│                                                           │
│ Claude Code | Codex | Gemini/Antigravity | OpenCode | Pi   │
│ ZAI | MiniMax | Google | OpenAI | Anthropic | local models │
└───────────────────────────────────────────────────────────┘
```

---

## 6. Repository Layout

```text
agent-runtime-provider-omnigent/
  README.md
  LICENSE
  NOTICE
  package.json
  pnpm-workspace.yaml
  tsconfig.base.json
  eslint.config.mjs
  vitest.config.ts

  packages/
    core/
      package.json
      src/
        index.ts
        provider.ts
        types.ts
        schemas.ts
        errors.ts
        events.ts
        handoff-packet.ts
        identity-profile.ts
        rate-limit.ts
        route-decision.ts
        worktree.ts
        redaction.ts

    omnigent-client/
      package.json
      src/
        index.ts
        http-client.ts
        cli-client.ts
        event-stream.ts
        session-mapper.ts
        process-manager.ts
        health.ts
        version.ts

    rate-limit-catalog/
      package.json
      src/
        index.ts
        classifier.ts
        catalog.ts
        fixtures.ts
        providers/
          anthropic.ts
          openai.ts
          google.ts
          zai.ts
          minimax.ts
          generic-openai-compatible.ts
        harnesses/
          claude-code.ts
          codex.ts
          gemini-antigravity.ts
          opencode.ts
          pi.ts

    scheduler/
      package.json
      src/
        index.ts
        router.ts
        provider-state.ts
        identity-pool.ts
        adaptive-concurrency.ts
        cooldowns.ts
        task-portability.ts
        routing-policy.ts

    worktree-router/
      package.json
      src/
        index.ts
        git.ts
        lease-manager.ts
        locks.ts
        mounted-workspace.ts

    governed-pipeline-adapter/
      package.json
      src/
        index.ts
        invoke-omnigent.ts
        executor-result-mapper.ts
        request-mapper.ts
        result-normalizer.ts

    agent-harness-adapter/
      package.json
      src/
        index.ts
        phase-loop-provider.ts
        launch-request-mapper.ts
        launch-result-mapper.ts

    cli/
      package.json
      src/
        main.ts
        commands/
          start-omnigent.ts
          route-task.ts
          classify-limit.ts
          sessions.ts
          identities.ts
          worktrees.ts

  docs/
    architecture.md
    omnigent-contract.md
    governed-pipeline-integration.md
    agent-harness-integration.md
    rate-limit-taxonomy.md
    identity-isolation.md
    handoff-packets.md
    worktree-leasing.md
    security-and-secrets.md
    commercialization-checklist.md

  fixtures/
    rate-limits/
      claude-code/
      codex/
      gemini-antigravity/
      opencode/
      pi/
      openai-api/
      anthropic-api/
      google-api/
      zai/
      minimax/

  examples/
    governed-pipeline/
    agent-harness/
```

---

## 7. Core Interfaces

### 7.1 `AgentRuntimeProvider`

```ts
export interface AgentRuntimeProvider {
  createSession(request: CreateSessionRequest): Promise<AgentSession>;

  sendTurn(request: SendTurnRequest): Promise<TurnHandle>;

  readHistory(
    sessionId: string,
    options?: HistoryOptions,
  ): Promise<SessionHistory>;

  streamEvents(
    sessionId: string,
    options?: StreamOptions,
  ): AsyncIterable<RuntimeEvent>;

  cancelTurn(handle: TurnHandle): Promise<void>;

  closeSession(sessionId: string): Promise<void>;

  getSessionInfo(sessionId: string): Promise<AgentSessionInfo>;

  health(): Promise<ProviderHealth>;
}
```

### 7.2 `CreateSessionRequest`

```ts
export interface CreateSessionRequest {
  readonly runtime: "omnigent";
  readonly targetHarness:
    | "claude-code"
    | "codex"
    | "gemini"
    | "opencode"
    | "pi"
    | "custom";

  readonly targetProvider?: ProviderId;
  readonly identityProfileId?: string;

  readonly title: string;
  readonly repoRoot?: string;
  readonly worktree?: WorktreeLeaseRef;

  readonly agentSpec?: OmnigentAgentSpecRef;
  readonly initialMessage?: string;
  readonly handoffPacket?: HandoffPacket;

  readonly metadata?: Record<string, unknown>;
}
```

### 7.3 `SendTurnRequest`

```ts
export interface SendTurnRequest {
  readonly sessionId: string;
  readonly message: string;
  readonly handoffPacket?: HandoffPacket;
  readonly files?: RuntimeFileRef[];
  readonly timeoutMs?: number;
  readonly retryPolicy?: RuntimeRetryPolicy;
  readonly metadata?: Record<string, unknown>;
}
```

### 7.4 `RuntimeEvent`

```ts
export type RuntimeEvent =
  | RuntimeSessionCreatedEvent
  | RuntimeTurnStartedEvent
  | RuntimeTextDeltaEvent
  | RuntimeToolCallEvent
  | RuntimeToolResultEvent
  | RuntimeApprovalRequestEvent
  | RuntimeLimitEvent
  | RuntimeTurnCompletedEvent
  | RuntimeTurnFailedEvent
  | RuntimeSessionClosedEvent;
```

### 7.5 `HandoffPacket`

```ts
export interface HandoffPacket {
  readonly schema: "handoff_packet.v0.1";

  readonly packetId: string;
  readonly createdAt: string;

  readonly sourceSessionIds: string[];
  readonly sourceHarnesses: string[];
  readonly targetHarness?: string;
  readonly targetProvider?: string;

  readonly reason:
    | "manual_handoff"
    | "provider_rate_limit"
    | "provider_usage_cap"
    | "provider_outage"
    | "session_continuation"
    | "review"
    | "debug"
    | "failover"
    | "routing_policy";

  readonly objective: string;
  readonly currentStatus:
    | "not_started"
    | "in_progress"
    | "blocked"
    | "complete"
    | "failed"
    | "unknown";

  readonly taskContract?: {
    readonly must?: string[];
    readonly mustNot?: string[];
    readonly acceptanceCriteria?: string[];
    readonly constraints?: string[];
  };

  readonly workspace?: {
    readonly repoRoot?: string;
    readonly branch?: string;
    readonly worktreePath?: string;
    readonly baseRef?: string;
    readonly diffRef?: string;
  };

  readonly evidence: {
    readonly changedFiles?: string[];
    readonly inspectedFiles?: string[];
    readonly commandsRun?: CommandEvidence[];
    readonly testResults?: TestEvidence[];
    readonly diffs?: DiffEvidence[];
    readonly logs?: LogEvidence[];
  };

  readonly decisions?: string[];
  readonly assumptions?: string[];
  readonly failedAttempts?: string[];
  readonly risks?: string[];
  readonly openQuestions?: string[];

  readonly nextRecommendedAction?: string;

  readonly contextPolicy: {
    readonly rawHistoryAllowed: boolean;
    readonly rawHistoryMaxItems?: number;
    readonly mayEditFiles: boolean;
    readonly mayRunCommands: boolean;
    readonly mayUseNetwork: boolean;
    readonly maySwitchProvider: boolean;
  };

  readonly requiredOutput?: {
    readonly schema?: string;
    readonly instructions?: string;
  };
}
```

---

## 8. Identity Profile Model

### 8.1 Purpose

Identity profiles isolate provider subscription/API credentials and enable routing without auth bleed.

### 8.2 Shape

```ts
export interface IdentityProfile {
  readonly id: string;
  readonly provider:
    | "anthropic"
    | "openai"
    | "google"
    | "zai"
    | "minimax"
    | "local"
    | "custom";

  readonly harness:
    | "claude-code"
    | "codex"
    | "gemini"
    | "opencode"
    | "pi"
    | "custom";

  readonly authMode:
    | "local_subscription"
    | "api_key"
    | "oauth"
    | "vertex"
    | "service_account"
    | "none";

  readonly isolation:
    | "host_env"
    | "isolated_home"
    | "unix_user"
    | "container"
    | "vm";

  readonly env?: Record<string, string>;
  readonly authVolume?: string;
  readonly homeDir?: string;

  readonly maxOpenSessions: number;
  readonly maxActiveTurns: number;
  readonly maxActiveToolCalls?: number;

  readonly providerFamilyCooldown?: CooldownState;
  readonly identityCooldown?: CooldownState;

  readonly tags?: string[];
}
```

### 8.3 Policy

```text
- Many open sessions are allowed.
- Active turns are bounded and adaptive.
- Rate limits reduce active-turn pressure.
- Fixed usage caps create cooldown-until-reset events.
- Same-provider account hopping after a hard cap is discouraged or manual-confirmed.
- Cross-provider routing is preferred for portable work.
```

---

## 9. Worktree Leasing

### 9.1 Problem

The same logical task may move from Claude → Codex → Gemini after a limit or outage, but the repo should not be recloned for every harness/account.

### 9.2 Model

```text
canonical repo object store
  +
git worktrees per task/lane
  +
exclusive write locks
  +
read-only reviewer leases
```

### 9.3 Interface

```ts
export interface WorktreeLeaseRequest {
  readonly repoId: string;
  readonly repoRoot?: string;
  readonly baseRef?: string;
  readonly branchName: string;
  readonly taskId: string;
  readonly mode: "exclusive_write" | "read_only" | "sequential_continue";
  readonly allowReuseExisting?: boolean;
}

export interface WorktreeLease {
  readonly id: string;
  readonly repoId: string;
  readonly path: string;
  readonly branchName: string;
  readonly mode: "exclusive_write" | "read_only" | "sequential_continue";
  readonly holder: string;
  readonly acquiredAt: string;
  readonly expiresAt?: string;
}
```

### 9.4 Rules

```text
- Same task may reuse same worktree only sequentially.
- Parallel agents must receive separate worktrees.
- Reviewers should use diff/contracts, not mutable implementation worktrees, unless explicitly configured.
- Every handoff packet must include worktree/diff state.
```

---

## 10. Rate-Limit Taxonomy

### 10.1 Required classes

```ts
export type LimitType =
  | "none"
  | "burst_rate_limit"
  | "token_rate_limit"
  | "concurrency_limit"
  | "fixed_window_usage_cap"
  | "monthly_spend_or_quota_cap"
  | "acceleration_limit"
  | "overload_or_transient"
  | "auth_or_billing_problem"
  | "abuse_or_policy_block"
  | "unknown_limit";
```

### 10.2 Required scopes

```ts
export type LimitScope =
  | "session"
  | "identity_profile"
  | "provider_family"
  | "model"
  | "project"
  | "organization"
  | "global"
  | "unknown";
```

### 10.3 Classification object

```ts
export interface LimitClassification {
  readonly schema: "limit_classification.v0.1";

  readonly type: LimitType;
  readonly scope: LimitScope;
  readonly confidence: number;

  readonly provider?: string;
  readonly harness?: string;
  readonly identityProfileId?: string;
  readonly sessionId?: string;

  readonly retryAfterSeconds?: number;
  readonly resetAt?: string;

  readonly rawSignal: {
    readonly statusCode?: number;
    readonly exitCode?: number;
    readonly stderrExcerpt?: string;
    readonly stdoutExcerpt?: string;
    readonly headers?: Record<string, string>;
  };

  readonly routingAction: {
    readonly retrySameSession: boolean;
    readonly reduceConcurrency: boolean;
    readonly routeNewWorkElsewhere: boolean;
    readonly migrateExistingPortableWork: boolean;
    readonly requireManualReview: boolean;
    readonly sameProviderAccountSwitchAllowed: boolean;
  };

  readonly notes?: string[];
}
```

### 10.4 Action matrix

```text
burst_rate_limit:
  - pause briefly
  - reduce active turns
  - retry same identity
  - route unrelated work elsewhere if queue backs up

token_rate_limit:
  - honor reset/retry-after
  - reduce prompt/context/output pressure
  - retry same identity
  - route portable work elsewhere if needed

concurrency_limit:
  - keep sessions open but idle
  - lower active-turn target
  - retry when active turns drop

fixed_window_usage_cap:
  - do not retry before reset
  - pause identity/provider-family until reset
  - route portable work to different provider family
  - avoid immediate same-provider account hopping

monthly_spend_or_quota_cap:
  - mark unavailable until billing reset or manual action
  - route to different provider family

acceleration_limit:
  - cool provider family
  - ramp slowly later

overload_or_transient:
  - exponential backoff
  - route elsewhere after repeated failures

auth_or_billing_problem:
  - stop
  - require reauth/billing fix

abuse_or_policy_block:
  - stop
  - require manual review
```

---

## 11. Router

### 11.1 Route decision

```ts
export interface RouteDecision {
  readonly schema: "route_decision.v0.1";

  readonly taskId: string;
  readonly selectedProvider: string;
  readonly selectedHarness: string;
  readonly selectedIdentityProfileId?: string;

  readonly preferredProvider?: string;
  readonly preferredHarness?: string;

  readonly fallbackUsed: boolean;
  readonly fallbackReason?: string;

  readonly capabilityFit: number;
  readonly providerHealth: number;
  readonly currentCapacity: number;
  readonly contextPortability: "low" | "medium" | "high";

  readonly routeReason:
    | "explicit_override"
    | "capability_fit"
    | "load_balance"
    | "provider_cooldown"
    | "usage_cap"
    | "transient_failure"
    | "manual";

  readonly silentDowngrade: false;

  readonly evidenceRefs?: RuntimeEvidenceRef[];
}
```

### 11.2 Routing rules

```text
1. Honor explicit operator override unless blocked by policy.
2. Prefer initial distribution across provider families.
3. Prefer cross-provider fallback over same-provider account failover.
4. Preserve low-portability sessions on the same provider if reasonable.
5. Route high-portability work freely.
6. Always record fallback reason.
7. Never silently relabel fallback as the original executor.
```

---

## 12. Omnigent Client Requirements

### 12.1 Supported modes

```text
1. HTTP/server mode
   Preferred. Talks to a running Omnigent server/session API.

2. CLI mode
   Fallback. Spawns Omnigent commands or local wrapper scripts.

3. Hybrid mode
   Starts a local Omnigent server if absent, then uses HTTP.
```

### 12.2 Required capabilities

```ts
export interface OmnigentCapabilities {
  readonly canCreateSession: boolean;
  readonly canSendTurn: boolean;
  readonly canReadHistory: boolean;
  readonly canStreamEvents: boolean;
  readonly canCancel: boolean;
  readonly canClose: boolean;
  readonly canListSessions: boolean;
  readonly canSpawnChildSessions: boolean;
  readonly canUseHarnessOverride: boolean;
}
```

### 12.3 Mapping requirements

The Omnigent client must map:

```text
Omnigent session id         → AgentSession.id
Omnigent conversation items → SessionHistory.items
Omnigent SSE events         → RuntimeEvent
Omnigent errors             → RuntimeFailure / LimitClassification candidate
Omnigent child sessions     → AgentSession.parentSessionId/rootSessionId
```

### 12.4 Pinning

The client must detect and record:

```text
- Omnigent version
- Omnigent git SHA if available
- server endpoint
- supported harness list
- runtime capability snapshot
```

---

## 13. UI Product Requirements

The first version can be CLI/API only, but the product should be designed for a UI that borrows Omnigent’s strongest UX ideas.

### 13.1 UI concepts to reuse

```text
- session tree
- child session visibility
- agent/harness badges
- live turn/event stream
- inbox/completion events
- worktree/branch cards
- approval/rate-limit/cooldown cards
- provider health dashboard
- handoff packet viewer
- route decision timeline
```

### 13.2 UI panels

```text
1. Task board
   Shows queued/running/blocked/complete tasks.

2. Provider lanes
   Shows Anthropic/OpenAI/Google/ZAI/MiniMax/local status.

3. Identity profiles
   Shows capacity, cooldowns, active turns, auth health.

4. Session tree
   Shows Omnigent sessions and dependent handoffs.

5. Handoff packet inspector
   Shows objective, evidence, changed files, tests, assumptions.

6. Worktree manager
   Shows worktree leases and locks.

7. Rate-limit catalog
   Shows recent classifications and unknown signals.

8. Audit ledger
   Shows route decisions, fallbacks, retries, cooldowns.
```

### 13.3 UI non-goals

```text
- Do not expose secrets.
- Do not store unbounded transcripts.
- Do not present account switching as quota bypass.
- Do not let UI mutate provider auth without explicit confirmation.
```

---

## 14. Governed Pipeline Integration

### 14.1 Goal

Add Omnigent as an execution backend without violating the single agentic boundary.

### 14.2 Integration point

```text
packages/pipeline-runtime/src/harness/invoke.mjs
```

### 14.3 New harness mode

```ts
invokeAgenticHarness({
  harness: "omnigent",
  targetHarness: "claude" | "codex" | "gemini" | "opencode" | "pi",
  request,
  repoRoot,
  adapter,
  routeDecision,
});
```

### 14.4 Result mapping

Map Omnigent results into `executor_adapter_result.v0.1`.

Required fields:

```text
- executor
- provider/model
- status
- transport_ok
- parse_ok
- parse_mode
- blocker
- log_excerpt bounded/redacted
- policy.preferred_executor
- policy.fallback_executor
- policy.fallback_reason
- policy.silent_downgrade = false
- runtime ledger citations if available
```

### 14.5 Acceptance criteria

```text
- Existing fake/native harness tests continue passing.
- Omnigent adapter can be disabled by config.
- No workflow module imports Omnigent directly.
- All Omnigent calls go through invokeAgenticHarness path.
- Fallback metadata is preserved.
- Raw logs are bounded/redacted.
- Rate-limit classification produces typed blocker or retryable result.
```

---

## 15. Agent Harness Integration

### 15.1 Goal

Allow `agent-harness` phase-loop to dispatch phases through Omnigent-backed sessions while preserving its executor/model/run-mode semantics.

### 15.2 Integration point

Add an optional provider backend:

```text
executor = omnigent
target_executor = claude | codex | gemini | opencode | pi
```

### 15.3 Model policy preservation

Do not replace `agent-harness` model policy. The adapter should receive the selected executor/model/effort from `agent-harness` and translate that into an Omnigent session request.

### 15.4 Launch result mapping

Map Omnigent sessions into `LaunchResult`-like metadata:

```text
- executor
- command/equivalent command metadata
- dry_run
- available
- unavailable_reason
- selected_model
- selected_effort
- auth_preflight_mode
- auth_preflight_probes
- timeout_posture
- output_capture_format
- terminal summary
- route/fallback posture
```

### 15.5 Acceptance criteria

```text
- Phase-loop can launch one phase through Omnigent.
- Claude/Codex/Gemini/OpenCode/Pi target executor metadata is preserved.
- Existing model_policy remains source of model selection.
- Existing run_mode remains source of governance behavior.
- Rate-limit/cooldown result is represented as repairable non-human blocker when appropriate.
- No direct Omnigent dependency leaks into phase-loop planning semantics.
```

---

## 16. Roadmap Requirements

The agent building roadmaps from this spec must produce separate phased roadmaps for:

```text
A. New provider repo bootstrap
B. Omnigent client integration
C. Rate-limit catalog and scheduler
D. Identity/profile isolation
E. Worktree leasing
F. Handoff packet builder
G. governed-pipeline adapter
H. agent-harness adapter
I. UI/control surface
J. hardening/commercialization readiness
```

Each roadmap must contain:

```text
- phase id
- goal
- dependencies
- implementation tasks
- test plan
- acceptance criteria
- rollback plan
- integration target
- artifacts to produce
- risks
```

---

# 17. Proposed Product Phases

## Phase 0 — Repository Bootstrap

### Goal

Create the TypeScript monorepo and freeze public package boundaries.

### Tasks

```text
- initialize pnpm workspace
- add TypeScript strict config
- add Vitest
- add ESLint
- add package skeletons
- add root README
- add architecture docs
- add initial JSON schemas
- add fixtures directory
```

### Acceptance criteria

```text
- pnpm install succeeds
- pnpm test succeeds
- pnpm build succeeds
- all packages emit ESM
- public exports are documented
```

---

## Phase 1 — Core Runtime Contracts

### Goal

Define stable neutral interfaces independent of Omnigent.

### Tasks

```text
- implement AgentRuntimeProvider interface
- define AgentSession
- define RuntimeEvent
- define HandoffPacket
- define LimitClassification
- define RouteDecision
- define IdentityProfile
- define WorktreeLease
- add Zod or JSON Schema validation
- add redaction utilities
```

### Acceptance criteria

```text
- schemas validate good fixtures
- schemas reject malformed fixtures
- no Omnigent dependency in core package
- docs describe every exported type
```

---

## Phase 2 — Omnigent Client

### Goal

Create a client that can connect to Omnigent and map its sessions/events into the neutral provider interface.

### Tasks

```text
- implement Omnigent HTTP client
- implement CLI fallback client
- implement health/version probe
- implement session creation
- implement send turn
- implement history read
- implement event stream parser
- implement cancel/close where available
- map Omnigent sessions to AgentSession
- map Omnigent stream events to RuntimeEvent
```

### Acceptance criteria

```text
- fake Omnigent server fixtures pass
- client handles disconnected server
- client records version/capabilities
- client returns normalized errors
- no raw secret-bearing payload is persisted
```

---

## Phase 3 — Rate-Limit Catalog

### Goal

Classify provider/harness failure signals into actionable typed limit events.

### Tasks

```text
- implement classifier engine
- add deterministic regex/header rules
- add provider-specific classifiers
- add harness-specific classifiers
- add fixture corpus
- add unknown-limit capture format
- add confidence scoring
- add routing-action mapper
```

### Required classifiers

```text
- Claude Code
- Codex
- Gemini/Antigravity
- OpenCode
- Pi
- OpenAI API
- Anthropic API
- Google/Gemini API
- ZAI
- MiniMax
- generic OpenAI-compatible API
```

### Acceptance criteria

```text
- each fixture maps to expected LimitClassification
- unknown fixture maps to unknown_limit, not success
- reset times are parsed when present
- retry-after headers are honored
- hard usage caps are not treated as burst limits
```

---

## Phase 4 — Scheduler and Provider State

### Goal

Implement provider-aware routing and adaptive concurrency.

### Tasks

```text
- implement ProviderState
- implement IdentityPool
- implement cooldown manager
- implement active-turn counters
- implement adaptive concurrency
- implement task portability scoring
- implement routeTask()
- implement provider-family cooldowns
- implement routing policy config
```

### Acceptance criteria

```text
- burst limit reduces active-turn target
- fixed usage cap pauses identity until reset
- provider-family cooldown prevents immediate same-provider account hopping
- portable work routes across provider families
- low-portability sessions wait/retry same provider by default
- route decisions are fully auditable
```

---

## Phase 5 — Identity/Profile Isolation

### Goal

Support isolated provider auth lanes.

### Tasks

```text
- implement identity profile config loader
- support host env profile
- support isolated HOME profile
- support container profile metadata
- support auth volume references
- support per-profile env injection
- implement health/preflight probes
- implement secret redaction
```

### Acceptance criteria

```text
- profiles can be listed
- profiles can be marked available/cooling/needs_auth
- no secret values appear in logs
- profile env can be passed to Omnigent session creation/CLI mode
- profile-level cooldown is enforced
```

---

## Phase 6 — Worktree Leasing

### Goal

Provide reusable worktree leases for sequential handoff and parallel lane isolation.

### Tasks

```text
- implement git worktree creation
- implement lease registry
- implement exclusive write locks
- implement read-only/reviewer lease mode
- implement stale lease detection
- implement cleanup command
- implement diff summary helper
```

### Acceptance criteria

```text
- same task can sequentially reuse same worktree
- parallel writers cannot acquire same worktree
- reviewers can get read-only/diff leases
- handoff packets include branch/worktree/diff metadata
```

---

## Phase 7 — Handoff Packet Builder

### Goal

Generate typed packets for cross-harness continuation.

### Tasks

```text
- implement session history summarizer interface
- implement worktree diff summarizer
- implement command/test evidence collector
- implement packet builder
- implement packet rendering for target harness prompts
- implement packet validation
```

### Acceptance criteria

```text
- handoff packet validates against schema
- packet separates facts, assumptions, risks, open questions
- packet includes changed files and test evidence
- packet can be rendered as a target-agent prompt
- raw history is optional and bounded
```

---

## Phase 8 — Governed Pipeline Adapter

### Goal

Add an Omnigent-backed executor path to `governed-pipeline`.

### Tasks

```text
- implement request mapper from invokeAgenticHarness shape
- implement result mapper to executor_adapter_result.v0.1
- add optional harness = "omnigent"
- add targetHarness field
- add fallback metadata preservation
- add redacted log excerpts
- add tests using injected fake provider
```

### Acceptance criteria

```text
- no workflow module imports provider directly
- all calls remain behind invokeAgenticHarness
- executor result schema validates
- fallback reason is preserved
- silent_downgrade remains false
- rate-limit classifications become typed retry/blocker metadata
```

---

## Phase 9 — Agent Harness Adapter

### Goal

Add Omnigent-backed execution as an optional backend for phase-loop.

### Tasks

```text
- implement LaunchRequest mapper
- implement LaunchResult mapper
- preserve model_policy selection
- preserve run_mode governance
- support target_executor
- support dry-run/capability checks
- support phase-loop metadata
```

### Acceptance criteria

```text
- phase-loop can launch a dry-run Omnigent-backed executor
- phase-loop can launch one real Omnigent-backed executor in an integration test
- selected model/effort metadata is preserved
- unsupported Omnigent state produces typed unavailable result
```

---

## Phase 10 — CLI

### Goal

Provide local operator commands.

### Commands

```text
agent-runtime-provider-omnigent health
agent-runtime-provider-omnigent sessions list
agent-runtime-provider-omnigent sessions show <id>
agent-runtime-provider-omnigent route-task <task-json>
agent-runtime-provider-omnigent classify-limit <fixture-or-log>
agent-runtime-provider-omnigent identities list
agent-runtime-provider-omnigent identities preflight
agent-runtime-provider-omnigent worktrees list
agent-runtime-provider-omnigent worktrees cleanup
```

### Acceptance criteria

```text
- all commands return JSON with --json
- human output is readable
- secrets are redacted
- nonzero exit codes are meaningful
```

---

## Phase 11 — UI Control Surface

### Goal

Build a minimal local UI or API-ready event model for a future UI.

### MVP UI

```text
- provider lane status
- session tree
- active turns
- cooldowns
- worktree leases
- handoff packet viewer
- route decision log
- rate-limit classification feed
```

### Acceptance criteria

```text
- UI consumes provider API, not Omnigent internals
- user can inspect why a task was routed
- user can see cooldown/reset times
- user can see sessions and handoff packets
- no secrets displayed
```

---

## Phase 12 — Hardening

### Goal

Make the system reliable enough for daily use.

### Tasks

```text
- integration tests against real local Omnigent
- fixture-driven classifier regression suite
- chaos tests for server down / CLI missing / auth expired
- redaction audit
- retry storm prevention
- stuck session cleanup
- stale worktree cleanup
- version pinning
- dependency audit
```

### Acceptance criteria

```text
- known harness limit signals classify correctly
- failed retries do not loop indefinitely
- Omnigent missing/unavailable produces typed error
- all durable records are bounded and redacted
- worktree locks recover from crashed process
```

---

## Phase 13 — Commercialization Readiness

### Goal

Prepare for eventual packaging or commercial product use.

### Tasks

```text
- license audit
- provider terms review
- secrets handling review
- multi-user risk review
- attribution/NOTICE flow
- data retention policy
- telemetry opt-in policy
- customer data boundary
- compliance checklist
```

### Acceptance criteria

```text
- Apache-2.0 notices included if distributing Omnigent-derived code
- provider-specific auth modes documented
- no personal subscription pooling for team use
- user-facing terms avoid quota-bypass framing
- architecture supports private/local-only mode
```

---

## 18. Testing Strategy

### 18.1 Unit tests

```text
- schemas
- redaction
- classifier rules
- route decisions
- cooldown behavior
- handoff packet builder
- worktree lease locks
```

### 18.2 Fixture tests

```text
- Claude rate-limit strings
- Codex rate-limit strings
- Gemini/Antigravity auth failures
- OpenCode provider 429s
- Pi retry messages
- OpenAI API 429 with headers
- Anthropic API rate-limit headers
- Google RESOURCE_EXHAUSTED
- ZAI/MiniMax quota messages
```

### 18.3 Integration tests

```text
- fake Omnigent server
- real Omnigent server optional
- governed-pipeline adapter fake provider
- agent-harness adapter fake provider
- worktree handoff simulation
```

### 18.4 Live tests

All live tests must be opt-in:

```text
RUN_LIVE_OMNIGENT=1
RUN_LIVE_CLAUDE=1
RUN_LIVE_CODEX=1
RUN_LIVE_GEMINI=1
```

No default CI test may require subscription credentials.

---

## 19. Security and Secret Handling

### Required rules

```text
- Never persist API keys, OAuth tokens, bearer tokens, auth.json, keychain material, or full env.
- Redact stdout/stderr before storing excerpts.
- Bound excerpts by character count.
- Store auth profile ids, not auth material.
- Treat raw session history as untrusted input.
- Do not render previous agent transcript as system instructions.
- Store route/fallback decisions for audit.
```

### Secret redaction patterns

```text
- Bearer tokens
- API keys
- auth headers
- password=
- token=
- credential=
- authorization=
- api_key=
- OAuth token file paths where sensitive
```

---

## 20. Provider Policy Posture

This product is for a single developer’s local orchestration first.

Policy posture:

```text
- use authorized accounts only
- no account sharing
- no automatic account creation
- no retry storms
- honor reset times
- prefer cross-provider diversity over same-provider account rotation
- manual-confirm same-provider failover after hard usage caps
- log all identity switches
```

---

## 21. Configuration Example

```yaml
runtime:
  backend: omnigent
  omnigent:
    mode: http
    base_url: http://127.0.0.1:8000
    version_pin: "0.3.0.dev0"

routing:
  prefer_provider_diversity: true
  same_provider_account_failover_after_hard_cap: manual_confirm
  adaptive_concurrency: true

identity_profiles:
  claude_primary:
    provider: anthropic
    harness: claude-code
    auth_mode: local_subscription
    isolation: isolated_home
    home_dir: ~/.agent-auth/claude/primary
    max_open_sessions: 20
    max_active_turns: 5

  codex_primary:
    provider: openai
    harness: codex
    auth_mode: local_subscription
    isolation: isolated_home
    env:
      CODEX_HOME: ~/.agent-auth/codex/primary
    max_open_sessions: 20
    max_active_turns: 5

  gemini_primary:
    provider: google
    harness: gemini
    auth_mode: oauth
    isolation: host_env
    max_open_sessions: 20
    max_active_turns: 4

  zai_api:
    provider: zai
    harness: opencode
    auth_mode: api_key
    isolation: host_env
    max_open_sessions: 50
    max_active_turns: 10

  minimax_api:
    provider: minimax
    harness: opencode
    auth_mode: api_key
    isolation: host_env
    max_open_sessions: 50
    max_active_turns: 10
```

---

## 22. Agent Instructions for Roadmap Generation

Give the following instruction to the roadmap-building agent.

```text
You are building phased implementation roadmaps for `agent-runtime-provider-omnigent`.

Use `agent-runtime-provider-omnigent.v0.1` as the source of truth.

Your job is not to implement code yet. Your job is to create implementation roadmaps that can be executed by coding agents.

Generate separate roadmaps for:

A. repository bootstrap
B. core contracts
C. Omnigent client
D. rate-limit catalog
E. scheduler/provider-state engine
F. identity/profile isolation
G. worktree leasing
H. handoff packet builder
I. governed-pipeline adapter
J. agent-harness adapter
K. CLI
L. UI/control surface
M. hardening/commercialization readiness

For each roadmap, produce:

1. Phase id
2. Goal
3. Inputs/dependencies
4. Files/packages to create or modify
5. Implementation tasks
6. Tests and fixtures
7. Acceptance criteria
8. Rollback plan
9. Risks
10. Open questions

Rules:

- Preserve dependency direction. The new provider repo must not depend on governed-pipeline or agent-harness core internals.
- Keep Omnigent behind a provider/client boundary.
- Do not store raw unbounded logs, transcripts, prompts, provider payloads, or secrets.
- Handoff packets are typed state, not prose summaries.
- Rate-limit classifications are first-class routing inputs.
- Prefer provider-family diversity over same-provider account rotation.
- Same-provider account failover after hard usage caps requires explicit policy and should default to manual confirmation.
- All fallback metadata must be explicit. No silent downgrade.
- Worktrees must be locked for exclusive writes.
- Parallel agents must not write to the same worktree.
- Existing governed-pipeline and agent-harness semantics must remain authoritative in their own repos.
```

---

## 23. First Implementation Slice

The first coding slice should be small:

```text
1. Create repo skeleton.
2. Implement packages/core types + schemas.
3. Implement rate-limit classifier framework with three sample classifiers:
   - Claude Code natural-language limit
   - Codex natural-language limit
   - OpenAI API 429 headers
4. Implement fake Omnigent client.
5. Implement governed-pipeline result mapper against fake provider.
6. Add docs and fixtures.
```

Do not start by integrating real Omnigent server calls. Establish the stable internal contract first.

---

## 24. Final Architecture Decision

Build `agent-runtime-provider-omnigent` as a **separate TypeScript monorepo**.

Use it as:

```text
- an Omnigent-backed runtime provider
- a scheduler/rate-limit/cooldown layer
- a handoff packet builder
- a worktree/identity router
- a governed-pipeline adapter
- an agent-harness adapter
```

Do **not** put this directly inside `governed-pipeline` or `agent-harness`.

`governed-pipeline` should consume it through `invokeAgenticHarness`.

`agent-harness` should consume it as an optional executor provider backend.

Omnigent remains the backend runtime engine; this repo becomes the product-specific control layer that makes it fit your governed pipeline and phase-loop architecture.
