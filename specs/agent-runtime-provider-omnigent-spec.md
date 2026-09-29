# Agent Runtime Provider for Omnigent

**Spec ID:** `agent-runtime-provider-omnigent.v0.1`
**Working repo:** `ViperJuice/omniagent-plus`
**Package/product target:** `agent-runtime-provider-omnigent`
**Primary language:** TypeScript / Node 22+ / ESM
**First dependent repos:** `Consiliency/governed-pipeline`, `ViperJuice/agent-harness`
**Runtime backend:** Omnigent, treated as an external Python runtime engine
**Product goal:** A reusable provider/router layer that lets existing Consiliency/ViperJuice orchestration systems launch, route, observe, pause, resume, and hand off agent work across Claude Code, Codex, Gemini/Antigravity, OpenCode, Pi, and future harnesses, while reusing Omnigent’s session/runtime engineering without hard-forking it.
**Review status:** Revised after independent advisor-panel feedback on 2026-06-30. This version treats Omnigent compatibility, lifecycle semantics, durable state, identity isolation, worktree locking, and adapter boundaries as blocking contracts rather than implementation details.

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

### Working repo

```text
ViperJuice/omniagent-plus
```

### Reason

This repo can incubate the spec and first implementation while the package/product target remains precise: `agent-runtime-provider-omnigent`. If the repo later grows into a broader multi-backend runtime router, create or rename to:

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

Adapter packages must be leaf packages. They may depend on provider core contracts and on published/public consumer schemas, but they must not import consumer repo internals. If a required consumer contract is not public, the adapter phase must stop and publish or fixture that contract first.

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

### 3.9 Freeze contracts before routing live work

The first implementation must not start with real scheduling or multi-harness routing. It must first freeze:

```text
- Omnigent transport contract
- session and turn state machines
- runtime event envelope
- normalized error taxonomy
- durable state and audit ledger schemas
- identity isolation model
- worktree lease protocol
- adapter dependency direction
```

Any phase that cannot prove those contracts with fixtures must block downstream integration.

### 3.10 Canonical terminology

Use these canonical names at every public boundary:

```ts
export type RuntimeId = "omnigent";

export type HarnessId =
  | "claude-code"
  | "codex"
  | "gemini-antigravity"
  | "opencode"
  | "pi"
  | "custom";

export type ProviderFamilyId =
  | "anthropic"
  | "openai"
  | "google"
  | "zai"
  | "minimax"
  | "local"
  | "custom";

export type BackendId = "omnigent-http" | "omnigent-cli" | "omnigent-hybrid";
```

