import {
  createRuntimeFailure,
  type AgentRuntimeProvider,
  type AgentSession,
  type AgentSessionInfo,
  type AgentSessionState,
  type CancellationReason,
  type CreateSessionRequest,
  type HistoryOptions,
  type ProviderHealth,
  type RuntimeEvent,
  type RuntimeFailure,
  type SendTurnRequest,
  type SessionHistory,
  type StreamOptions,
  type TurnHandle,
} from "@consiliency/runtime-provider";

import { OmnigentEventMapper } from "./event-mapper.js";
import { mapOmnigentConversationHistory } from "./history-mapper.js";
import { OmnigentHttpClient } from "./http-client.js";
import type {
  OmnigentHttpClientOptions,
  OmnigentSessionSnapshot,
} from "./types.js";

function mapSessionState(status: OmnigentSessionSnapshot["status"]): AgentSessionState {
  switch (status) {
    case "running":
    case "waiting":
      return "turn_active";
    case "failed":
      return "failed";
    case "idle":
    default:
      return "idle";
  }
}

function toSessionInfo(
  request: Pick<
    CreateSessionRequest,
    | "correlationId"
    | "handoffPacket"
    | "identityProfileId"
    | "repoRoot"
    | "targetHarness"
    | "targetProvider"
    | "title"
    | "worktree"
  >,
  snapshot: OmnigentSessionSnapshot,
  previous?: AgentSessionInfo,
): AgentSessionInfo {
  const snapshotTurnId =
    snapshot.activeTurnId ?? snapshot.activeResponseId ?? undefined;
  const preserveActiveTurn =
    snapshot.status === "idle" &&
    snapshotTurnId === undefined &&
    previous?.state === "turn_active";
  const preserveFailure =
    snapshot.status === "idle" && previous?.state === "failed";
  return {
    activeTurnId: preserveActiveTurn ? previous.activeTurnId : snapshotTurnId,
    correlationId: request.correlationId,
    createdAt: snapshot.createdAt,
    eventCursor: previous?.eventCursor ?? 0,
    handoffPacket: request.handoffPacket,
    id: snapshot.id,
    identityProfileId: request.identityProfileId,
    lastError: previous?.lastError,
    metadata:
      snapshot.mcpStartup == null
        ? snapshot.metadata
        : { ...snapshot.metadata, mcp_startup: snapshot.mcpStartup },
    repoRoot: request.repoRoot,
    rootSessionId: snapshot.id,
    runtime: "omnigent",
    state:
      preserveActiveTurn || preserveFailure
        ? previous.state
        : mapSessionState(snapshot.status),
    targetHarness: request.targetHarness,
    targetProvider: request.targetProvider,
    title: snapshot.title,
    updatedAt: snapshot.updatedAt,
    worktree: request.worktree,
  };
}

export class OmnigentHttpProvider implements AgentRuntimeProvider {
  private readonly client: OmnigentHttpClient;
  private readonly creates = new Map<string, Promise<AgentSession>>();
  private readonly sends = new Map<string, Promise<TurnHandle>>();
  private readonly sessions = new Map<string, AgentSessionInfo>();
  private readonly turns = new Map<string, TurnHandle>();

  constructor(options: OmnigentHttpClientOptions) {
    this.client = new OmnigentHttpClient(options);
  }

  async createSession(request: CreateSessionRequest): Promise<AgentSession> {
    const existing = this.creates.get(request.idempotencyKey);
    if (existing) {
      return existing;
    }

    const pending = this.createSessionOnce(request);
    this.creates.set(request.idempotencyKey, pending);
    try {
      return await pending;
    } catch (error) {
      this.creates.delete(request.idempotencyKey);
      throw error;
    }
  }

  async sendTurn(request: SendTurnRequest): Promise<TurnHandle> {
    const key = `${request.sessionId}:${request.idempotencyKey}`;
    const existing = this.sends.get(key);
    if (existing) {
      return existing;
    }

    const pending = this.sendTurnOnce(request);
    this.sends.set(key, pending);
    try {
      return await pending;
    } catch (error) {
      if (!isPolicyDenied(error)) {
        this.sends.delete(key);
      }
      throw error;
    }
  }

