import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  FakeAgentRuntimeProvider,
  agentRuntimeProviderSchema,
  agentSessionSchema,
  handoffPacketSchema,
  identityProfileSchema,
  limitClassificationSchema,
  routeDecisionSchema,
  runtimeEventSchema,
  runtimeFailureSchema,
  turnHandleSchema,
  worktreeLeaseSchema,
  sendTurnRequestSchema,
  createSessionRequestSchema,
  createWorktreeLeaseRelease,
  runtimeToolCallSchema,
  type AgentRuntimeProvider,
  type AgentSession,
  type HandoffPacket,
  type IdentityProfile,
  type LimitClassification,
  type RouteDecision,
  type RuntimeEventEnvelope,
  type RuntimeFailure,
  type TurnHandle,
  type WorktreeLease,
} from "./index.js";

function readFixture<T>(name: string): T {
  return JSON.parse(
    readFileSync(
      new URL(`../../../fixtures/core/contracts/${name}`, import.meta.url),
      "utf8",
    ),
  ) as T;
}

describe("schemas", () => {
  it("preserves request-string and unknown-field compatibility while checking retained metadata", () => {
    const base = { sessionId: "session", idempotencyKey: "key" };
    for (const message of ["", " \n ", "normal", "é".repeat(10_000), "Bearer synthetic-token-123456"]) {
      const result = sendTurnRequestSchema.parse({ ...base, message, extension: { password: "discarded extension" } });
      expect(result.message).toBe(message);
      expect(result).not.toHaveProperty("extension");
    }
    for (const message of [undefined, null, 1, {}]) expect(() => sendTurnRequestSchema.parse({ ...base, message })).toThrow();
    const corpus = JSON.parse(readFileSync(new URL("../../../fixtures/content-policy/corpus.json", import.meta.url), "utf8")) as { allowed: unknown[]; rejected: unknown[] };
    for (const value of corpus.allowed) expect(() => sendTurnRequestSchema.parse({ ...base, message: "safe", metadata: { nested: value } })).not.toThrow();
    for (const value of corpus.rejected) expect(() => sendTurnRequestSchema.parse({ ...base, message: "safe", metadata: { nested: value } })).toThrow();
    for (const value of corpus.rejected) expect(() => runtimeToolCallSchema.parse({ toolCallId: "tool", sessionId: "session", turnId: "turn",
      toolName: "read", argumentsRedacted: { nested: value }, approvalRequired: false })).toThrow();
    expect(createSessionRequestSchema.parse({ runtime: "omnigent", targetHarness: "codex", idempotencyKey: "root", title: "safe", repoRoot: "/home/synthetic/project" }).repoRoot)
      .toBe("/home/synthetic/project");
  });

  it("represents lease release with preserved fencing and explicit bounded provenance", () => {
    const lease = readFixture<WorktreeLease>("worktree-lease.json");
    for (const cause of ["holder_release", "reconciliation", "recovery"] as const) {
      const release = { cause, actor: "test-operator", releasedAt: lease.expiresAt };
      const result = createWorktreeLeaseRelease(lease, release);
      expect(result.id).toBe(lease.id);
      expect(result.fencingToken).toBe(lease.fencingToken);
      expect(result.renewedAt).toBe(result.expiresAt);
      expect(worktreeLeaseSchema.parse(result).release).toEqual(release);
    }
    expect(worktreeLeaseSchema.parse(lease).release).toBeUndefined();
    expect(() => createWorktreeLeaseRelease(lease, { cause: "recovery", actor: "Bearer synthetic-token-123456", releasedAt: lease.expiresAt })).toThrow();
    expect(() => createWorktreeLeaseRelease(lease, { cause: "recovery", actor: "é".repeat(141), releasedAt: lease.expiresAt })).toThrow();
  });
  it("parses the core contract fixtures", () => {
    expect(
      agentSessionSchema.parse(
        readFixture<AgentSession>("agent-session.json"),
      ),
    ).toBeTruthy();
    expect(
      turnHandleSchema.parse(readFixture<TurnHandle>("turn-handle.json")),
    ).toBeTruthy();
    expect(
      runtimeEventSchema.parse(
        readFixture<RuntimeEventEnvelope<string, unknown>>(
          "runtime-event-envelope.json",
        ),
      ),
    ).toBeTruthy();
    expect(
      handoffPacketSchema.parse(
        readFixture<HandoffPacket>("handoff-packet.json"),
      ),
    ).toBeTruthy();
    expect(
      limitClassificationSchema.parse(
        readFixture<LimitClassification>("limit-classification.json"),
      ),
    ).toBeTruthy();
    expect(
      routeDecisionSchema.parse(
        readFixture<RouteDecision>("route-decision.json"),
      ),
    ).toBeTruthy();
    expect(
      runtimeFailureSchema.parse(
        readFixture<RuntimeFailure>("runtime-failure.json"),
      ),
    ).toBeTruthy();
    expect(
      identityProfileSchema.parse(
        readFixture<IdentityProfile>("identity-profile.json"),
      ),
    ).toBeTruthy();
    expect(
      worktreeLeaseSchema.parse(
        readFixture<WorktreeLease>("worktree-lease.json"),
      ),
    ).toBeTruthy();
  });

  it("validates the fake provider against the public provider contract", () => {
    const provider = new FakeAgentRuntimeProvider();
    expect(agentRuntimeProviderSchema.parse(provider)).toBe(provider);
  });

  it("keeps the required public types assignable", () => {
    const provider: AgentRuntimeProvider = new FakeAgentRuntimeProvider();
    const session: AgentSession = readFixture("agent-session.json");
    const turn: TurnHandle = readFixture("turn-handle.json");
    const handoff: HandoffPacket = readFixture("handoff-packet.json");
    const limit: LimitClassification = readFixture("limit-classification.json");
    const route: RouteDecision = readFixture("route-decision.json");
    const failure: RuntimeFailure = readFixture("runtime-failure.json");
    const profile: IdentityProfile = readFixture("identity-profile.json");
    const lease: WorktreeLease = readFixture("worktree-lease.json");
    const event: RuntimeEventEnvelope<"runtime.turn.completed", { outcome: "completed" }> =
      {
        schema: "runtime_event.v0.1",
        eventId: "event-1",
        sequence: 1,
        sessionId: session.id,
        turnId: turn.turnId,
        type: "runtime.turn.completed",
        occurredAt: "2026-06-30T00:00:00.000Z",
        payload: {
          outcome: "completed",
        },
        redaction: "metadata_only",
        terminal: true,
      };

    expect(provider).toBeTruthy();
    expect(handoff.objective).toContain("Bootstrap");
    expect(limit.type).toBe("fixed_window_usage_cap");
    expect(route.routeReason).toBe("capability_fit");
    expect(route.portabilityScore).toBeGreaterThan(0.8);
    expect(route.activeTurnTarget).toBe(2);
    expect(route.cooldownState?.providerFamilyBlocked).toBe(false);
    expect(route.launchGate?.routeDecisionPersisted).toBe(true);
    expect(failure.category).toBe("concurrency_limit");
    expect(profile.harness).toBe("codex");
    expect(lease.mode).toBe("exclusive_write");
    expect(event.payload.outcome).toBe("completed");
  });
});
