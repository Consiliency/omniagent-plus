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