  private async createSessionOnce(
    request: CreateSessionRequest,
  ): Promise<AgentSession> {
    const snapshot = await this.client.createSession(request);
    const session = toSessionInfo(request, snapshot);
    this.sessions.set(session.id, session);
    return session;
  }

  private async sendTurnOnce(request: SendTurnRequest): Promise<TurnHandle> {
    const ack = await this.client.sendTurn(request);
    if ("denied" in ack && ack.denied) {
      throw createRuntimeFailure({
        actor: "policy",
        category: "policy_denied",
        message: ack.reason,
        retryable: false,
        scope: "turn",
      });
    }
    const now = new Date().toISOString();
    const turnId =
      ack.item_id ??
      ack.pending_id ??
      `omnigent:${request.sessionId}:${request.idempotencyKey}`;
    const handle: TurnHandle = {
      createdAt: now,
      idempotencyKey: request.idempotencyKey,
      sessionId: request.sessionId,
      state: ack.queued ? "queued" : "running",
      turnId,
      updatedAt: now,
    };
    this.turns.set(`${handle.sessionId}:${handle.turnId}`, handle);

    const session = this.sessions.get(request.sessionId);
    if (session) {
      this.sessions.set(request.sessionId, {
        ...session,
        activeTurnId: turnId,
        state: "turn_active",
        updatedAt: now,
      });
    }

    return handle;
  }

  async readHistory(
    sessionId: string,
    options?: HistoryOptions,
  ): Promise<SessionHistory> {
    const items = await this.client.getHistory(sessionId);
    const mapped = mapOmnigentConversationHistory(sessionId, items, {
      afterSequence: options?.afterSequence,
    });

    const events =
      options?.limit === undefined
        ? mapped.history.events
        : mapped.history.events.slice(0, options.limit);

    return {
      events,
      nextCursor:
        events.at(-1)?.sequence ?? options?.afterSequence ?? 0,
      sessionId,
    };
  }

  async *streamEvents(
    sessionId: string,
    options?: StreamOptions,
  ): AsyncIterable<RuntimeEvent> {
    const stream = await this.client.openSessionStream(sessionId);
    try {
      const snapshot = await this.client.getSession(sessionId);
      stream.setFallbackTurnId(this.sessions.get(sessionId)?.activeTurnId);
      stream.setActiveResponseId(snapshot.activeResponseId);
      const items = await this.client.getHistory(sessionId);
      const mappedSnapshot = mapOmnigentConversationHistory(sessionId, items, {
        afterSequence: options?.afterSequence,
      });

      this.refreshTrackedSession(sessionId, snapshot);
      for (const event of mappedSnapshot.history.events) {
        yield event;
      }

      const startingSequence =
        Math.max(
          mappedSnapshot.runtimeEvents.at(-1)?.sequence ?? 0,
          options?.afterSequence ?? 0,
        ) + 1;
      const mapper = new OmnigentEventMapper(sessionId, {
        historicalTextByTurnId: mappedSnapshot.historicalTextByTurnId,
        historicalToolCallIds: mappedSnapshot.historicalToolCallIds,
        historicalToolResultIds: mappedSnapshot.historicalToolResultIds,
        seenItemIds: mappedSnapshot.seenItemIds,
        startingSequence,
        startedTurnIds: mappedSnapshot.startedTurnIds,
        terminalTurnIds: mappedSnapshot.terminalTurnIds,
      });

      for await (const rawEvent of stream.events) {
        const events = mapper.map(rawEvent);
        const failure = events.find(
          (event): event is Extract<RuntimeEvent, { type: "runtime.turn.failed" }> =>
            event.type === "runtime.turn.failed",
        )?.payload.failure;
        if (
          failure !== undefined ||
          (rawEvent.type === "session.status" && rawEvent.status === "failed")
        ) {
          this.failActiveTurn(sessionId, rawEvent.occurredAt, failure);
        } else if (rawEvent.terminal) {
          this.clearActiveTurn(sessionId, rawEvent.occurredAt);
        } else if (rawEvent.turnId) {
          this.setActiveTurn(sessionId, rawEvent.turnId, rawEvent.occurredAt);
        }
        for (const event of events) {
          yield event;
        }
      }
    } finally {
      await stream.close();
    }
  }

