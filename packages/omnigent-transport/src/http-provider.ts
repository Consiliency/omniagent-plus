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
import { OmnigentHttpClient, OmnigentNetworkError } from "./http-client.js";
import type {
  OmnigentEventAck,
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

type TextRuntimeEvent = Extract<RuntimeEvent, { type: "runtime.text.delta" }>;

interface DeliveredTextGroup {
  readonly messageId?: string;
  readonly occurredAt: string;
  readonly text: string;
}

interface RuntimeTextGroup extends DeliveredTextGroup {
  readonly events: TextRuntimeEvent[];
}

function messageItemId(event: OmnigentRawEvent): string | undefined {
  return event.item?.type === "message" && typeof event.item.id === "string"
    ? event.item.id
    : undefined;
}

function runtimeTextMessageId(event: TextRuntimeEvent): string | undefined {
  return event.eventId.match(/^(.*):text:\d+(?::continuation:\d+)?$/)?.[1];
}

function groupTextEvents(
  events: readonly RuntimeEvent[],
  sourceMessageId?: string,
): Map<string, RuntimeTextGroup[]> {
  const groupsByTurnId = new Map<string, Map<string, RuntimeTextGroup>>();
  for (const event of events) {
    if (event.type !== "runtime.text.delta" || !event.turnId) {
      continue;
    }
    const messageId = sourceMessageId ?? runtimeTextMessageId(event);
    const groupKey = messageId ?? "__identity_free__";
    const groups = groupsByTurnId.get(event.turnId) ?? new Map();
    const existing = groups.get(groupKey);
    groups.set(groupKey, {
      events: [...(existing?.events ?? []), event],
      messageId,
      occurredAt: existing?.occurredAt ?? event.occurredAt,
      text: `${existing?.text ?? ""}${event.payload.delta}`,
    });
    groupsByTurnId.set(event.turnId, groups);
  }
  return new Map(
    [...groupsByTurnId].map(([turnId, groups]) => [
      turnId,
      [...groups.values()],
    ]),
  );
}

function textGroupsCompatible(
  current: RuntimeTextGroup,
  delivered: DeliveredTextGroup,
): boolean {
  return (
    current.text.startsWith(delivered.text) ||
    delivered.text.startsWith(current.text)
  );
}

function matchDeliveredTextGroups(
  currentGroups: readonly RuntimeTextGroup[],
  deliveredGroups: readonly DeliveredTextGroup[],
): Map<RuntimeTextGroup, DeliveredTextGroup> {
  const matched = new Map<RuntimeTextGroup, DeliveredTextGroup>();
  const remainingCurrent = new Set(currentGroups);
  const remainingDelivered = new Set(deliveredGroups);
  const match = (
    predicate: (
      current: RuntimeTextGroup,
      delivered: DeliveredTextGroup,
    ) => boolean,
  ): void => {
    for (const current of remainingCurrent) {
      const delivered = [...remainingDelivered].find((candidate) =>
        predicate(current, candidate),
      );
      if (delivered) {
        matched.set(current, delivered);
        remainingCurrent.delete(current);
        remainingDelivered.delete(delivered);
      }
    }
  };

  match(
    (current, delivered) =>
      current.messageId !== undefined &&
      current.messageId === delivered.messageId,
  );
  match(
    (current, delivered) =>
      current.occurredAt === delivered.occurredAt &&
      textGroupsCompatible(current, delivered),
  );
  match((current, delivered) => current.text === delivered.text);
  match(textGroupsCompatible);
  return matched;
}

function runtimeEventSequenceKey(event: RuntimeEvent): string {
  switch (event.type) {
    case "runtime.turn.started":
      return `turn:${event.turnId}:started`;
    case "runtime.turn.completed":
    case "runtime.turn.failed":
    case "runtime.turn.cancelled":
    case "runtime.turn.timed_out":
      return `turn:${event.turnId}:${event.type}`;
    case "runtime.text.delta":
      return `text:${event.eventId.replace(/:text:(\d+)$/, ":$1")}`;
    case "runtime.tool.call":
      return `tool-call:${event.payload.toolCall.toolCallId}`;
    case "runtime.tool.result":
      return `tool-result:${event.payload.toolCallId}`;
    default:
      return `${event.type}:${event.eventId}`;
  }
}

function assertControlEventAccepted(ack: OmnigentEventAck): void {
  if ("denied" in ack && ack.denied) {
    throw createRuntimeFailure({
      actor: "policy",
      category: "policy_denied",
      message: ack.reason,
      retryable: false,
      scope: "turn",
    });
  }
  if (ack.queued !== false) {
    throw createRuntimeFailure({
      actor: "provider",
      category: "malformed_response",
      message: "Omnigent control acknowledgement must be handled synchronously.",
      retryable: false,
      scope: "turn",
    });
  }
}

function isNonRetryableRuntimeFailure(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "schema" in value &&
    value.schema === "runtime_failure.v0.1" &&
    "retryable" in value &&
    value.retryable === false
  );
}

function isSendAdmissionFailure(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "category" in value &&
    (value.category === "state_conflict" ||
      value.category === "concurrency_limit")
  );
}

