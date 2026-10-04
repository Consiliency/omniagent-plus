import { describe, expect, it, vi } from "vitest";

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
} from "@consiliency/runtime-provider";

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
      targetProvider: "openai",
      identityProfileId: "profile-openai-primary",
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
  it("detaches creation labels and decision before waiting for persistence", async () => {
    const provider = new RecordingProvider([]);
    const request = { runtime: "omnigent" as const, targetHarness: "codex" as CreateSessionRequest["targetHarness"], targetProvider: "openai" as const, identityProfileId: "profile-openai-primary", idempotencyKey: "original", title: "original" };
    const decision = createRouteDecision();
    let resume!: () => void;
    const appendRouteDecision = vi.fn(async (_decision: unknown) => new Promise<void>((resolve) => { resume = resolve; }));
    const pending = createSessionWithRouteDecision({ provider, request, decision, routeStore: { appendRouteDecision } });
    request.targetHarness = "claude-code";
    decision.selectedHarness = "claude-code";
    resume();
    expect((await pending).targetHarness).toBe("codex");
    expect(appendRouteDecision.mock.calls[0]?.[0]).toMatchObject({ selectedHarness: "codex" });
  });
  it.each(["lookup", "persistence"])("detaches turn session and decision across the %s wait", async (boundary) => {
    const provider = new RecordingProvider([]);
    const session = await provider.getSessionInfo("original");
    const request = { sessionId: "original", idempotencyKey: "turn", message: "continue" };
    const decision = createRouteDecision();
    let resume!: () => void;
    let entered!: () => void;
    const ready = new Promise<void>((resolve) => { entered = resolve; });
    const wait = async () => { entered(); await new Promise<void>((resolve) => { resume = resolve; }); };
    vi.spyOn(provider, "getSessionInfo").mockImplementation(async () => { if (boundary === "lookup") await wait(); return session; });
    const appendRouteDecision = vi.fn(async (_decision: unknown) => { if (boundary === "persistence") await wait(); });
    const pending = sendTurnWithRouteDecision({ provider, request, decision, routeStore: { appendRouteDecision } });
    await ready;
    request.sessionId = "unchecked-session";
    decision.selectedProvider = "google";
    resume();
    expect((await pending).sessionId).toBe("original");
    expect(appendRouteDecision.mock.calls[0]?.[0]).toMatchObject({ selectedProvider: "openai" });
  });
  it("rejects unknown, missing and mismatched established session labels before persistence or sending", async () => {
    const provider = new RecordingProvider([]);
    const matching = await provider.getSessionInfo("session-1");
    const appendRouteDecision = vi.fn();
    const request = { sessionId: "session-1", idempotencyKey: "turn", message: "continue" };
    for (const session of [{ ...matching, id: "other" }, { ...matching, targetProvider: "google" as const }, { ...matching, targetProvider: undefined }, { ...matching, targetHarness: "claude-code" as const }, { ...matching, identityProfileId: "other" }]) {
      vi.spyOn(provider, "getSessionInfo").mockResolvedValue(session);
      await expect(sendTurnWithRouteDecision({ provider, routeStore: { appendRouteDecision }, decision: createRouteDecision(), request })).rejects.toMatchObject({ category: "state_conflict" });
    }
    vi.spyOn(provider, "getSessionInfo").mockRejectedValue(new Error("unknown session"));
    await expect(sendTurnWithRouteDecision({ provider, routeStore: { appendRouteDecision }, decision: createRouteDecision(), request })).rejects.toThrow("unknown session");
    expect(appendRouteDecision).not.toHaveBeenCalled();
    expect(provider.sendTurnCalls).toBe(0);
  });
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
