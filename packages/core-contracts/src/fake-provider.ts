import {
  createRuntimeEvent,
  type RuntimeEvent,
  type RuntimeSessionClosedEvent,
} from "./events.js";
import { createRuntimeFailure } from "./errors.js";
import { FakeEventStream } from "./fake-event-stream.js";
import type { AgentRuntimeProvider } from "./provider.js";
import {
  applySessionTransition,
  applyTurnTransition,
  type AgentSessionState,
} from "./state-machines.js";
import {
  agentRuntimeProviderSchema,
  agentSessionInfoSchema,
  createSessionRequestSchema,
  sendTurnRequestSchema,
} from "./schemas.js";
import type {
  AgentSession,
  AgentSessionInfo,
  CancellationReason,
  CreateSessionRequest,
  HistoryOptions,
  ProviderHealth,
  SendTurnRequest,
  SessionHistory,
  StreamOptions,
  TurnHandle,
} from "./types.js";

interface FakeSessionRecord {
  session: MutableAgentSessionInfo;
  stream: FakeEventStream;
  turnsById: Map<string, MutableTurnHandle>;
  turnsByKey: Map<string, MutableTurnHandle>;
  createKey: string;
  closePromise?: Promise<void>;
}

type MutableAgentSessionInfo = {
  -readonly [Key in keyof AgentSessionInfo]: AgentSessionInfo[Key];
};

type MutableTurnHandle = {
  -readonly [Key in keyof TurnHandle]: TurnHandle[Key];
};

const NORMAL_TERMINAL_FIXTURE = [
  { type: "response.in_progress" },
  { type: "response.output_text.delta" },
  { type: "response.completed", terminal: true },
  { type: "turn.completed", terminal: true },
] as const;

const CANCEL_TERMINAL_FIXTURE = [
  { type: "response.incomplete", reason: "user_interrupt", terminal: true },
] as const;

function timestamp(): string {
  return new Date().toISOString();
}

function sessionStateAfterClose(currentState: AgentSessionState): AgentSessionState {
  if (currentState === "idle") {
    return applySessionTransition(currentState, "closed");
  }

  if (currentState === "cancelling") {
    return applySessionTransition(currentState, "closed");
  }

  return currentState;
}

export class FakeAgentRuntimeProvider implements AgentRuntimeProvider {
  private readonly sessionsById = new Map<string, FakeSessionRecord>();
  private readonly sessionsByCreateKey = new Map<string, string>();

  async createSession(request: CreateSessionRequest): Promise<AgentSession> {
    const parsed = createSessionRequestSchema.parse(request);
    const existingSessionId = this.sessionsByCreateKey.get(parsed.idempotencyKey);
    if (existingSessionId) {
      return this.getRecord(existingSessionId).session;
    }

    const sessionId = `session-${parsed.idempotencyKey}`;
    const now = timestamp();
    const session: MutableAgentSessionInfo = {
      activeTurnId: undefined,
      correlationId: parsed.correlationId,
      createdAt: now,
      eventCursor: 0,
      handoffPacket: parsed.handoffPacket,
      id: sessionId,
      identityProfileId: parsed.identityProfileId,
      metadata: parsed.metadata,
      repoRoot: parsed.repoRoot,
      rootSessionId: sessionId,
      runtime: "omnigent",
      state: "idle",
      targetHarness: parsed.targetHarness,
      targetProvider: parsed.targetProvider,
      title: parsed.title,
      updatedAt: now,
      worktree: parsed.worktree,
    };
    const stream = new FakeEventStream(sessionId, `${sessionId}-bootstrap`);
    stream.append(
      createRuntimeEvent({
        eventId: `${sessionId}-created`,
        occurredAt: now,
        payload: {
          state: "idle",
          title: parsed.title,
        },
        redaction: "metadata_only",
        sessionId,
        terminal: false,
        type: "runtime.session.created",
      }),
    );
    session.eventCursor = stream.lastSequence();

    this.sessionsById.set(sessionId, {
      createKey: parsed.idempotencyKey,
      session,
      stream,
      turnsById: new Map(),
      turnsByKey: new Map(),
    });
    this.sessionsByCreateKey.set(parsed.idempotencyKey, sessionId);

    return session;
  }

  async sendTurn(request: SendTurnRequest): Promise<TurnHandle> {
    const parsed = sendTurnRequestSchema.parse(request);
    const record = this.getRecord(parsed.sessionId);
    const existing = record.turnsByKey.get(parsed.idempotencyKey);
    if (existing) {
      return existing;
    }

    if (record.session.activeTurnId) {
      throw createRuntimeFailure({
        actor: "provider",
        category: "concurrency_limit",
        message: "Only one active turn is allowed per session.",
        retryable: false,
        scope: "session",
      });
    }

    const now = timestamp();
    const turnId = parsed.turnId ?? `turn-${parsed.idempotencyKey}`;
    const turnHandle: MutableTurnHandle = {
      createdAt: now,
      eventCursor: record.stream.lastSequence(),
      idempotencyKey: parsed.idempotencyKey,
      sessionId: parsed.sessionId,
      state: "running",
      turnId,
      updatedAt: now,
    };
    record.session.state = applySessionTransition(record.session.state, "turn_active");
    record.session.activeTurnId = turnId;
    record.session.updatedAt = now;
    record.turnsById.set(turnId, turnHandle);
    record.turnsByKey.set(parsed.idempotencyKey, turnHandle);
    record.stream.append(
      createRuntimeEvent({
        eventId: `${turnId}-started`,
        occurredAt: now,
        payload: {
          message: parsed.message,
          state: "running",
        },
        redaction: "metadata_only",
        sessionId: parsed.sessionId,
        terminal: false,
        turnId,
        type: "runtime.turn.started",
      }),
    );
    record.session.eventCursor = record.stream.lastSequence();
    turnHandle.eventCursor = record.session.eventCursor;

    return turnHandle;
  }