  async cancelTurn(
    handle: TurnHandle,
    reason: CancellationReason = "user_request",
  ): Promise<TurnHandle> {
    await this.client.sendEvent(handle.sessionId, {
      data: { reason },
      type: "interrupt",
    });
    const cancelled: TurnHandle = {
      ...handle,
      state: "cancelled",
      updatedAt: new Date().toISOString(),
    };
    this.turns.set(`${handle.sessionId}:${handle.turnId}`, cancelled);
    const session = this.sessions.get(handle.sessionId);
    if (session) {
      this.sessions.set(handle.sessionId, {
        ...session,
        activeTurnId: undefined,
        state: "idle",
        updatedAt: cancelled.updatedAt,
      });
    }
    return cancelled;
  }

  async closeSession(sessionId: string): Promise<void> {
    await this.client.sendEvent(sessionId, {
      data: {},
      type: "stop_session",
    });
    const session = this.sessions.get(sessionId);
    if (session) {
      this.sessions.set(sessionId, {
        ...session,
        activeTurnId: undefined,
        state: "closed",
        updatedAt: new Date().toISOString(),
      });
    }
  }

  async getSessionInfo(sessionId: string): Promise<AgentSessionInfo> {
    const snapshot = await this.client.getSession(sessionId);
    const existing = this.sessions.get(sessionId);
    if (!existing) {
      throw createRuntimeFailure({
        actor: "provider",
        category: "validation",
        message: `Session ${sessionId} is not tracked locally.`,
        retryable: false,
        scope: "session",
      });
    }

    const next = toSessionInfo(existing, snapshot, existing);
    const resolved =
      existing.state === "closed"
        ? {
            ...next,
            activeTurnId: undefined,
            state: "closed" as const,
          }
        : next;
    this.sessions.set(sessionId, resolved);
    return resolved;
  }

  async health(): Promise<ProviderHealth> {
    const sessions = await this.client.listSessions();
    return {
      activeSessions: sessions.filter((session) => session.status !== "idle").length,
      available: true,
      backend: "omnigent-http",
      notes: [
        "logical close remains provider-emulated",
        "child-session creation stays blocked on the public transport surface",
        "public harness override stays blocked",
      ],
      runtime: "omnigent",
      sessionStateDrift: [],
    };
  }

  private refreshTrackedSession(
    sessionId: string,
    snapshot: OmnigentSessionSnapshot,
  ): void {
    const existing = this.sessions.get(sessionId);
    if (existing) {
      this.sessions.set(sessionId, toSessionInfo(existing, snapshot, existing));
    }
  }

  private setActiveTurn(
    sessionId: string,
    turnId: string,
    updatedAt: string,
  ): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      this.sessions.set(sessionId, {
        ...session,
        activeTurnId: turnId,
        state: "turn_active",
        updatedAt,
      });
    }
  }

  private clearActiveTurn(sessionId: string, updatedAt: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      this.sessions.set(sessionId, {
        ...session,
        activeTurnId: undefined,
        state: "idle",
        updatedAt,
      });
    }
  }

  private failActiveTurn(
    sessionId: string,
    updatedAt: string,
    lastError?: RuntimeFailure,
  ): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      this.sessions.set(sessionId, {
        ...session,
        activeTurnId: undefined,
        lastError: lastError ?? session.lastError,
        state: "failed",
        updatedAt,
      });
    }
  }
}

function isPolicyDenied(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "category" in value &&
    value.category === "policy_denied"
  );
}

export function createHttpProvider(
  options: OmnigentHttpClientOptions,
): AgentRuntimeProvider {
  return new OmnigentHttpProvider(options);
}
