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
  type SendTurnRequest,
  type SessionHistory,
  type StreamOptions,
  type TurnHandle,
} from "@omniagent-plus/core-contracts";

import { OmnigentEventMapper } from "./event-mapper.js";
import { mapOmnigentHistory } from "./history-mapper.js";
import { OmnigentHttpClient } from "./http-client.js";
import type {
  OmnigentHttpClientOptions,
  OmnigentSessionSnapshot,
} from "./types.js";

function mapSessionState(status: OmnigentSessionSnapshot["status"]): AgentSessionState {
  switch (status) {
    case "launching":
      return "starting";
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
  return {
    activeTurnId:
      snapshot.activeTurnId ??
      snapshot.activeResponseId ??
      snapshot.active_response_id ??
      undefined,
    correlationId: request.correlationId,
    createdAt: snapshot.createdAt,
    eventCursor: previous?.eventCursor ?? 0,
    handoffPacket: request.handoffPacket,
    id: snapshot.id,
    identityProfileId: request.identityProfileId,
    lastError: previous?.lastError,
    metadata: snapshot.metadata,
    repoRoot: request.repoRoot,
    rootSessionId: snapshot.id,
    runtime: "omnigent",
    state: mapSessionState(snapshot.status),
    targetHarness: request.targetHarness,
    targetProvider: request.targetProvider,
    title: snapshot.title,
    updatedAt: snapshot.updatedAt,
    worktree: request.worktree,
  };
}

export class OmnigentHttpProvider implements AgentRuntimeProvider {
  private readonly client: OmnigentHttpClient;
  private readonly sessions = new Map<string, AgentSessionInfo>();
  private readonly turns = new Map<string, TurnHandle>();

  constructor(options: OmnigentHttpClientOptions) {
    this.client = new OmnigentHttpClient(options);
  }

  async createSession(request: CreateSessionRequest): Promise<AgentSession> {
    const snapshot = await this.client.createSession(request);
    const session = toSessionInfo(request, snapshot);
    this.sessions.set(session.id, session);
    return session;
  }

  async sendTurn(request: SendTurnRequest): Promise<TurnHandle> {
    const ack = await this.client.sendTurn(request);
    const now = new Date().toISOString();
    const handle: TurnHandle = {
      createdAt: now,
      idempotencyKey: request.idempotencyKey,
      sessionId: request.sessionId,
      state: ack.queued ? "queued" : "running",
      turnId: ack.turnId,
      updatedAt: now,
    };
    this.turns.set(`${handle.sessionId}:${handle.turnId}`, handle);

    const session = this.sessions.get(request.sessionId);
    if (session) {
      this.sessions.set(request.sessionId, {
        ...session,
        activeTurnId: ack.turnId,
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
    const mapped = mapOmnigentHistory(sessionId, items, {
      afterSequence: options?.afterSequence,
    });

    return {
      events:
        options?.limit === undefined
          ? mapped.history.events
          : mapped.history.events.slice(0, options.limit),
      nextCursor: mapped.history.nextCursor,
      sessionId,
    };
  }

  async *streamEvents(
    sessionId: string,
    options?: StreamOptions,
  ): AsyncIterable<RuntimeEvent> {
    const stream = this.client.streamSession(sessionId);
    const snapshot = await this.client.getSession(sessionId);
    const mappedSnapshot = mapOmnigentHistory(sessionId, snapshot.items, {
      afterSequence: options?.afterSequence,
    });

    for (const event of mappedSnapshot.history.events) {
      yield event;
    }

    const startingSequence =
      (mappedSnapshot.runtimeEvents.at(-1)?.sequence ?? options?.afterSequence ?? 0) +
      1;
    const mapper = new OmnigentEventMapper(sessionId, {
      seenItemIds: mappedSnapshot.seenItemIds,
      startingSequence,
    });

    for await (const rawEvent of stream) {
      for (const event of mapper.map(rawEvent)) {
        yield event;
      }
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
}

export function createHttpProvider(
  options: OmnigentHttpClientOptions,
): AgentRuntimeProvider {
  return new OmnigentHttpProvider(options);
}