  async readHistory(
    sessionId: string,
    options?: HistoryOptions,
  ): Promise<SessionHistory> {
    const record = this.getRecord(sessionId);
    const parsedOptions = options ?? {};
    const events = record.stream.read(
      parsedOptions.afterSequence ?? 0,
      true,
    );
    const limitedEvents =
      parsedOptions.limit === undefined
        ? events
        : events.slice(0, parsedOptions.limit);

    return {
      events: limitedEvents,
      nextCursor:
        limitedEvents.length > 0
          ? limitedEvents[limitedEvents.length - 1]?.sequence
          : parsedOptions.afterSequence,
      sessionId,
    };
  }

  async *streamEvents(
    sessionId: string,
    options?: StreamOptions,
  ): AsyncIterable<RuntimeEvent> {
    const record = this.getRecord(sessionId);
    yield* record.stream.stream(
      options?.afterSequence ?? 0,
      options?.includeHeartbeats ?? true,
    );
  }

  async cancelTurn(
    handle: TurnHandle,
    _reason: CancellationReason = "user_request",
  ): Promise<TurnHandle> {
    const record = this.getRecord(handle.sessionId);
    const existingHandle = record.turnsById.get(handle.turnId);
    if (!existingHandle) {
      throw createRuntimeFailure({
        actor: "provider",
        category: "validation",
        message: `Unknown turn ${handle.turnId}.`,
        retryable: false,
        scope: "turn",
      });
    }

    if (existingHandle.state === "cancelled") {
      return existingHandle;
    }

    existingHandle.state = applyTurnTransition(existingHandle.state, "cancelling");
    record.stream.appendFixture([...CANCEL_TERMINAL_FIXTURE], handle.turnId);
    existingHandle.state = "cancelled";
    existingHandle.updatedAt = timestamp();
    existingHandle.eventCursor = record.stream.lastSequence();
    record.session.state = applySessionTransition(record.session.state, "idle");
    record.session.activeTurnId = undefined;
    record.session.updatedAt = existingHandle.updatedAt;
    record.session.eventCursor = existingHandle.eventCursor ?? record.stream.lastSequence();

    return existingHandle;
  }

  async closeSession(sessionId: string): Promise<void> {
    const record = this.getRecord(sessionId);
    if (record.session.state === "closed") return;
    if (record.closePromise) return record.closePromise;
    record.closePromise = (async () => {
    if (record.session.activeTurnId) {
      const activeHandle = record.turnsById.get(record.session.activeTurnId);
      if (activeHandle) {
        await this.cancelTurn(activeHandle, "session_close");
      }
    }

    const now = timestamp();
    record.session.state = sessionStateAfterClose(record.session.state);
    record.session.updatedAt = now;
    const closedEvent = record.stream.append({
      eventId: `${sessionId}-closed`,
      occurredAt: now,
      payload: {
        reason: "logical_close",
      },
      redaction: "metadata_only",
      sessionId,
      terminal: true,
      type: "runtime.session.closed",
    }) as RuntimeSessionClosedEvent;
    record.session.eventCursor = closedEvent.sequence;
    })();
    return record.closePromise;
  }

  async getSessionInfo(sessionId: string): Promise<AgentSessionInfo> {
    const record = this.getRecord(sessionId);
    return agentSessionInfoSchema.parse(record.session);
  }

  async health(): Promise<ProviderHealth> {
    return {
      activeSessions: this.sessionsById.size,
      available: true,
      backend: "omnigent-hybrid",
      notes: ["fake-provider"],
      runtime: "omnigent",
      sessionStateDrift: ["waiting"],
    };
  }

  completeTurn(sessionId: string, turnId: string): TurnHandle {
    const record = this.getRecord(sessionId);
    const handle = record.turnsById.get(turnId);
    if (!handle) {
      throw createRuntimeFailure({
        actor: "provider",
        category: "validation",
        message: `Unknown turn ${turnId}.`,
        retryable: false,
        scope: "turn",
      });
    }

    if (handle.state === "completed") return handle;
    const completedState = applyTurnTransition(handle.state, "completed");
    record.stream.appendFixture([...NORMAL_TERMINAL_FIXTURE], turnId);
    handle.state = completedState;
    handle.updatedAt = timestamp();
    handle.eventCursor = record.stream.lastSequence();
    record.session.state = applySessionTransition(record.session.state, "idle");
    record.session.activeTurnId = undefined;
    record.session.updatedAt = handle.updatedAt;
    record.session.eventCursor = handle.eventCursor ?? record.stream.lastSequence();

    return handle;
  }

  appendHeartbeat(sessionId: string): number {
    const record = this.getRecord(sessionId);
    record.stream.appendHeartbeat();
    record.session.eventCursor = record.stream.lastSequence();
    return record.session.eventCursor;
  }

  forceSequenceGap(sessionId: string, size = 1): void {
    const record = this.getRecord(sessionId);
    record.stream.forceSequenceGap(size);
  }

  validate(): void {
    agentRuntimeProviderSchema.parse(this);
  }

  private getRecord(sessionId: string): FakeSessionRecord {
    const record = this.sessionsById.get(sessionId);
    if (!record) {
      throw createRuntimeFailure({
        actor: "caller",
        category: "validation",
        message: `Unknown session ${sessionId}.`,
        retryable: false,
        scope: "session",
      });
    }

    return record;
  }
}
