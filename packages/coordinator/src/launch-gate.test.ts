import { describe, expect, it } from "vitest";

import type {
  AgentRuntimeProvider,
  AgentSession,
  AgentSessionInfo,
  CancellationReason,
  CreateSessionRequest,
  HistoryOptions,
  ProviderHealth,
  RuntimeEvent,
  SendTurnRequest,
  SessionHistory,
  StreamOptions,
  TurnHandle,
} from "@omniagent-plus/core-contracts";

import {
  createSessionWithRouteDecision,
  sendTurnWithRouteDecision,
} from "./index.js";

class RecordingProvider implements AgentRuntimeProvider {
  createSessionCalls = 0;
  sendTurnCalls = 0;

  constructor(private readonly sequence: string[]) {}

  async createSession(request: CreateSessionRequest): Promise<AgentSession> {
    this.createSessionCalls += 1;
    this.sequence.push("createSession");
    return {
      id: `session-${request.idempotencyKey}`,
      runtime: request.runtime,
      targetHarness: request.targetHarness,
      targetProvider: request.targetProvider,
      identityProfileId: request.identityProfileId,
      title: request.title,
      state: "idle",
      createdAt: "2026-06-30T00:00:00.000Z",
      updatedAt: "2026-06-30T00:00:00.000Z",
    };
  }

  async sendTurn(request: SendTurnRequest): Promise<TurnHandle> {
    this.sendTurnCalls += 1;
    this.sequence.push("sendTurn");
    return {
      sessionId: request.sessionId,
      turnId: request.turnId ?? `turn-${request.idempotencyKey}`,
      idempotencyKey: request.idempotencyKey,
      state: "running",
      createdAt: "2026-06-30T00:00:01.000Z",
      updatedAt: "2026-06-30T00:00:01.000Z",
    };
  }

  async readHistory(
    sessionId: string,
    _options?: HistoryOptions,
  ): Promise<SessionHistory> {
    return {
      sessionId,
      events: [],
    };
  }

  async *streamEvents(
    _sessionId: string,
    _options?: StreamOptions,
  ): AsyncIterable<RuntimeEvent> {
    yield* [];
  }

  async cancelTurn(
    handle: TurnHandle,
    _reason?: CancellationReason,
  ): Promise<TurnHandle> {
    return handle;
  }

  async closeSession(_sessionId: string): Promise<void> {}

  async getSessionInfo(sessionId: string): Promise<AgentSessionInfo> {
    return {
      id: sessionId,
      runtime: "omnigent",
      targetHarness: "codex",
      title: "recording provider",
      state: "idle",
      createdAt: "2026-06-30T00:00:00.000Z",
      updatedAt: "2026-06-30T00:00:00.000Z",
      eventCursor: 0,
    };
  }

  async health(): Promise<ProviderHealth> {
    return {
      runtime: "omnigent",
      backend: "omnigent-http",
      available: true,
      activeSessions: 0,
      sessionStateDrift: [],
    };
  }
}

function createRouteDecision() {
  return {
    schema: "route_decision.v0.1" as const,
    taskId: "task-1",
    selectedProvider: "openai",
    selectedHarness: "codex",
    selectedIdentityProfileId: "profile-openai-primary",
    preferredProvider: "openai",
    preferredHarness: "codex",
    fallbackUsed: false,
    capabilityFit: 0.95,
    providerHealth: 0.9,
    currentCapacity: 0.8,
    contextPortability: "medium" as const,
    portabilityScore: 0.6,
    activeTurnTarget: 2,
    cooldownState: {
      providerFamilyBlocked: false,
      identityBlocked: false,
      sameProviderAccountSwitch: "forbidden" as const,
    },
    launchGate: {
      action: "allowed" as const,
      reason: "persisted before launch",
      routeDecisionPersisted: false,
      labelsMatch: true,
      manualConfirmationProvided: false,
    },
    routeReason: "capability_fit" as const,
    silentDowngrade: false as const,
  };
}

describe("launch gate", () => {
  it("appends the route decision before backend launch", async () => {
    const sequence: string[] = [];
    const provider = new RecordingProvider(sequence);

    const session = await createSessionWithRouteDecision({
      provider,
      routeStore: {
        appendRouteDecision: async () => {
          sequence.push("appendRouteDecision");
        },
      },
      decision: createRouteDecision(),
      request: {
        runtime: "omnigent",
        targetHarness: "codex",
        targetProvider: "openai",
        identityProfileId: "profile-openai-primary",
        idempotencyKey: "session-1",
        title: "launch gate",
      },
    });

    expect(session.targetHarness).toBe("codex");
    expect(sequence).toEqual(["appendRouteDecision", "createSession"]);
  });

  it("fails closed when route persistence fails", async () => {
    const sequence: string[] = [];
    const provider = new RecordingProvider(sequence);

    await expect(
      createSessionWithRouteDecision({
        provider,
        routeStore: {
          appendRouteDecision: async () => {
            throw new Error("ledger unavailable");
          },
        },
        decision: createRouteDecision(),
        request: {
          runtime: "omnigent",
          targetHarness: "codex",
          targetProvider: "openai",
          identityProfileId: "profile-openai-primary",
          idempotencyKey: "session-1",
          title: "launch gate",
        },
      }),
    ).rejects.toThrow("ledger unavailable");

    expect(provider.createSessionCalls).toBe(0);
    expect(sequence).toEqual([]);
  });

  it("rejects silent label downgrades before provider launch", async () => {
    const provider = new RecordingProvider([]);

    await expect(
      createSessionWithRouteDecision({
        provider,
        routeStore: {
          appendRouteDecision: async () => undefined,
        },
        decision: createRouteDecision(),
        request: {
          runtime: "omnigent",
          targetHarness: "claude-code",
          targetProvider: "openai",
          identityProfileId: "profile-openai-primary",
          idempotencyKey: "session-1",
          title: "launch gate",
        },
      }),
    ).rejects.toMatchObject({
      category: "state_conflict",
      scope: "turn",
    });

    expect(provider.createSessionCalls).toBe(0);
  });

  it("persists route decisions before sendTurn", async () => {
    const sequence: string[] = [];
    const provider = new RecordingProvider(sequence);

    const turn = await sendTurnWithRouteDecision({
      provider,
      routeStore: {
        appendRouteDecision: async () => {
          sequence.push("appendRouteDecision");
        },
      },
      decision: createRouteDecision(),
      request: {
        sessionId: "session-1",
        idempotencyKey: "turn-1",
        message: "continue",
      },
    });

    expect(turn.turnId).toBe("turn-turn-1");
    expect(sequence).toEqual(["appendRouteDecision", "sendTurn"]);
  });
});