export class OmnigentHttpProvider implements AgentRuntimeProvider {
  private readonly allowQueuedTurns: boolean;
  private readonly client: OmnigentHttpClient;
  private readonly cancellationReservations = new Map<string, string>();
  private readonly cancelledTurnAwaitingIdentityKeys = new Set<string>();
  private readonly cancelledTurnQuarantineKeys = new Set<string>();
  private readonly claimedHistoryItemKeys = new Set<string>();
  private readonly creates = new Map<string, Promise<AgentSession>>();
  private readonly deliveredTextEventsByTurnIds = new Map<
    string,
    Map<
      string,
      {
        readonly delta: string;
        readonly messageId?: string;
        readonly occurredAt: string;
        readonly sequence: number;
      }
    >
  >();
  private readonly earlyCancellationProofKeys = new Set<string>();
  private readonly eventSequences = new Map<string, Map<string, number>>();
  private readonly latestTurnIds = new Map<string, string>();
  private readonly latestFailureTurnIds = new Map<string, string>();
  private readonly nextEventSequences = new Map<string, number>();
  private readonly observedHistoryItemKeys = new Set<string>();
  private readonly officialResponseTurnKeys = new Set<string>();
  private readonly openStreams = new Map<string, Set<OmnigentOpenStream>>();
  private readonly nativePendingTurnKeys = new Set<string>();
  private readonly pendingItemTurnIds = new Map<string, string>();
  private readonly provisionalTurnOrder = new Map<string, string[]>();
  private readonly provisionalTurnAliases = new Map<string, string>();
  private readonly provisionalTurnKeys = new Set<string>();
  private readonly queuedOnlyTurnKeys = new Set<string>();
  private readonly rejectedTurnKeys = new Set<string>();
  private readonly sends = new Map<string, Promise<TurnHandle>>();
  private readonly sessions = new Map<string, AgentSessionInfo>();
  private readonly turns = new Map<string, TurnHandle>();
  private readonly withExclusiveSessionLease?: OmnigentHttpClientOptions["withExclusiveSessionLease"];

  constructor(options: OmnigentHttpClientOptions) {
    this.allowQueuedTurns = options.allowQueuedTurns ?? false;
    this.client = new OmnigentHttpClient(options);
    this.withExclusiveSessionLease = options.withExclusiveSessionLease;
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
    const pending = this.runSessionMutation(request.sessionId, () =>
      this.sendTurnWithExclusiveLease(request),
    );
    this.sends.set(key, pending);
    try {
      return await pending;
    } catch (error) {
      if (
        !isNonRetryableRuntimeFailure(error) ||
        isSendAdmissionFailure(error)
      ) {
        this.sends.delete(key);
      }
      throw error;
    }
  }

  private async sendTurnWithExclusiveLease(
    request: SendTurnRequest,
  ): Promise<TurnHandle> {
    if (this.cancellationReservations.has(request.sessionId)) {
      throw createRuntimeFailure({
        actor: "provider",
        category: "state_conflict",
        message: `Session ${request.sessionId} has a cancellation in progress.`,
        retryable: false,
        scope: "turn",
      });
    }
    if (this.hasCancelledTurnQuarantine(request.sessionId)) {
      throw createRuntimeFailure({
        actor: "provider",
        category: "state_conflict",
        message: `Session ${request.sessionId} is awaiting cancellation reconciliation.`,
        retryable: false,
        scope: "turn",
      });
    }
    const session = this.sessions.get(request.sessionId);
    if (session?.state === "closed") {
      throw createRuntimeFailure({
        actor: "provider",
        category: "state_conflict",
        message: `Session ${request.sessionId} is closed.`,
        retryable: false,
        scope: "session",
      });
    }
    if (
      !this.allowQueuedTurns &&
      session?.state === "turn_active"
    ) {
      throw createRuntimeFailure({
        actor: "provider",
        category: "concurrency_limit",
        message: session.activeTurnId
          ? `Session ${request.sessionId} already has active turn ${session.activeTurnId}.`
          : `Session ${request.sessionId} already has active work.`,
        retryable: true,
        scope: "turn",
      });
    }
    if (this.withExclusiveSessionLease && !this.allowQueuedTurns) {
      const snapshot = await this.client.getSession(request.sessionId);
      if (
        snapshot.activeResponseId ||
        (snapshot.pendingInputs?.length ?? 0) > 0
      ) {
        throw createRuntimeFailure({
          actor: "provider",
          category: "concurrency_limit",
          message: `Session ${request.sessionId} already has upstream active or pending work.`,
          retryable: true,
          scope: "turn",
        });
      }
    }

    return this.sendTurnOnce(request);
  }

