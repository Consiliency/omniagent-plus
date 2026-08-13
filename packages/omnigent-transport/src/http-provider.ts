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
  OmnigentOpenStream,
  OmnigentRawEvent,
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

type MutableTurnHandle = {
  -readonly [Key in keyof TurnHandle]: TurnHandle[Key];
};

export class OmnigentHttpProvider implements AgentRuntimeProvider {
  private readonly client: OmnigentHttpClient;
  private readonly creates = new Map<string, Promise<AgentSession>>();
  private readonly latestTurnIds = new Map<string, string>();
  private readonly openStreams = new Map<string, Set<OmnigentOpenStream>>();
  private readonly nativePendingTurnKeys = new Set<string>();
  private readonly pendingItemTurnIds = new Map<string, string>();
  private readonly provisionalTurnOrder = new Map<string, string[]>();
  private readonly provisionalTurnAliases = new Map<string, string>();
  private readonly provisionalTurnKeys = new Set<string>();
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
    const now = new Date().toISOString();
    const turnId = `omnigent:${request.sessionId}:${request.idempotencyKey}`;
    const handle: TurnHandle = {
      createdAt: now,
      idempotencyKey: request.idempotencyKey,
      sessionId: request.sessionId,
      state: "queued",
      turnId,
      updatedAt: now,
    };
    const previousLatestTurnId = this.latestTurnIds.get(request.sessionId);
    const previousSession = this.sessions.get(request.sessionId);
    this.turns.set(`${handle.sessionId}:${handle.turnId}`, handle);
    this.provisionalTurnKeys.add(`${handle.sessionId}:${handle.turnId}`);
    const provisionalOrder = this.provisionalTurnOrder.get(handle.sessionId) ?? [];
    provisionalOrder.push(handle.turnId);
    this.provisionalTurnOrder.set(handle.sessionId, provisionalOrder);
    this.latestTurnIds.set(handle.sessionId, handle.turnId);
    if (previousSession) {
      this.sessions.set(request.sessionId, {
        ...previousSession,
        activeTurnId: turnId,
        state: "turn_active",
        updatedAt: now,
      });
    }
    for (const stream of this.openStreams.get(request.sessionId) ?? []) {
      stream.setFallbackTurnId(turnId);
    }