Adapter-local names are allowed only at adapter boundaries. For example, `agent-harness` may continue to say `target_executor = claude`, but the provider must map that to canonical `HarnessId = "claude-code"` before storing or routing. `gemini` in public provider schemas means `gemini-antigravity` only when explicitly mapped.

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
│ Pure/schema packages                                       │
│ - core contracts                                           │
│ - event/error schemas                                      │
│ - handoff packet schemas                                   │
│                                                           │
│ Stateful local packages                                    │
│ - state ledger                                             │
│ - route/cooldown coordinator                               │
│ - worktree lease manager                                   │
│                                                           │
│ Boundary packages                                          │
│ - Omnigent transport                                       │
│ - identity isolation                                       │
│ - optional consumer adapters                               │
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
    core-contracts/
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
        state-ledger.ts

    state-ledger/
      package.json
      src/
        index.ts
        sqlite-store.ts
        migrations.ts
        audit-ledger.ts
        evidence-store.ts
        retention.ts
        replay.ts

    omnigent-transport/
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
        conformance.ts

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

    coordinator/
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

    identity-isolation/
      package.json
      src/
        index.ts
        profile-loader.ts
        env-allowlist.ts
        process-profile.ts
        sandbox-policy.ts
        preflight.ts

    worktree-leasing/
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
    lifecycle-and-events.md
    durable-state.md
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

  cancelTurn(handle: TurnHandle, reason?: CancellationReason): Promise<TurnHandle>;

  closeSession(sessionId: string): Promise<void>;

  getSessionInfo(sessionId: string): Promise<AgentSessionInfo>;

  health(): Promise<ProviderHealth>;
}
```

All public methods must validate input schemas before crossing a process or network boundary. Public methods must return typed objects or throw/return `RuntimeFailure`; raw Omnigent, CLI, or harness errors must not leak through unnormalized.

### 7.2 `CreateSessionRequest`

```ts
export interface CreateSessionRequest {
  readonly runtime: "omnigent";
  readonly targetHarness: HarnessId;
  readonly idempotencyKey: string;
  readonly correlationId?: string;

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

`idempotencyKey` is required. Retrying `createSession` with the same key must return the original session or a deterministic `RuntimeFailure` if the original result cannot be recovered.

### 7.3 `SendTurnRequest`

```ts
export interface SendTurnRequest {
  readonly sessionId: string;
  readonly turnId?: string;
  readonly idempotencyKey: string;
  readonly correlationId?: string;
  readonly message: string;
  readonly handoffPacket?: HandoffPacket;
  readonly files?: RuntimeFileRef[];
  readonly timeoutMs?: number;
  readonly retryPolicy?: RuntimeRetryPolicy;
  readonly metadata?: Record<string, unknown>;
}
```

The default policy is one active turn per session. A second `sendTurn` for the same active session must either return the existing turn for the same `idempotencyKey` or fail with `RuntimeFailure.category = "concurrency_limit"`. Queueing must be explicitly enabled by config and reflected in the returned `TurnHandle`.

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
  | RuntimeTurnCancelledEvent
  | RuntimeTurnTimedOutEvent
  | RuntimeSessionClosedEvent;
```

Every runtime event must use this envelope:

```ts
export interface RuntimeEventEnvelope<TType extends string, TPayload> {
  readonly schema: "runtime_event.v0.1";
  readonly eventId: string;
  readonly sequence: number;
  readonly sessionId: string;
  readonly turnId?: string;
  readonly correlationId?: string;
  readonly type: TType;
  readonly occurredAt: string;
  readonly payload: TPayload;
  readonly redaction: RedactionStatus;
  readonly terminal: boolean;
  readonly evidenceRefs?: RuntimeEvidenceRef[];
}
```

Ordering rules:

```text
- `sequence` is monotonic per session.
- Events from one turn must preserve Omnigent/backend order.
- Replay starts after the supplied sequence cursor.
- Missing sequence numbers are stream corruption and must emit RuntimeFailure.
- Heartbeats are allowed but must not advance turn state.
- Terminal turn events are exactly one of completed, failed, cancelled, or timed_out.
```

### 7.5 Session and turn state machines

```ts
export type AgentSessionState =
  | "created"
  | "starting"
  | "idle"
  | "turn_active"
  | "blocked_on_approval"
  | "cancelling"
  | "closed"
  | "failed";

export type TurnState =
  | "accepted"
  | "queued"
  | "running"
  | "blocked_on_tool_approval"
  | "cancelling"
  | "cancelled"
  | "timed_out"
  | "completed"
  | "failed";

export interface TurnHandle {
  readonly sessionId: string;
  readonly turnId: string;
  readonly idempotencyKey: string;
  readonly state: TurnState;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly eventCursor?: number;
}
```

Allowed transitions must be documented and tested. Cancellation must attempt to stop backend work, not merely detach the TypeScript listener. If the backend cannot stop in-flight model work, the result must be `RuntimeFailure.category = "backend_capability_missing"` with safe diagnostics.

### 7.6 `HandoffPacket`

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

Handoff rendering must separate trusted operator/task instructions from untrusted evidence:

```text
trusted:
  - objective
  - taskContract
  - contextPolicy
  - requiredOutput

untrusted:
  - prior agent summaries
  - logs
  - diffs
  - command output
  - raw history excerpts
```

Untrusted content must be quoted or fenced and labeled as evidence. It must never be rendered as system, developer, or operator instruction text.

### 7.7 Tool use and approval protocol

Tool calls and approval requests are security boundaries, not UI-only events.

```ts
export interface RuntimeToolCall {
  readonly toolCallId: string;
  readonly sessionId: string;
  readonly turnId: string;
  readonly toolName: string;
  readonly argumentsRedacted: unknown;
  readonly approvalRequired: boolean;
  readonly evidenceRefs?: RuntimeEvidenceRef[];
}

export interface RuntimeApprovalRequest {
  readonly approvalRequestId: string;
  readonly toolCallId?: string;
  readonly sessionId: string;
  readonly turnId: string;
  readonly requestedAction: string;
  readonly risk: "low" | "medium" | "high";
  readonly allowedApprovers: string[];
  readonly expiresAt?: string;
}

export interface RuntimeApprovalResponse {
  readonly approvalRequestId: string;
  readonly decision: "approved" | "denied" | "timed_out" | "cancelled";
  readonly decidedBy?: string;
  readonly decidedAt: string;
  readonly reason?: string;
}
```

Approval denial or timeout must transition the turn to a typed blocked/failed state and write an audit record.

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

  readonly harness: HarnessId;

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

  readonly secretRefs?: SecretRef[];
  readonly envAllowlist?: string[];
  readonly env?: Record<string, RedactedConfigValue>;
  readonly authVolumeRef?: string;
  readonly homeDir?: string;
  readonly processOwner?: string;
  readonly networkPolicy?: "host" | "restricted" | "disabled";
  readonly toolPolicyRef?: string;

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
- Raw secret values must never appear in profile config, events, logs, route decisions, or handoff packets.
- `host_env` is development-only and must require an explicit allowlist of env keys.
- HTTP/server mode may share an Omnigent process across profiles only if Omnigent natively proves per-session auth/home/env isolation.
- Otherwise the provider must use one backend process per active identity profile.
- CLI mode must spawn with the profile's isolated environment and home directory.
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
  readonly requestedTtlSeconds?: number;
}

export interface WorktreeLease {
  readonly id: string;
  readonly fencingToken: string;
  readonly repoId: string;
  readonly path: string;
  readonly branchName: string;
  readonly mode: "exclusive_write" | "read_only" | "sequential_continue";
  readonly holder: {
    readonly processId: number;
    readonly host: string;
    readonly sessionId?: string;
    readonly turnId?: string;
  };
  readonly acquiredAt: string;
  readonly renewedAt: string;
  readonly expiresAt: string;
  readonly dirtyState: "clean" | "dirty" | "unknown";
}
```

### 9.4 Rules

```text
- Same task may reuse same worktree only sequentially.
- Parallel agents must receive separate worktrees.
- Reviewers should use diff/contracts, not mutable implementation worktrees, unless explicitly configured.
- Every handoff packet must include worktree/diff state.
- Lease acquisition must be atomic across processes.
- Every exclusive lease must use a fencing token; cleanup must verify the token before mutating a worktree.
- Active leases must be renewed by heartbeat. Static expiration without renewal is not sufficient.
- Stale lease recovery must inspect process liveness, host identity, dirty state, and branch state before reusing or cleaning.
- Branch collisions must fail closed unless the caller explicitly requests sequential continuation.
- Symlink and path traversal in worktree paths must be rejected.
- On hosts where `/mnt/workspace` exists, created worktrees must live under `/mnt/workspace/worktrees/<project>-<branch>`.
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
    readonly sameProviderAccountSwitch:
      | "forbidden"
      | "manual_confirmation_required"
      | "allowed_by_policy";
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
8. Every route decision must be persisted before launching backend work.
9. Route replay from the durable ledger must explain why a provider/harness/identity was selected.
```

---

## 12. Durable State and Audit Ledger

### 12.1 State backend

The provider must use a durable local state backend before exposing CLI commands, scheduler behavior, worktree leases, or cross-process routing. In-memory state is allowed only inside unit tests.

Preferred backend:

```text
SQLite database
  +
append-only audit ledger table
  +
bounded redacted evidence store
```

An append-only JSONL ledger with indexed sidecars is acceptable for an early slice only if it proves atomic writes, cross-process reads, schema versioning, and crash recovery.

### 12.2 Required records

```text
- sessions
- turns
- runtime events
- route decisions
- limit classifications
- identity profile status
- provider-family cooldowns
- worktree leases
- tool approval requests/responses
- Omnigent capability snapshots
- evidence refs
```

### 12.3 Ledger rules

```text
- Every record has a schema version.
- Every persisted payload is bounded.
- Secret-bearing values are rejected before persistence.
- Raw transcripts are not persisted by default.
- Evidence refs point to bounded redacted excerpts or external artifact paths.
- Migrations are explicit and tested.
- Retention policy is configurable.
- Audit replay must not require live Omnigent.
```

DATA's local JSONL implementation uses a permanent initialized SQLite database
solely for writer arbitration. Node `^22.13.0 || >=24.0.0` is required by the
private ledger/root workspace; public package requirements remain unchanged.
File and parent-directory sync, same-directory atomic checkpoint replacement,
historical sequence high-water before compaction, and private rejected-tail
evidence before truncation define the supported single-host local-filesystem
protocol. Cooperative writers never replace the live arbitration inode.
Unsupported durability operations fail rather than claiming power-loss proof.

Complete corrupt/schema-invalid records remain intact. Bounded read-only
snapshots distinguish complete, incomplete_tail and in_progress visibility and
never acquire writer locks or repair/migrate state. Array/replay consumers require
complete snapshots; replay selects latest states by ledger sequence with explicit
session scope, and locked retention preserves active/dependent history.

Metadata-only construction and export share a recursive finite-corpus scanner.
Authorized runtime messages remain unrestricted strings; persistence omits raw
started-message/text-delta content. Evidence paths are relative or opaque and
CLI/UI/handoff export projects operational roots to opaque references. Release
records retain lease identity/fencing and optional cause/actor/time provenance;
old records remain unattributed. COORD owns release emission and fencing, WIRE
owns public stream/history truthfulness, and INTEG owns production lifecycle
composition. Fake-provider proof covers idle/turn_active/closed and
running/completed/cancelled, not queued/blocked/timeout/failure scheduling.
See [durable state](../docs/durable-state.md) for protocol, limitations and measurements.

---

## 13. Error Taxonomy

All public package boundaries must normalize failures into `RuntimeFailure`.

```ts
export type RuntimeFailureCategory =
  | "validation"
  | "transport"
  | "protocol"
  | "auth"
  | "billing"
  | "rate_limit"
  | "concurrency_limit"
  | "policy_denied"
  | "approval_required"
  | "approval_denied"
  | "timeout"
  | "cancelled"
  | "harness_unavailable"
  | "backend_unavailable"
  | "backend_version_mismatch"
  | "backend_capability_missing"
  | "sandbox_denied"
  | "malformed_response"
  | "state_conflict"
  | "internal";

export interface RuntimeFailure {
  readonly schema: "runtime_failure.v0.1";
  readonly category: RuntimeFailureCategory;
  readonly retryable: boolean;
  readonly actor:
    | "caller"
    | "provider"
    | "harness"
    | "omnigent"
    | "network"
    | "policy"
    | "unknown";
  readonly scope:
    | "request"
    | "turn"
    | "session"
    | "identity_profile"
    | "provider_family"
    | "worktree"
    | "system";
  readonly message: string;
  readonly retryAfterSeconds?: number;
  readonly resetAt?: string;
  readonly safeDiagnostics?: Record<string, unknown>;
  readonly evidenceRefs?: RuntimeEvidenceRef[];
  readonly causeChain?: RuntimeFailure[];
}
```

Adapters must map `RuntimeFailure` to their native blocker/result schemas without losing category, retryability, fallback reason, or evidence refs.

---

## 14. Omnigent Client Requirements

### 14.1 Contract freeze before implementation

`docs/omnigent-contract.md` is a blocking artifact and is the authoritative
source for `IF-0-CONTRACT-1`. Before implementing real HTTP, CLI, hybrid,
scheduler, or adapter behavior, the repo must capture:

```text
- supported Omnigent versions
- supported Omnigent git SHA or release tag
- HTTP endpoints, methods, request schemas, response schemas, and error schemas
- SSE/event names, payloads, ordering behavior, and reconnect behavior
- CLI commands, flags, stdin/stdout/stderr contracts, and exit codes
- session creation, send-turn, cancel, close, list, history, child-session, and harness override behavior
- capability negotiation and degradation behavior
- fake server fixtures copied from real Omnigent responses
```

If a required Omnigent capability is missing, the spec must say whether the provider emulates it, blocks the phase, or marks the capability unavailable.

Downstream phases must consume `IF-0-CONTRACT-1` from
`docs/omnigent-contract.md` rather than infer behavior from upstream README,
OpenAPI, or source fragments in isolation.

### 14.2 Supported modes

```text
1. HTTP/server mode
   Preferred. Talks to a running Omnigent server/session API.

2. CLI mode
   Fallback. Spawns Omnigent commands or local wrapper scripts.

3. Hybrid mode
   Starts a local Omnigent server if absent, then uses HTTP.
```

Shared HTTP/server mode may be used across identity profiles only if Omnigent natively proves per-session `$HOME`, environment, credential, and auth-volume isolation. Without that proof, the provider must spawn or attach to one backend process per active identity profile.

Hybrid mode must define process ownership, process group behavior, heartbeat files, parent-death handling, and cleanup. A crashed Node orchestrator must not leave orphaned Omnigent model loops running indefinitely.

### 14.3 Required capabilities

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

The v0.1 provider must preserve typed degradation for any capability that the
contract freeze marks `emulated`, `blocked`, or `unavailable`. In particular,
the downstream implementation must not assume native upstream support for
logical close, child-session creation, harness override, or unique terminal
markers unless `docs/omnigent-contract.md` explicitly upgrades those entries.

### 14.4 Mapping requirements

The Omnigent client must map:

```text
Omnigent session id         → AgentSession.id
Omnigent conversation items → SessionHistory.items
Omnigent SSE events         → RuntimeEvent
Omnigent errors             → RuntimeFailure / LimitClassification candidate
Omnigent child sessions     → AgentSession.parentSessionId/rootSessionId
```

### 14.5 Pinning

The client must detect and record:

```text
- Omnigent version
- Omnigent git SHA if available
- server endpoint
- supported harness list
- runtime capability snapshot
```

---

## 15. UI Product Requirements

The first version can be CLI/API only, but the product should be designed for a UI that borrows Omnigent’s strongest UX ideas.

### 15.1 UI concepts to reuse

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

### 15.2 UI panels

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

### 15.3 UI non-goals

```text
- Do not expose secrets.
- Do not store unbounded transcripts.
- Do not present account switching as quota bypass.
- Do not let UI mutate provider auth without explicit confirmation.
```

---

## 16. Governed Pipeline Integration

### 16.1 Goal

Add Omnigent as an execution backend without violating the single agentic boundary.

### 16.2 Integration point

```text
packages/pipeline-runtime/src/harness/invoke.mjs
```

### 16.3 New harness mode

```ts
invokeAgenticHarness({
  harness: "omnigent",
  targetHarness: "claude-code" | "codex" | "gemini-antigravity" | "opencode" | "pi",
  request,
  repoRoot,
  adapter,
  routeDecision,
});
```

### 16.4 Result mapping

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

### 16.5 Acceptance criteria

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

## 17. Agent Harness Integration

### 17.1 Goal

Allow `agent-harness` phase-loop to dispatch phases through Omnigent-backed sessions while preserving its executor/model/run-mode semantics.

### 17.2 Integration point

Add an optional provider backend:

```text
executor = omnigent
target_executor = claude | codex | gemini | opencode | pi
```

The adapter must map `target_executor` values to canonical `HarnessId` values before calling the provider:

```text
claude -> claude-code
gemini -> gemini-antigravity
codex -> codex
opencode -> opencode
pi -> pi
```

### 17.3 Model policy preservation

Do not replace `agent-harness` model policy. The adapter should receive the selected executor/model/effort from `agent-harness` and translate that into an Omnigent session request.

### 17.4 Launch result mapping

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

### 17.5 Acceptance criteria

```text
- Phase-loop can launch one phase through Omnigent.
- Claude/Codex/Gemini/OpenCode/Pi target executor metadata is preserved.
- Existing model_policy remains source of model selection.
- Existing run_mode remains source of governance behavior.
- Rate-limit/cooldown result is represented as repairable non-human blocker when appropriate.
- No direct Omnigent dependency leaks into phase-loop planning semantics.
```

---

## 18. Roadmap Requirements

The agent building roadmaps from this spec must produce gated roadmaps in this order:

```text
A. Omnigent contract discovery and freeze
B. Provider repo bootstrap
C. Core contracts and fake provider
D. Durable state and audit ledger
E. Omnigent transport integration
F. Rate-limit catalog
G. Identity/profile isolation
H. Worktree leasing
I. Handoff packet builder
J. Coordinator/router
K. governed-pipeline adapter
L. agent-harness adapter
M. CLI
N. UI/control surface
O. hardening/commercialization readiness
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
- blocking questions
```

No roadmap may schedule real multi-agent routing, UI work, or downstream repo integration before phases A-D pass.

---

## 19. Proposed Product Phases

## Phase 0 — Omnigent Contract Discovery and Freeze

### Goal

Prove the real Omnigent contract before implementing production transport.

### Tasks

```text
- inspect the target Omnigent version and public API surface
- document HTTP endpoints, SSE events, CLI commands, exit codes, and error payloads
- capture real request/response/event fixtures
- define capability negotiation and degradation behavior
- decide whether HTTP, CLI, or hybrid mode is allowed for v0.1
- decide whether shared HTTP mode can isolate identity profiles
- write `docs/omnigent-contract.md`
```

### Acceptance criteria

```text
- `docs/omnigent-contract.md` is complete enough to build a fake server
- every required provider capability is marked supported, emulated, unavailable, or blocked
- event samples include ordering, terminal, malformed, and reconnect cases
- cancel/close behavior is proven or explicitly unavailable
- no downstream phase depends on an undocumented Omnigent behavior
```

---

## Phase 1 — Repository Bootstrap

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
- package ownership rules are documented
- public exports are documented
```

---

## Phase 2 — Core Contracts and Fake Provider

### Goal

Define stable neutral interfaces independent of real Omnigent and prove them with a fake provider.

### Tasks

```text
- implement AgentRuntimeProvider interface
- define AgentSession, TurnHandle, RuntimeEventEnvelope, HandoffPacket, LimitClassification, RouteDecision, RuntimeFailure, IdentityProfile, and WorktreeLease schemas
- define session and turn state-machine transition tables
- implement fake provider and fake event stream
- add Zod or JSON Schema validation
- add redaction utilities
```

### Acceptance criteria

```text
- schemas validate good fixtures
- schemas reject malformed fixtures
- duplicate idempotency keys are deterministic
- one-active-turn policy is enforced
- fake stream supports replay, sequence gaps, heartbeats, and terminal events
- no real Omnigent dependency in core packages
```

---

## Phase 3 — Durable State and Audit Ledger

### Goal

Make CLI, scheduler, identity state, cooldowns, route decisions, approvals, and leases durable across processes.

### Tasks

```text
- implement local SQLite or approved append-only ledger backend
- add migrations and schema versioning
- persist sessions, turns, events, route decisions, limit classifications, cooldowns, approvals, leases, and evidence refs
- add retention policy and bounded payload enforcement
- add audit replay utilities
```

### Acceptance criteria

```text
- two separate processes see the same cooldown and lease state
- route decisions can be replayed without live Omnigent
- secret-bearing values are rejected before persistence
- migrations are tested
- crash during write leaves the store recoverable
```

---

## Phase 4 — Omnigent Transport

### Goal

Create transport clients that map Omnigent sessions/events/errors into the neutral provider interface.

### Tasks

```text
- implement fake-server conformance tests from Phase 0 fixtures
- implement HTTP client only for documented endpoints
- implement CLI fallback only for documented commands
- implement health/version/capability probe
- implement session creation, send turn, history read, stream events, cancel, and close where available
- implement process ownership and cleanup for CLI/hybrid mode
- map Omnigent failures to RuntimeFailure and LimitClassification candidates
```

### Acceptance criteria

```text
- fake Omnigent server fixtures pass
- missing capability returns typed unavailable failure
- disconnected server returns typed transport/backend_unavailable failure
- cancel either stops backend work or reports backend_capability_missing
- no raw secret-bearing payload is persisted
```

---

## Phase 5 — Rate-Limit Catalog

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
- add routing-action mapper using sameProviderAccountSwitch enum
```

### Acceptance criteria

```text
- each fixture maps to expected LimitClassification
- unknown fixture maps to unknown_limit, not success
- reset times are parsed when present
- retry-after headers are honored
- hard usage caps are not treated as burst limits
- non-limit 429/auth/policy/outage fixtures are not misclassified as quota
```

---

## Phase 6 — Identity/Profile Isolation

### Goal

Support isolated provider auth lanes without auth bleed.

### Tasks

```text
- implement identity profile config loader
- support isolated HOME profile
- support process/env allowlists
- support container/profile metadata
- support auth volume references by id, not secret path content
- implement health/preflight probes
- implement secret redaction and leak tests
- prove or reject shared Omnigent HTTP isolation
```

### Acceptance criteria

```text
- profiles can be listed
- profiles can be marked available/cooling/needs_auth
- no secret values appear in logs, events, handoffs, route decisions, or ledger
- concurrent identities cannot read each other's env/home/auth material
- shared HTTP mode is blocked unless Omnigent isolation is proven
```

---

## Phase 7 — Worktree Leasing

### Goal

Provide durable worktree leases for sequential handoff and parallel lane isolation.

### Tasks

```text
- implement atomic lock acquisition
- implement fencing tokens
- implement heartbeat renewal
- implement stale lease recovery
- implement dirty tree and branch collision checks
- implement `/mnt/workspace/worktrees` placement policy
- implement cleanup command with token verification
- implement diff summary helper
```

### Acceptance criteria

```text
- two separate processes cannot acquire the same exclusive lease
- long-running leases renew without being stolen
- stale leases recover only after process/host/dirty-state checks
- dirty worktrees are not deleted by cleanup
- handoff packets include branch/worktree/diff metadata
```

---

## Phase 8 — Handoff Packet Builder

### Goal

Generate typed packets for cross-harness continuation.

### Tasks

```text
- implement session history summarizer interface
- implement worktree diff summarizer
- implement command/test evidence collector
- implement packet builder
- implement packet rendering for target harness prompts
- implement trusted/untrusted content separation
- implement prompt-injection fixtures
```

### Acceptance criteria

```text
- handoff packet validates against schema
- packet separates task contract, facts, assumptions, risks, open questions, and untrusted evidence
- malicious prior-agent transcript cannot become instructions
- packet includes changed files and test evidence
- raw history is optional and bounded
```

---

## Phase 9 — Coordinator and Router

### Goal

Implement provider-aware routing and adaptive concurrency on top of durable state.

### Tasks

```text
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
- route decisions are persisted before launch and fully auditable
```

---

## Phase 10 — Consumer Adapters

### Goal

Add optional governed-pipeline and agent-harness adapters without importing consumer internals.

### Tasks

```text
- define governed-pipeline public contract fixtures
- define agent-harness public contract fixtures
- implement governed-pipeline request/result mapper against fake provider
- implement agent-harness launch request/result mapper against fake provider
- preserve model/run-mode policy from consumer repos
- preserve fallback and rate-limit metadata
```

### Acceptance criteria

```text
- no adapter imports consumer private modules
- governed-pipeline calls remain behind invokeAgenticHarness
- agent-harness model_policy and run_mode remain authoritative
- fallback reason is preserved
- silent_downgrade remains false
- unsupported Omnigent state produces typed unavailable result
```

---

## Phase 11 — CLI

### Goal

Provide local operator commands backed by durable state.

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
- repeated CLI invocations share state through the durable backend
```

---

## Phase 12 — UI Control Surface

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
- approval requests are visible and auditable
- no secrets displayed
```

---

## Phase 13 — Hardening

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
- orchestrator crash does not leave unmanaged backend loops indefinitely
```

---

## Phase 14 — Commercialization Readiness

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

## 20. Testing Strategy

### 20.1 Unit tests

```text
- schemas
- redaction
- classifier rules
- route decisions
- RuntimeFailure mapping
- event envelope ordering
- session/turn state transitions
- idempotency handling
- cooldown behavior
- handoff packet builder
- worktree lease locks
```

### 20.2 Fixture tests

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
- non-limit 429s
- auth failures
- provider outages
- policy blocks
- malicious transcript/log/diff prompt-injection payloads
```

### 20.3 Integration tests

```text
- fake Omnigent server
- real Omnigent server optional
- governed-pipeline adapter fake provider
- agent-harness adapter fake provider
- worktree handoff simulation
- multi-process durable state sharing
- worktree lease race acquisition
- stale lease recovery with dirty worktree
- event stream reconnect/replay/dedupe
- cancel during active stream
- approval allow/deny/timeout flow
- concurrent identity isolation
- orchestrator crash cleanup
```

### 20.4 Mandatory validation gates

```text
- Omnigent conformance suite passes against pinned fake responses.
- Duplicate sendTurn idempotency is deterministic.
- Concurrent turn behavior is explicitly reject or queue and is tested.
- Event stream sequence gaps produce typed protocol failure.
- Secret values do not appear in config dumps, logs, events, handoffs, CLI JSON, route decisions, or ledger.
- Malicious prior-agent output remains untrusted evidence when rendered.
- Two CLI/provider processes share cooldowns and leases.
- Two exclusive writers cannot acquire the same worktree.
- Identity profiles cannot read each other's env, HOME, or auth material.
- Retry storms stop at configured max attempts with jitter/cooldown.
```

### 20.5 Live tests

All live tests must be opt-in:

```text
RUN_LIVE_OMNIGENT=1
RUN_LIVE_CLAUDE=1
RUN_LIVE_CODEX=1
RUN_LIVE_GEMINI=1
```

No default CI test may require subscription credentials.

---

## 21. Security and Secret Handling

### Threat model

The design must explicitly defend against:

```text
- auth bleed between identity profiles
- host environment leakage into spawned CLIs
- prompt injection from prior-agent transcripts, logs, diffs, and command output
- untrusted handoff evidence being rendered as instructions
- accidental persistence of secrets or full provider payloads
- worktree path traversal or symlink escape
- stale lease cleanup deleting active or dirty work
- tool approval requests being approved by the wrong actor
- retry storms after provider rate limits or billing caps
- cross-user subscription/account pooling if the product later becomes multi-user
```

### Required rules

```text
- Never persist API keys, OAuth tokens, bearer tokens, auth.json, keychain material, or full env.
- Redact stdout/stderr before storing excerpts.
- Bound excerpts by character count.
- Store auth profile ids, not auth material.
- Store secret refs, not secret values.
- Require env allowlists; never pass full host env by default.
- Treat raw session history as untrusted input.
- Do not render previous agent transcript as system instructions.
- Separate trusted task contract from untrusted evidence in every handoff prompt.
- Store route/fallback decisions for audit.
- Persist approval requests and responses.
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

## 22. Provider Policy Posture

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

## 23. Configuration Example

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
    env_allowlist:
      - CODEX_HOME
    env:
      CODEX_HOME:
        redacted_value_ref: codex_primary_home
    max_open_sessions: 20
    max_active_turns: 5

  gemini_primary:
    provider: google
    harness: gemini-antigravity
    auth_mode: oauth
    isolation: isolated_home
    env_allowlist:
      - AGY_CONFIG_HOME
    max_open_sessions: 20
    max_active_turns: 4

  zai_api:
    provider: zai
    harness: opencode
    auth_mode: api_key
    isolation: isolated_home
    secret_refs:
      - op://project/zai_api_key
    max_open_sessions: 50
    max_active_turns: 10

  minimax_api:
    provider: minimax
    harness: opencode
    auth_mode: api_key
    isolation: isolated_home
    secret_refs:
      - op://project/minimax_api_key
    max_open_sessions: 50
    max_active_turns: 10
```

---

## 24. Agent Instructions for Roadmap Generation

Give the following instruction to the roadmap-building agent.

```text
You are building phased implementation roadmaps for `agent-runtime-provider-omnigent`.

Use `agent-runtime-provider-omnigent.v0.1` as the source of truth.

Your job is not to implement code yet. Your job is to create implementation roadmaps that can be executed by coding agents.

Generate separate roadmaps for:

A. Omnigent contract discovery and freeze
B. repository bootstrap
C. core contracts and fake provider
D. durable state and audit ledger
E. Omnigent transport
F. rate-limit catalog
G. identity/profile isolation
H. worktree leasing
I. handoff packet builder
J. coordinator/router
K. governed-pipeline adapter
L. agent-harness adapter
M. CLI
N. UI/control surface
O. hardening/commercialization readiness

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
- Freeze the Omnigent contract before implementing real transport or adapters.
- Keep Omnigent behind a provider/transport boundary.
- Do not rely on in-memory state for CLI, cooldown, lease, scheduler, or audit behavior.
- Do not store raw unbounded logs, transcripts, prompts, provider payloads, or secrets.
- Handoff packets are typed state, not prose summaries.
- Prior-agent output, logs, diffs, and raw history are untrusted evidence.
- Rate-limit classifications are first-class routing inputs.
- Prefer provider-family diversity over same-provider account rotation.
- Same-provider account failover after hard usage caps requires explicit policy and should default to manual confirmation.
- All fallback metadata must be explicit. No silent downgrade.
- Worktrees must be locked with durable cross-process leases, fencing tokens, and heartbeat renewal.
- Parallel agents must not write to the same worktree.
- Existing governed-pipeline and agent-harness semantics must remain authoritative in their own repos.
```

---

## 25. First Implementation Slice

The first coding slice should be small:

```text
1. Produce `docs/omnigent-contract.md` from real Omnigent inspection or mark the missing source as a blocker.
2. Create repo skeleton.
3. Implement `packages/core-contracts` types + schemas.
4. Implement fake provider and fake Omnigent fixtures only from the frozen contract.
5. Implement session/turn/event/error state-machine tests.
6. Implement redaction tests and prompt-injection handoff fixtures.
7. Add docs and fixtures.
```

Do not start by integrating real Omnigent server calls, scheduler routing, real adapters, or UI. Establish the frozen backend contract and stable internal contract first.

---

## 26. Final Architecture Decision

Build `agent-runtime-provider-omnigent` as a **separate TypeScript monorepo**.

Use it as:

```text
- an Omnigent-backed runtime provider
- a contract-first Omnigent transport boundary
- a durable state, scheduler, rate-limit, and cooldown layer
- a handoff packet builder
- a worktree/identity router
- optional governed-pipeline and agent-harness adapter leaf packages
```

Do **not** put this directly inside `governed-pipeline` or `agent-harness`.

`governed-pipeline` should consume it through `invokeAgenticHarness`.

`agent-harness` should consume it as an optional executor provider backend.

Omnigent remains the backend runtime engine; this repo becomes the product-specific control layer that makes it fit your governed pipeline and phase-loop architecture.