  private async createSessionOnce(
    request: CreateSessionRequest,
  ): Promise<AgentSession> {
    const snapshot = await this.client.createSession(request);
    for (const item of snapshot.items ?? []) {
      this.observedHistoryItemKeys.add(`${snapshot.id}:${item.id}`);
    }
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
    this.rejectedTurnKeys.delete(`${request.sessionId}:${turnId}`);
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
      if (ack.item_id) {
        this.claimedHistoryItemKeys.add(
          `${request.sessionId}:${ack.item_id}`,
        );
      }
      if (handle.turnId === turnId && acknowledgedTurnId) {
        this.replaceProvisionalTurnId(
          request.sessionId,
          turnId,
          acknowledgedTurnId,
          ack.pending_id !== undefined,
        );
      }
      if (ack.pending_id) {
        for (const stream of this.openStreams.get(request.sessionId) ?? []) {
          stream.removeFallbackTurnId(ack.pending_id);
        }
        if (handle.turnId === ack.pending_id) {
          this.nativePendingTurnKeys.add(
            `${handle.sessionId}:${ack.pending_id}`,
          );
        }
      } else if (!ack.item_id && handle.turnId === turnId) {
        const order = this.provisionalTurnOrder.get(handle.sessionId) ?? [];
        if (!order.includes(turnId)) {
          order.push(turnId);
          this.provisionalTurnOrder.set(handle.sessionId, order);
        }
        this.queuedOnlyTurnKeys.add(`${handle.sessionId}:${turnId}`);
      }
      return handle;
    } catch (error) {
      if (isPolicyDenied(error) || !(error instanceof OmnigentNetworkError)) {
        this.rejectTurnIdentities(request.sessionId, turnId, handle.turnId);
        this.rollbackTurnRegistration(
          request.sessionId,
          turnId,
          handle.turnId,
          previousLatestTurnId,
          previousSession,
        );
        throw error;
      }
      if (handle.turnId !== turnId) {
        return handle;
      }
      this.rollbackTurnRegistration(
        request.sessionId,
        turnId,
        handle.turnId,
        previousLatestTurnId,
        previousSession,
      );
      throw error;
    }
  }

  async readHistory(
    sessionId: string,
    options?: HistoryOptions,
  ): Promise<SessionHistory> {
    const items = await this.client.getHistory(sessionId);
    const snapshot = await this.client.getSession(sessionId);
    this.reconcileTurnsFromHistory(sessionId, items);
    this.reconcilePendingTurnsFromSnapshot(sessionId, snapshot, items);
    const mapped = mapOmnigentConversationHistory(sessionId, items);
    this.refreshTrackedSession(
      sessionId,
      snapshot,
      this.shouldPreserveActiveIdentity(sessionId, snapshot),
    );
    this.applyMappedHistoryState(sessionId, mapped.runtimeEvents);
    const replayEvents =
      options?.afterSequence === undefined
        ? mapped.runtimeEvents
        : this.trimDeliveredHistoryText(
            sessionId,
            mapped.runtimeEvents,
            options.afterSequence,
          );
    const mappedEvents = this.resequenceRuntimeEvents(
      sessionId,
      replayEvents,
    ).filter((event) => event.sequence > (options?.afterSequence ?? 0));

    const events =
      options?.limit === undefined
        ? mappedEvents
        : mappedEvents.slice(0, options.limit);
    this.recordDeliveredText(sessionId, events);

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
      const activeTurnId = this.sessions.get(sessionId)?.activeTurnId;
      const provisionalTurnIds = [
        ...(this.provisionalTurnOrder.get(sessionId) ?? []),
      ];
      const rejectedKeyPrefix = `${sessionId}:`;
      for (const rejectedKey of this.rejectedTurnKeys) {
        if (rejectedKey.startsWith(rejectedKeyPrefix)) {
          const rejectedTurnId = rejectedKey.slice(rejectedKeyPrefix.length);
          if (this.cancelledTurnQuarantineKeys.has(rejectedKey)) {
            stream.quarantineFallbackTurnId(rejectedTurnId);
          } else {
            stream.rejectTurnId(rejectedTurnId);
          }
        }
      }
      for (const turnId of provisionalTurnIds) {
        stream.setFallbackTurnId(turnId);
      }
      const items = await this.client.getHistory(sessionId);
      const snapshot = await this.client.getSession(sessionId);
      this.reconcileTurnsFromHistory(sessionId, items, stream);
      this.reconcilePendingTurnsFromSnapshot(sessionId, snapshot, items, stream);
      const unresolvedTurnIds = this.provisionalTurnOrder.get(sessionId) ?? [];
      const soleUnresolvedTurnId =
        unresolvedTurnIds.length === 1 ? unresolvedTurnIds[0] : undefined;
      const soleUnresolvedTurnStillPending =
        soleUnresolvedTurnId !== undefined &&
        ((snapshot.pendingInputs ?? []).some(
          ({ pendingId }) => pendingId === soleUnresolvedTurnId,
        ) ||
          (this.queuedOnlyTurnKeys.has(`${sessionId}:${soleUnresolvedTurnId}`) &&
            (snapshot.pendingInputs?.length ?? 0) > 0));
      for (const { pendingId } of snapshot.pendingInputs ?? []) {
        if (
          !this.cancelledTurnQuarantineKeys.has(`${sessionId}:${pendingId}`)
        ) {
          stream.removeFallbackTurnId(pendingId);
        }
      }
      if (
        soleUnresolvedTurnId &&
        soleUnresolvedTurnStillPending &&
        !this.cancelledTurnQuarantineKeys.has(
          `${sessionId}:${soleUnresolvedTurnId}`,
        )
      ) {
        stream.removeFallbackTurnId(soleUnresolvedTurnId);
      }
      if (
        snapshot.activeResponseId &&
        this.turns.has(`${sessionId}:${snapshot.activeResponseId}`)
      ) {
        stream.bindResponseId(
          snapshot.activeResponseId,
          snapshot.activeResponseId,
        );
      }
      stream.setActiveResponseId(
        snapshot.activeResponseId ??
          (provisionalTurnIds.length === 0 ? activeTurnId : undefined),
      );
      const mappedSnapshot = mapOmnigentConversationHistory(sessionId, items);
      const replayEvents =
        options?.afterSequence === undefined
          ? mappedSnapshot.runtimeEvents
          : this.trimDeliveredHistoryText(
              sessionId,
              mappedSnapshot.runtimeEvents,
              options.afterSequence,
            );
      const mappedHistoryEvents = this.resequenceRuntimeEvents(
        sessionId,
        replayEvents,
      );

      this.refreshTrackedSession(
        sessionId,
        snapshot,
        this.shouldPreserveActiveIdentity(sessionId, snapshot),
      );
      this.applyMappedHistoryState(sessionId, mappedSnapshot.runtimeEvents);
      for (const event of mappedHistoryEvents) {
        if (event.sequence > (options?.afterSequence ?? 0)) {
          this.recordDeliveredText(sessionId, [event]);
          yield event;
        }
      }

      const startingSequence =
        Math.max(
          (this.nextEventSequences.get(sessionId) ?? 1) - 1,
          options?.afterSequence ?? 0,
        ) + 1;
      const mapper = new OmnigentEventMapper(sessionId, {
        historicalMessagesByTurnId:
          mappedSnapshot.historicalMessagesByTurnId,
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
        this.consumeCancelledTurnQuarantine(sessionId, rawEvent);
        if (this.eventIsRejected(sessionId, rawEvent)) {
          continue;
        }
        const mappedEvents = mapper.map(rawEvent);
        const replayEvents =
          options?.afterSequence === undefined
            ? mappedEvents
            : this.trimDeliveredHistoryText(
                sessionId,
                mappedEvents,
                options.afterSequence,
                rawEvent.message_id ?? messageItemId(rawEvent),
              );
        const events = this.resequenceRuntimeEvents(
          sessionId,
          replayEvents,
          options?.afterSequence,
        ).filter(
          (event) => event.sequence > (options?.afterSequence ?? 0),
        );
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
          rawEvent.terminal ||
          events.length > 0 ||
          !stateMutationRequiresRuntimeEvent(rawEvent)
        ) {
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
                rawEvent.turnId,
              );
            } else if (eventConcernsActiveTurn) {
              this.clearActiveTurn(
                sessionId,
                rawEvent.occurredAt,
                rawEvent.turnId,
              );
            }
          } else if (rawEvent.turnId && eventConcernsActiveTurn) {
            this.setActiveTurn(sessionId, rawEvent.turnId, rawEvent.occurredAt);
          }
        }
        for (const event of events) {
          this.recordDeliveredText(
            sessionId,
            [event],
            rawEvent.message_id ?? messageItemId(rawEvent),
          );
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
    if (!this.withExclusiveSessionLease) {
      throw createRuntimeFailure({
        actor: "provider",
        category: "backend_capability_missing",
        message:
          "Omnigent cancellation requires an exclusive session lease because interrupt is session-scoped.",
        retryable: false,
        scope: "turn",
      });
    }
    return this.withExclusiveSessionLease(handle.sessionId, () =>
      this.cancelTurnWithExclusiveLease(handle, reason),
    );
  }

  private async cancelTurnWithExclusiveLease(
    handle: TurnHandle,
    reason: CancellationReason,
  ): Promise<TurnHandle> {
    if (this.cancellationReservations.has(handle.sessionId)) {
      throw createRuntimeFailure({
        actor: "provider",
        category: "state_conflict",
        message: `Session ${handle.sessionId} already has a cancellation in progress.`,
        retryable: false,
        scope: "turn",
      });
    }
    const activeTurnId = this.sessions.get(handle.sessionId)?.activeTurnId;
    if (activeTurnId !== handle.turnId) {
      throw createRuntimeFailure({
        actor: "provider",
        category: "state_conflict",
        message: `Turn ${handle.turnId} is not the active turn for session ${handle.sessionId}.`,
        retryable: false,
        scope: "turn",
      });
    }
    const turnKey = `${handle.sessionId}:${handle.turnId}`;
    this.cancellationReservations.set(handle.sessionId, handle.turnId);
    try {
      const snapshot = await this.client.getSession(handle.sessionId);
      if (
        snapshot.activeResponseId &&
        snapshot.activeResponseId !== handle.turnId
      ) {
        throw createRuntimeFailure({
          actor: "provider",
          category: "state_conflict",
          message: `Turn ${handle.turnId} is not the upstream active response for session ${handle.sessionId}.`,
          retryable: false,
          scope: "turn",
        });
      }
      const snapshotOwnsHandle =
        snapshot.activeResponseId === handle.turnId ||
        (snapshot.pendingInputs ?? []).some(
          ({ pendingId }) => pendingId === handle.turnId,
        );
      if (!snapshotOwnsHandle) {
        throw createRuntimeFailure({
          actor: "provider",
          category: "state_conflict",
          message: `Session ${handle.sessionId} does not positively attribute interrupt authority to turn ${handle.turnId}.`,
          retryable: false,
          scope: "turn",
        });
      }
      if (this.sessions.get(handle.sessionId)?.activeTurnId !== handle.turnId) {
        throw createRuntimeFailure({
          actor: "provider",
          category: "state_conflict",
          message: `Turn ${handle.turnId} stopped owning session ${handle.sessionId} before cancellation.`,
          retryable: false,
          scope: "turn",
        });
      }
      const ack = await this.client.sendEvent(handle.sessionId, {
        data: { reason },
        type: "interrupt",
      });
      assertControlEventAccepted(ack);
      const cancelled: TurnHandle = {
        ...handle,
        state: "cancelled",
        updatedAt: new Date().toISOString(),
      };
      this.turns.set(`${handle.sessionId}:${handle.turnId}`, cancelled);
      this.sends.set(
        `${handle.sessionId}:${handle.idempotencyKey}`,
        Promise.resolve(cancelled),
      );
      this.retireCancelledTurn(
        handle.sessionId,
        handle.turnId,
        this.earlyCancellationProofKeys.has(turnKey),
      );
      const session = this.sessions.get(handle.sessionId);
      if (session?.activeTurnId === handle.turnId) {
        this.sessions.set(handle.sessionId, {
          ...session,
          activeTurnId: undefined,
          state: "idle",
          updatedAt: cancelled.updatedAt,
        });
      }
      return cancelled;
    } finally {
      this.cancellationReservations.delete(handle.sessionId);
      this.earlyCancellationProofKeys.delete(turnKey);
    }
  }

  async closeSession(sessionId: string): Promise<void> {
    if (!this.withExclusiveSessionLease) {
      throw createRuntimeFailure({
        actor: "provider",
        category: "backend_capability_missing",
        message:
          "Omnigent close requires an exclusive session lease because stop_session is session-scoped.",
        retryable: false,
        scope: "session",
      });
    }
    await this.withExclusiveSessionLease(sessionId, async () => {
      const ack = await this.client.sendEvent(sessionId, {
        data: {},
        type: "stop_session",
      });
      assertControlEventAccepted(ack);
      const session = this.sessions.get(sessionId);
      if (session) {
        this.sessions.set(sessionId, {
          ...session,
          activeTurnId: undefined,
          state: "closed",
          updatedAt: new Date().toISOString(),
        });
      }
    });
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
    const reconciled = this.sessions.get(sessionId) ?? existing;
    const next = toSessionInfo(reconciled, snapshot, reconciled);
    const resolved =
      existing.state === "closed"
        ? {
            ...next,
            activeTurnId: undefined,
            state: "closed" as const,
          }
        : this.shouldPreserveActiveIdentity(sessionId, snapshot)
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
        this.withExclusiveSessionLease
          ? "session-wide controls require the configured exclusive session lease"
          : "session-wide controls are blocked without an exclusive session lease",
        "child-session creation stays blocked on the public transport surface",
        "public harness override stays blocked",
      ],
      runtime: "omnigent",
      sessionStateDrift: [],
    };
  }

  private runSessionMutation<T>(
    sessionId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    return this.withExclusiveSessionLease
      ? this.withExclusiveSessionLease(sessionId, operation)
      : operation();
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
        existing.state === "closed"
          ? {
              ...next,
              activeTurnId: undefined,
              state: "closed",
            }
          : preserveActiveIdentity
          ? {
              ...next,
              activeTurnId: existing.activeTurnId,
              state: existing.state,
            }
          : next,
      );
    }
  }

  private shouldPreserveActiveIdentity(
    sessionId: string,
    snapshot: OmnigentSessionSnapshot,
  ): boolean {
    return (
      (this.provisionalTurnOrder.get(sessionId)?.length ?? 0) > 0 ||
      Boolean(
        snapshot.activeResponseId &&
          (this.turns.has(`${sessionId}:${snapshot.activeResponseId}`) ||
            this.rejectedTurnKeys.has(`${sessionId}:${snapshot.activeResponseId}`)),
      )
    );
  }

  private setActiveTurn(
    sessionId: string,
    turnId: string,
    updatedAt: string,
  ): void {
    this.latestTurnIds.set(sessionId, turnId);
    const session = this.sessions.get(sessionId);
    if (session && session.state !== "closed") {
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
    restoreOrder = false,
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
    } else if (restoreOrder) {
      const restoredOrder = provisionalOrder ?? [];
      restoredOrder.push(nextTurnId);
      this.provisionalTurnOrder.set(sessionId, restoredOrder);
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

  private resequenceRuntimeEvents(
    sessionId: string,
    events: readonly RuntimeEvent[],
    sequenceFloor = 0,
  ): RuntimeEvent[] {
    const sequences = this.eventSequences.get(sessionId) ?? new Map();
    let nextSequence = Math.max(
      this.nextEventSequences.get(sessionId) ?? 1,
      sequenceFloor + 1,
    );
    const resequenced = events.map((event) => {
      const key = runtimeEventSequenceKey(event);
      const existingSequence = sequences.get(key);
      const sequence = existingSequence ?? nextSequence;
      if (existingSequence === undefined) {
        sequences.set(key, sequence);
        nextSequence += 1;
      }
      return event.sequence === sequence
        ? event
        : ({ ...event, sequence } as RuntimeEvent);
    });
    this.eventSequences.set(sessionId, sequences);
    this.nextEventSequences.set(sessionId, nextSequence);
    return resequenced;
  }

  private trimDeliveredHistoryText(
    sessionId: string,
    events: readonly RuntimeEvent[],
    afterSequence: number,
    sourceMessageId?: string,
  ): RuntimeEvent[] {
    const textGroups = groupTextEvents(events, sourceMessageId);
    const remainingByEvent = new Map<RuntimeEvent, string>();
    for (const [turnId, groups] of textGroups) {
      const delivered = this.deliveredTextForCursor(
        `${sessionId}:${turnId}`,
        afterSequence,
      );
      for (const [group, deliveredGroup] of matchDeliveredTextGroups(
        groups,
        delivered,
      )) {
        let remaining = deliveredGroup.text;
        for (const event of group.events) {
          const delta = event.payload.delta;
          if (remaining.startsWith(delta)) {
            remainingByEvent.set(event, "");
            remaining = remaining.slice(delta.length);
          } else if (delta.startsWith(remaining)) {
            remainingByEvent.set(event, delta.slice(remaining.length));
            remaining = "";
          }
        }
      }
    }

    return events.flatMap((event) => {
      if (event.type !== "runtime.text.delta" || !event.turnId) {
        return [event];
      }
      const delta = remainingByEvent.get(event);
      if (delta === undefined) {
        return [event];
      }
      if (delta.length === 0) {
        return [];
      }
      return [
        {
          ...event,
          eventId: `${event.eventId}:continuation:${event.payload.delta.length - delta.length}`,
          payload: { delta },
        } as RuntimeEvent,
      ];
    });
  }

  private recordDeliveredText(
    sessionId: string,
    events: readonly RuntimeEvent[],
    sourceMessageId?: string,
  ): void {
    for (const event of events) {
      if (event.type === "runtime.text.delta" && event.turnId) {
        const eventKey = `${sessionId}:${runtimeEventSequenceKey(event)}`;
        const turnKey = `${sessionId}:${event.turnId}`;
        const delivered =
          this.deliveredTextEventsByTurnIds.get(turnKey) ?? new Map();
        if (delivered.has(eventKey)) {
          continue;
        }
        delivered.set(eventKey, {
          delta: event.payload.delta,
          messageId: sourceMessageId ?? runtimeTextMessageId(event),
          occurredAt: event.occurredAt,
          sequence: event.sequence,
        });
        this.deliveredTextEventsByTurnIds.set(turnKey, delivered);
      }
    }
  }

  private deliveredTextForCursor(
    turnKey: string,
    cursor: number,
  ): DeliveredTextGroup[] {
    const groups = new Map<string, DeliveredTextGroup>();
    for (const delivered of [
      ...(this.deliveredTextEventsByTurnIds.get(turnKey)?.values() ?? []),
    ]
      .filter(({ sequence }) => sequence <= cursor)
      .sort((left, right) => left.sequence - right.sequence)) {
      const key = delivered.messageId ?? "__identity_free__";
      const group = groups.get(key);
      groups.set(key, {
        messageId: delivered.messageId,
        occurredAt: group?.occurredAt ?? delivered.occurredAt,
        text: `${group?.text ?? ""}${delivered.delta}`,
      });
    }
    return [...groups.values()];
  }

  private rollbackTurnRegistration(
    sessionId: string,
    originalTurnId: string,
    currentTurnId: string,
    previousLatestTurnId: string | undefined,
    previousSession: AgentSessionInfo | undefined,
  ): void {
    const originalKey = `${sessionId}:${originalTurnId}`;
    const currentKey = `${sessionId}:${currentTurnId}`;
    this.turns.delete(originalKey);
    this.turns.delete(currentKey);
    this.provisionalTurnKeys.delete(originalKey);
    this.provisionalTurnKeys.delete(currentKey);
    this.nativePendingTurnKeys.delete(originalKey);
    this.nativePendingTurnKeys.delete(currentKey);
    this.queuedOnlyTurnKeys.delete(originalKey);
    this.queuedOnlyTurnKeys.delete(currentKey);
    this.provisionalTurnAliases.delete(originalKey);
    for (const [aliasKey, aliasedTurnId] of this.provisionalTurnAliases) {
      if (
        aliasKey.startsWith(`${sessionId}:`) &&
        aliasedTurnId === currentTurnId
      ) {
        this.provisionalTurnAliases.delete(aliasKey);
      }
    }
    const provisionalOrder = this.provisionalTurnOrder.get(sessionId);
    if (provisionalOrder) {
      const retained = provisionalOrder.filter(
        (turnId) => turnId !== originalTurnId && turnId !== currentTurnId,
      );
      provisionalOrder.splice(0, provisionalOrder.length, ...retained);
      if (provisionalOrder.length === 0) {
        this.provisionalTurnOrder.delete(sessionId);
      }
    }
    const session = this.sessions.get(sessionId);
    const activeTurnWasRemoved =
      session?.activeTurnId === originalTurnId ||
      session?.activeTurnId === currentTurnId;
    const currentLatestTurnId = this.latestTurnIds.get(sessionId);
    if (
      currentLatestTurnId === originalTurnId ||
      currentLatestTurnId === currentTurnId
    ) {
      const retainedLatestTurnId =
        session?.activeTurnId !== undefined &&
        !activeTurnWasRemoved &&
        this.turns.has(`${sessionId}:${session.activeTurnId}`)
          ? session.activeTurnId
          : previousLatestTurnId !== undefined &&
              this.turns.has(`${sessionId}:${previousLatestTurnId}`)
            ? previousLatestTurnId
            : provisionalOrder?.at(-1);
      if (retainedLatestTurnId === undefined) {
        this.latestTurnIds.delete(sessionId);
      } else {
        this.latestTurnIds.set(sessionId, retainedLatestTurnId);
      }
    }
    if (activeTurnWasRemoved && previousSession) {
      const restoredActiveTurnId =
        previousSession.activeTurnId !== undefined &&
        this.turns.has(`${sessionId}:${previousSession.activeTurnId}`)
          ? previousSession.activeTurnId
          : undefined;
      this.sessions.set(sessionId, {
        ...previousSession,
        activeTurnId: restoredActiveTurnId,
        state:
          restoredActiveTurnId !== undefined
            ? "turn_active"
            : previousSession.state === "failed"
              ? "failed"
              : "idle",
      });
    }
    for (const stream of this.openStreams.get(sessionId) ?? []) {
      stream.removeFallbackTurnId(originalTurnId);
      stream.removeFallbackTurnId(currentTurnId);
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

  private rejectTurnIdentities(
    sessionId: string,
    originalTurnId: string,
    currentTurnId: string,
  ): void {
    for (const turnId of new Set([originalTurnId, currentTurnId])) {
      this.rejectedTurnKeys.add(`${sessionId}:${turnId}`);
      for (const stream of this.openStreams.get(sessionId) ?? []) {
        stream.rejectTurnId(turnId);
      }
    }
  }

  private eventIsRejected(
    sessionId: string,
    event: OmnigentRawEvent,
  ): boolean {
    return [event.turnId, event.turnAliasId].some(
      (turnId) =>
        turnId !== undefined &&
        this.rejectedTurnKeys.has(`${sessionId}:${turnId}`),
    );
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
    this.officialResponseTurnKeys.add(`${sessionId}:${officialTurnId}`);
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
    this.queuedOnlyTurnKeys.delete(provisionalKey);
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

  private retireCancelledTurn(
    sessionId: string,
    turnId: string,
    cancellationProofObserved = false,
  ): void {
    const turnKey = `${sessionId}:${turnId}`;
    const hasOfficialResponseIdentity =
      this.officialResponseTurnKeys.has(turnKey);
    this.retireProvisionalTurnCandidate(sessionId, turnId);
    this.provisionalTurnKeys.delete(turnKey);
    this.nativePendingTurnKeys.delete(turnKey);
    this.queuedOnlyTurnKeys.delete(turnKey);
    if (!cancellationProofObserved) {
      this.cancelledTurnQuarantineKeys.add(turnKey);
      if (!hasOfficialResponseIdentity) {
        this.cancelledTurnAwaitingIdentityKeys.add(turnKey);
      }
    }
    this.rejectedTurnKeys.add(turnKey);
    this.provisionalTurnAliases.delete(turnKey);
    for (const [aliasKey, aliasedTurnId] of this.provisionalTurnAliases) {
      if (aliasKey.startsWith(`${sessionId}:`) && aliasedTurnId === turnId) {
        this.provisionalTurnAliases.delete(aliasKey);
      }
    }
    for (const [itemKey, pendingTurnId] of this.pendingItemTurnIds) {
      if (itemKey.startsWith(`${sessionId}:`) && pendingTurnId === turnId) {
        this.pendingItemTurnIds.delete(itemKey);
      }
    }
    if (this.latestTurnIds.get(sessionId) === turnId) {
      this.latestTurnIds.delete(sessionId);
    }
    for (const stream of this.openStreams.get(sessionId) ?? []) {
      if (cancellationProofObserved) {
        stream.rejectTurnId(turnId);
      } else {
        stream.quarantineFallbackTurnId(turnId);
      }
    }
  }

  private consumeCancelledTurnQuarantine(
    sessionId: string,
    event: OmnigentRawEvent,
  ): void {
    const keyPrefix = `${sessionId}:`;
    const reservedTurnId = this.cancellationReservations.get(sessionId);
    if (
      reservedTurnId &&
      (event.type === "session.interrupted" ||
        (isCancellationTerminal(event) &&
          [event.turnAliasId, event.turnId].includes(reservedTurnId)))
    ) {
      this.earlyCancellationProofKeys.add(`${sessionId}:${reservedTurnId}`);
    }
    let cancelledTurnId = [event.turnAliasId, event.turnId].find(
      (turnId) =>
        turnId !== undefined &&
        this.cancelledTurnQuarantineKeys.has(`${sessionId}:${turnId}`),
    );
    if (!cancelledTurnId && event.type === "session.interrupted") {
      const quarantines = [...this.cancelledTurnQuarantineKeys].filter((key) =>
        key.startsWith(keyPrefix),
      );
      if (quarantines.length === 1) {
        cancelledTurnId = quarantines[0]?.slice(keyPrefix.length);
      }
    }
    if (!cancelledTurnId) {
      return;
    }
    const cancelledTurnKey = `${sessionId}:${cancelledTurnId}`;
    const sessionInterruption = event.type === "session.interrupted";
    const confirmedOfficialIdentity =
      event.turnAliasConfirmed !== false &&
      event.turnAliasId === cancelledTurnId &&
      event.turnId !== undefined &&
      event.turnId !== cancelledTurnId;
    if (
      this.cancelledTurnAwaitingIdentityKeys.has(cancelledTurnKey) &&
      !sessionInterruption &&
      !confirmedOfficialIdentity
    ) {
      return;
    }
    if (confirmedOfficialIdentity && event.turnId) {
      this.officialResponseTurnKeys.add(`${sessionId}:${event.turnId}`);
    }
    this.cancelledTurnAwaitingIdentityKeys.delete(cancelledTurnKey);
    this.cancelledTurnQuarantineKeys.delete(cancelledTurnKey);
    for (const stream of this.openStreams.get(sessionId) ?? []) {
      stream.removeFallbackTurnId(cancelledTurnId);
    }
    if (event.turnId) {
      this.rejectedTurnKeys.add(`${sessionId}:${event.turnId}`);
      for (const stream of this.openStreams.get(sessionId) ?? []) {
        stream.rejectTurnId(event.turnId);
      }
    }
  }

  private hasCancelledTurnQuarantine(sessionId: string): boolean {
    const keyPrefix = `${sessionId}:`;
    return [...this.cancelledTurnQuarantineKeys].some((key) =>
      key.startsWith(keyPrefix),
    );
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
        this.claimedHistoryItemKeys.add(`${sessionId}:${item.id}`);
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
    } else {
      stream.setFallbackTurnId(event.cleared_pending_id);
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
          (this.nativePendingTurnKeys.has(`${sessionId}:${pendingId}`) &&
            !stillPending.has(pendingId)) ||
          (stillPending.size === 0 &&
            this.queuedOnlyTurnKeys.has(`${sessionId}:${pendingId}`)),
      );
    if (consumedPending.length === 0) {
      if ((this.provisionalTurnOrder.get(sessionId)?.length ?? 0) === 0) {
        for (const item of items) {
          this.observedHistoryItemKeys.add(`${sessionId}:${item.id}`);
        }
      }
      return;
    }
    const candidates = items.filter(
      (item) =>
        item.type === "message" &&
        item.role === "user" &&
        !this.claimedHistoryItemKeys.has(`${sessionId}:${item.id}`) &&
        !this.pendingItemTurnIds.has(`${sessionId}:${item.id}`) &&
        !this.observedHistoryItemKeys.has(`${sessionId}:${item.id}`),
    );
    if (candidates.length !== consumedPending.length) {
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
    if ((this.provisionalTurnOrder.get(sessionId)?.length ?? 0) === 0) {
      for (const item of items) {
        this.observedHistoryItemKeys.add(`${sessionId}:${item.id}`);
      }
    }
  }

  private applyMappedHistoryState(
    sessionId: string,
    events: readonly RuntimeEvent[],
  ): void {
    if (this.sessions.get(sessionId)?.state === "closed") {
      return;
    }
    let latestLifecycle: RuntimeEvent | undefined;
    for (let index = events.length - 1; index >= 0; index -= 1) {
      const event = events[index]!;
      if (
        event.turnId !== undefined &&
        (event.type === "runtime.turn.started" || event.terminal)
      ) {
        latestLifecycle = event;
        break;
      }
    }
    if (!latestLifecycle?.turnId) {
      return;
    }
    const activeTurnId = this.sessions.get(sessionId)?.activeTurnId;
    if (activeTurnId !== undefined && activeTurnId !== latestLifecycle.turnId) {
      return;
    }
    if (latestLifecycle.type === "runtime.turn.failed") {
      this.failActiveTurn(
        sessionId,
        latestLifecycle.occurredAt,
        latestLifecycle.payload.failure,
        latestLifecycle.turnId,
      );
    } else if (
      latestLifecycle.type === "runtime.turn.completed" ||
      latestLifecycle.type === "runtime.turn.cancelled"
    ) {
      const session = this.sessions.get(sessionId);
      if (session) {
        this.latestFailureTurnIds.delete(sessionId);
        this.sessions.set(sessionId, {
          ...session,
          activeTurnId: undefined,
          lastError: undefined,
          state: "idle",
          updatedAt: latestLifecycle.occurredAt,
        });
      }
    }
  }

  private clearActiveTurn(
    sessionId: string,
    updatedAt: string,
    turnId?: string,
  ): void {
    const session = this.sessions.get(sessionId);
    if (session && session.state !== "closed") {
      const preserveFailure =
        turnId !== undefined && this.latestFailureTurnIds.get(sessionId) === turnId;
      if (!preserveFailure) {
        this.latestFailureTurnIds.delete(sessionId);
      }
      this.sessions.set(sessionId, {
        ...session,
        activeTurnId: undefined,
        lastError: preserveFailure ? session.lastError : undefined,
        state: preserveFailure ? "failed" : "idle",
        updatedAt,
      });
    }
  }

  private failActiveTurn(
    sessionId: string,
    updatedAt: string,
    lastError?: RuntimeFailure,
    turnId?: string,
  ): void {
    const session = this.sessions.get(sessionId);
    if (session && session.state !== "closed") {
      if (turnId !== undefined) {
        this.latestFailureTurnIds.set(sessionId, turnId);
      }
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

function isCancellationTerminal(event: OmnigentRawEvent): boolean {
  return (
    event.type === "response.cancelled" ||
    event.type === "turn.cancelled" ||
    (event.type === "response.incomplete" &&
      event.reason?.includes("interrupt") === true)
  );
}

function stateMutationRequiresRuntimeEvent(event: OmnigentRawEvent): boolean {
  return (
    event.type === "response.created" ||
    event.type === "turn.started" ||
    event.type === "response.output_text.delta" ||
    event.type === "response.output_item.done" ||
    event.type === "response.completed" ||
    event.type === "turn.completed" ||
    event.type === "response.cancelled" ||
    event.type === "turn.cancelled" ||
    event.type === "response.incomplete" ||
    event.type === "response.failed" ||
    event.type === "turn.failed"
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