    try {
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
      const acknowledgedTurnId = ack.item_id ?? ack.pending_id;
      if (handle.turnId === turnId && acknowledgedTurnId) {
        this.replaceProvisionalTurnId(
          request.sessionId,
          turnId,
          acknowledgedTurnId,
        );
      }
      if (ack.pending_id && handle.turnId === ack.pending_id) {
        this.nativePendingTurnKeys.add(
          `${handle.sessionId}:${ack.pending_id}`,
        );
      }
      return handle;
    } catch (error) {
      if (handle.turnId === turnId) {
        this.rollbackProvisionalTurn(
          request.sessionId,
          turnId,
          previousLatestTurnId,
          previousSession,
        );
      }
      throw error;
    }
  }

  async readHistory(
    sessionId: string,
    options?: HistoryOptions,
  ): Promise<SessionHistory> {
    const items = await this.client.getHistory(sessionId);
    this.reconcileTurnsFromHistory(sessionId, items);
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

  streamEvents(
    sessionId: string,
    options?: StreamOptions,
  ): AsyncIterable<RuntimeEvent> {
    const controller = new AbortController();
    const iterator = this.streamEventsUntilCancelled(
      sessionId,
      options,
      controller.signal,
    )[Symbol.asyncIterator]();
    const wrapped: AsyncIterableIterator<RuntimeEvent> = {
      [Symbol.asyncIterator]: () => wrapped,
      next: () => iterator.next(),
      return: async () => {
        controller.abort();
        return iterator.return
          ? iterator.return()
          : { done: true, value: undefined };
      },
      throw: async (error?: unknown) => {
        controller.abort();
        if (iterator.throw) {
          return iterator.throw(error);
        }
        throw error;
      },
    };
    return wrapped;
  }

  private async *streamEventsUntilCancelled(
    sessionId: string,
    options: StreamOptions | undefined,
    signal: AbortSignal,
  ): AsyncIterable<RuntimeEvent> {
    const stream = await this.client.openSessionStream(
      sessionId,
      undefined,
      signal,
    );
    this.addOpenStream(sessionId, stream);
    try {
      const snapshot = await this.client.getSession(sessionId);
      const activeTurnId = this.sessions.get(sessionId)?.activeTurnId;
      const provisionalTurnIds = [
        ...(this.provisionalTurnOrder.get(sessionId) ?? []),
      ];
      for (const turnId of provisionalTurnIds) {
        stream.setFallbackTurnId(turnId);
      }
      const items = await this.client.getHistory(sessionId);
      this.reconcileTurnsFromHistory(sessionId, items, stream);
      this.reconcilePendingTurnsFromSnapshot(sessionId, snapshot, items, stream);
      const unresolvedTurnIds = this.provisionalTurnOrder.get(sessionId) ?? [];
      const soleUnresolvedTurnId =
        unresolvedTurnIds.length === 1 ? unresolvedTurnIds[0] : undefined;
      const snapshotResponseAlreadyResolved = Boolean(
        snapshot.activeResponseId &&
          this.turns.has(`${sessionId}:${snapshot.activeResponseId}`),
      );
      if (
        snapshot.activeResponseId &&
        soleUnresolvedTurnId &&
        !snapshotResponseAlreadyResolved
      ) {
        stream.bindResponseId(snapshot.activeResponseId, soleUnresolvedTurnId);
        this.reconcileTurn(
          sessionId,
          soleUnresolvedTurnId,
          snapshot.activeResponseId,
          snapshot.updatedAt,
        );
      }
      if (snapshot.activeResponseId && snapshotResponseAlreadyResolved) {
        stream.bindResponseId(
          snapshot.activeResponseId,
          snapshot.activeResponseId,
        );
      }
      stream.setActiveResponseId(
        snapshot.activeResponseId ??
          (provisionalTurnIds.length === 0 ? activeTurnId : undefined),
      );
      const mappedSnapshot = mapOmnigentConversationHistory(sessionId, items, {
        afterSequence: options?.afterSequence,
      });

      this.refreshTrackedSession(
        sessionId,
        snapshot,
        Boolean(snapshot.activeResponseId) &&
          (unresolvedTurnIds.length > 1 || snapshotResponseAlreadyResolved),
      );
      for (const event of mappedSnapshot.history.events) {
        yield event;
      }

      const startingSequence =
        Math.max(
          mappedSnapshot.runtimeEvents.at(-1)?.sequence ?? 0,
          options?.afterSequence ?? 0,
        ) + 1;
      const mapper = new OmnigentEventMapper(sessionId, {
        historicalTextByMessageId: mappedSnapshot.historicalTextByMessageId,
        historicalTextByTurnId: mappedSnapshot.historicalTextByTurnId,
        historicalToolCallIds: mappedSnapshot.historicalToolCallIds,
        historicalToolResultIds: mappedSnapshot.historicalToolResultIds,
        seenItemIds: mappedSnapshot.seenItemIds,
        startingSequence,
        startedTurnIds: mappedSnapshot.startedTurnIds,
        terminalTurnIds: mappedSnapshot.terminalTurnIds,
      });

      for await (const rawEvent of stream.events) {
        this.recordConsumedPendingItem(sessionId, rawEvent, items, stream);
        const events = mapper.map(rawEvent);
        const mappedFailure = events.find(
          (event): event is Extract<RuntimeEvent, { type: "runtime.turn.failed" }> =>
            event.type === "runtime.turn.failed",
        )?.payload.failure;
        if (
          rawEvent.turnAliasId &&
          rawEvent.turnId &&
          rawEvent.turnAliasConfirmed !== false
        ) {
          this.reconcileTurn(
            sessionId,
            rawEvent.turnAliasId,
            rawEvent.turnId,
            rawEvent.occurredAt,
          );
        }
        if (
          rawEvent.turnId &&
          rawEvent.turnAliasId === undefined &&
          this.sessions.get(sessionId)?.activeTurnId === undefined &&
          (rawEvent.type === "response.created" ||
            rawEvent.type === "turn.started")
        ) {
          this.latestTurnIds.set(sessionId, rawEvent.turnId);
        }
        const eventConcernsActiveTurn = this.eventConcernsActiveTurn(
          sessionId,
          rawEvent,
        );
        if (rawEvent.terminal) {
          if (rawEvent.turnId) {
            this.retireProvisionalTurnCandidate(sessionId, rawEvent.turnId);
          }
          if (eventConcernsActiveTurn && isFailureTerminal(rawEvent)) {
            this.failActiveTurn(
              sessionId,
              rawEvent.occurredAt,
              mappedFailure ?? failureFromRawEvent(rawEvent),
            );
          } else if (eventConcernsActiveTurn) {
            this.clearActiveTurn(sessionId, rawEvent.occurredAt);
          }
        } else if (rawEvent.turnId && eventConcernsActiveTurn) {
          this.setActiveTurn(sessionId, rawEvent.turnId, rawEvent.occurredAt);
        }
        for (const event of events) {
          yield event;
        }
      }
    } finally {
      this.removeOpenStream(sessionId, stream);
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
    const provisionalTurnIds = this.provisionalTurnOrder.get(sessionId) ?? [];
    const soleProvisionalTurnId =
      provisionalTurnIds.length === 1 ? provisionalTurnIds[0] : undefined;
    const snapshotResponseAlreadyResolved = Boolean(
      snapshot.activeResponseId &&
        this.turns.has(`${sessionId}:${snapshot.activeResponseId}`),
    );
    if (
      soleProvisionalTurnId &&
      snapshot.activeResponseId &&
      !snapshotResponseAlreadyResolved
    ) {
      this.reconcileTurn(
        sessionId,
        soleProvisionalTurnId,
        snapshot.activeResponseId,
        snapshot.updatedAt,
      );
    }

    const reconciled = this.sessions.get(sessionId) ?? existing;
    const next = toSessionInfo(reconciled, snapshot, reconciled);
    const resolved =
      existing.state === "closed"
        ? {
            ...next,
            activeTurnId: undefined,
            state: "closed" as const,
          }
        : snapshot.activeResponseId &&
            (provisionalTurnIds.length > 1 || snapshotResponseAlreadyResolved)
          ? {
              ...next,
              activeTurnId: existing.activeTurnId,
              state: existing.state,
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
    preserveActiveIdentity = false,
  ): void {
    const existing = this.sessions.get(sessionId);
    if (existing) {
      const next = toSessionInfo(existing, snapshot, existing);
      this.sessions.set(
        sessionId,
        preserveActiveIdentity
          ? {
              ...next,
              activeTurnId: existing.activeTurnId,
              state: existing.state,
            }
          : next,
      );
    }
  }

  private setActiveTurn(
    sessionId: string,
    turnId: string,
    updatedAt: string,
  ): void {
    this.latestTurnIds.set(sessionId, turnId);
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

  private replaceProvisionalTurnId(
    sessionId: string,
    previousTurnId: string,
    nextTurnId: string,
  ): void {
    const previousKey = `${sessionId}:${previousTurnId}`;
    if (!this.provisionalTurnKeys.has(previousKey)) {
      return;
    }
    const handle = this.turns.get(previousKey);
    if (handle) {
      this.turns.delete(previousKey);
      (handle as MutableTurnHandle).turnId = nextTurnId;
      this.turns.set(`${sessionId}:${nextTurnId}`, handle);
    }
    this.provisionalTurnKeys.delete(previousKey);
    this.provisionalTurnKeys.add(`${sessionId}:${nextTurnId}`);
    this.provisionalTurnAliases.set(previousKey, nextTurnId);
    const provisionalOrder = this.provisionalTurnOrder.get(sessionId);
    const index = provisionalOrder?.indexOf(previousTurnId) ?? -1;
    if (provisionalOrder && index >= 0) {
      provisionalOrder[index] = nextTurnId;
    }
    if (this.latestTurnIds.get(sessionId) === previousTurnId) {
      this.latestTurnIds.set(sessionId, nextTurnId);
    }
    const session = this.sessions.get(sessionId);
    if (session?.activeTurnId === previousTurnId) {
      this.sessions.set(sessionId, { ...session, activeTurnId: nextTurnId });
    }
    for (const stream of this.openStreams.get(sessionId) ?? []) {
      stream.replaceFallbackTurnId(previousTurnId, nextTurnId);
    }
  }

  private rollbackProvisionalTurn(
    sessionId: string,
    turnId: string,
    previousLatestTurnId: string | undefined,
    previousSession: AgentSessionInfo | undefined,
  ): void {
    const key = `${sessionId}:${turnId}`;
    if (!this.provisionalTurnKeys.has(key)) {
      return;
    }
    this.turns.delete(key);
    this.provisionalTurnKeys.delete(key);
    const provisionalOrder = this.provisionalTurnOrder.get(sessionId);
    const index = provisionalOrder?.indexOf(turnId) ?? -1;
    if (provisionalOrder && index >= 0) {
      provisionalOrder.splice(index, 1);
      if (provisionalOrder.length === 0) {
        this.provisionalTurnOrder.delete(sessionId);
      }
    }
    if (this.latestTurnIds.get(sessionId) === turnId) {
      if (previousLatestTurnId === undefined) {
        this.latestTurnIds.delete(sessionId);
      } else {
        this.latestTurnIds.set(sessionId, previousLatestTurnId);
      }
    }
    if (previousSession) {
      this.sessions.set(sessionId, previousSession);
    }
    for (const stream of this.openStreams.get(sessionId) ?? []) {
      stream.removeFallbackTurnId(turnId);
    }
  }

  private addOpenStream(sessionId: string, stream: OmnigentOpenStream): void {
    const streams = this.openStreams.get(sessionId) ?? new Set();
    streams.add(stream);
    this.openStreams.set(sessionId, streams);
  }

  private removeOpenStream(sessionId: string, stream: OmnigentOpenStream): void {
    const streams = this.openStreams.get(sessionId);
    streams?.delete(stream);
    if (streams?.size === 0) {
      this.openStreams.delete(sessionId);
    }
  }

  private eventConcernsActiveTurn(
    sessionId: string,
    event: OmnigentRawEvent,
  ): boolean {
    const activeTurnId =
      this.sessions.get(sessionId)?.activeTurnId ??
      this.latestTurnIds.get(sessionId);
    return (
      activeTurnId === undefined ||
      event.turnAliasId === activeTurnId ||
      event.turnId === activeTurnId
    );
  }

  private reconcileTurn(
    sessionId: string,
    provisionalTurnId: string,
    officialTurnId: string,
    updatedAt: string,
  ): void {
    const suppliedProvisionalKey = `${sessionId}:${provisionalTurnId}`;
    const currentProvisionalTurnId =
      this.provisionalTurnAliases.get(suppliedProvisionalKey) ?? provisionalTurnId;
    if (
      currentProvisionalTurnId === officialTurnId ||
      !this.provisionalTurnKeys.has(`${sessionId}:${currentProvisionalTurnId}`)
    ) {
      return;
    }

    const provisionalKey = `${sessionId}:${currentProvisionalTurnId}`;
    const handle = this.turns.get(provisionalKey);
    if (handle) {
      this.turns.delete(provisionalKey);
      const mutableHandle = handle as MutableTurnHandle;
      mutableHandle.turnId = officialTurnId;
      mutableHandle.updatedAt = updatedAt;
      this.turns.set(`${sessionId}:${officialTurnId}`, handle);
    }
    this.provisionalTurnKeys.delete(provisionalKey);
    this.nativePendingTurnKeys.delete(provisionalKey);
    this.provisionalTurnAliases.delete(suppliedProvisionalKey);
    for (const [aliasKey, aliasedTurnId] of this.provisionalTurnAliases) {
      if (
        aliasKey.startsWith(`${sessionId}:`) &&
        aliasedTurnId === currentProvisionalTurnId
      ) {
        this.provisionalTurnAliases.delete(aliasKey);
      }
    }
    const provisionalOrder = this.provisionalTurnOrder.get(sessionId);
    const provisionalIndex =
      provisionalOrder?.indexOf(currentProvisionalTurnId) ?? -1;
    if (provisionalOrder && provisionalIndex >= 0) {
      provisionalOrder.splice(provisionalIndex, 1);
      if (provisionalOrder.length === 0) {
        this.provisionalTurnOrder.delete(sessionId);
      }
    }
    if (this.latestTurnIds.get(sessionId) === currentProvisionalTurnId) {
      this.latestTurnIds.set(sessionId, officialTurnId);
    }
    const session = this.sessions.get(sessionId);
    if (session?.activeTurnId === currentProvisionalTurnId) {
      this.sessions.set(sessionId, {
        ...session,
        activeTurnId: officialTurnId,
        updatedAt,
      });
    }
  }

  private retireProvisionalTurnCandidate(
    sessionId: string,
    provisionalTurnId: string,
  ): void {
    if (!this.provisionalTurnKeys.has(`${sessionId}:${provisionalTurnId}`)) {
      return;
    }
    const provisionalOrder = this.provisionalTurnOrder.get(sessionId);
    const provisionalIndex = provisionalOrder?.indexOf(provisionalTurnId) ?? -1;
    if (provisionalOrder && provisionalIndex >= 0) {
      provisionalOrder.splice(provisionalIndex, 1);
      if (provisionalOrder.length === 0) {
        this.provisionalTurnOrder.delete(sessionId);
      }
    }
  }

  private reconcileTurnsFromHistory(
    sessionId: string,
    items: readonly {
      readonly created_at: number;
      readonly id: string;
      readonly response_id: string;
    }[],
    stream?: OmnigentOpenStream,
  ): void {
    for (const item of items) {
      const pendingTurnId = this.pendingItemTurnIds.get(`${sessionId}:${item.id}`);
      const provisionalTurnId = this.turns.has(`${sessionId}:${item.id}`)
        ? item.id
        : pendingTurnId;
      if (provisionalTurnId) {
        stream?.bindResponseId(item.response_id, provisionalTurnId);
        this.reconcileTurn(
          sessionId,
          provisionalTurnId,
          item.response_id,
          new Date(item.created_at * 1000).toISOString(),
        );
      }
    }
  }

  private recordConsumedPendingItem(
    sessionId: string,
    event: OmnigentRawEvent,
    items: readonly {
      readonly created_at: number;
      readonly id: string;
      readonly response_id: string;
    }[],
    stream: OmnigentOpenStream,
  ): void {
    if (
      event.type !== "session.input.consumed" ||
      !event.cleared_pending_id ||
      !event.consumed_item_id
    ) {
      return;
    }
    this.pendingItemTurnIds.set(
      `${sessionId}:${event.consumed_item_id}`,
      event.cleared_pending_id,
    );
    const item = items.find(({ id }) => id === event.consumed_item_id);
    if (item) {
      stream.bindResponseId(item.response_id, event.cleared_pending_id);
      this.reconcileTurn(
        sessionId,
        event.cleared_pending_id,
        item.response_id,
        new Date(item.created_at * 1000).toISOString(),
      );
    }
  }

  private reconcilePendingTurnsFromSnapshot(
    sessionId: string,
    snapshot: OmnigentSessionSnapshot,
    items: readonly {
      readonly created_at: number;
      readonly id: string;
      readonly response_id: string;
      readonly [key: string]: unknown;
    }[],
    stream?: OmnigentOpenStream,
  ): void {
    const stillPending = new Set(
      (snapshot.pendingInputs ?? []).map(({ pendingId }) => pendingId),
    );
    const consumedPending = [...(this.provisionalTurnOrder.get(sessionId) ?? [])]
      .filter(
        (pendingId) =>
          this.nativePendingTurnKeys.has(`${sessionId}:${pendingId}`) &&
          !stillPending.has(pendingId),
      );
    const candidates = items.filter(
      (item) =>
        item.type === "message" &&
        item.role === "user" &&
        !this.pendingItemTurnIds.has(`${sessionId}:${item.id}`),
    );
    if (candidates.length < consumedPending.length) {
      return;
    }
    const consumedItems = candidates.slice(-consumedPending.length);
    for (const [index, pendingId] of consumedPending.entries()) {
      const item = consumedItems[index]!;
      this.pendingItemTurnIds.set(`${sessionId}:${item.id}`, pendingId);
      stream?.bindResponseId(item.response_id, pendingId);
      this.reconcileTurn(
        sessionId,
        pendingId,
        item.response_id,
        new Date(item.created_at * 1000).toISOString(),
      );
    }
  }

  private clearActiveTurn(sessionId: string, updatedAt: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      this.sessions.set(sessionId, {
        ...session,
        activeTurnId: undefined,
        state: session.state === "failed" ? "failed" : "idle",
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

function isFailureTerminal(event: OmnigentRawEvent): boolean {
  if (!event.terminal) {
    return false;
  }
  if (
    event.type === "response.failed" ||
    event.type === "turn.failed" ||
    (event.type === "session.status" && event.status === "failed")
  ) {
    return true;
  }
  return (
    event.type === "response.incomplete" &&
    !event.reason?.includes("interrupt") &&
    !event.reason?.includes("timeout")
  );
}

function failureFromRawEvent(event: OmnigentRawEvent): RuntimeFailure {
  const category = event.failure?.category ?? "backend_unavailable";
  return createRuntimeFailure({
    actor: "omnigent",
    category,
    message:
      event.failure?.message ??
      event.reason ??
      "Omnigent reported a terminal failure.",
    resetAt: event.failure?.resetAt,
    retryAfterSeconds: event.failure?.retryAfterSeconds,
    retryable: category !== "backend_capability_missing",
    safeDiagnostics:
      event.failure?.statusCode === undefined
        ? undefined
        : { statusCode: event.failure.statusCode },
    scope: "turn",
  });
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
