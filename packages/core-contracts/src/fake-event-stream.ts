import {
  createRuntimeEvent,
  type RuntimeEvent,
  type RuntimeHeartbeatEvent,
} from "./events.js";
import { createRuntimeFailure, type RuntimeFailure } from "./errors.js";
import { requireSingleTerminalEvent } from "./state-machines.js";

interface UpstreamFixtureEvent {
  readonly type: string;
  readonly status?: string;
  readonly reason?: string;
  readonly terminal?: boolean;
  readonly semantic_terminal?: boolean;
}

export interface NormalizedFixtureResult {
  readonly events: RuntimeEvent[];
  readonly skippedFrames: string[];
}

function terminalEventFromUpstream(
  sessionId: string,
  turnId: string,
  sequence: number,
  event: UpstreamFixtureEvent,
): RuntimeEvent | null {
  const occurredAt = new Date().toISOString();

  if (event.type === "response.completed" || event.type === "turn.completed") {
    return createRuntimeEvent({
      eventId: `${turnId}-terminal-completed-${sequence}`,
      sessionId,
      turnId,
      occurredAt,
      payload: {
        outcome: "completed",
        outputSummary: "Normalized upstream completion.",
      },
      redaction: "metadata_only",
      sequence,
      terminal: true,
      type: "runtime.turn.completed",
    });
  }

  if (event.type === "response.failed" || event.type === "turn.failed") {
    return createRuntimeEvent({
      eventId: `${turnId}-terminal-failed-${sequence}`,
      sessionId,
      turnId,
      occurredAt,
      payload: {
        failure: createRuntimeFailure({
          actor: "omnigent",
          category: "backend_unavailable",
          message: "Normalized upstream failure.",
          retryable: false,
          scope: "turn",
        }),
        outcome: "failed",
      },
      redaction: "metadata_only",
      sequence,
      terminal: true,
      type: "runtime.turn.failed",
    });
  }

  if (
    event.type === "response.incomplete" &&
    event.reason === "user_interrupt"
  ) {
    return createRuntimeEvent({
      eventId: `${turnId}-terminal-cancelled-${sequence}`,
      sessionId,
      turnId,
      occurredAt,
      payload: {
        outcome: "cancelled",
        reason: "user_interrupt",
      },
      redaction: "metadata_only",
      sequence,
      terminal: true,
      type: "runtime.turn.cancelled",
    });
  }

  return null;
}

export function normalizeOmnigentFixture(
  sessionId: string,
  turnId: string,
  upstreamEvents: UpstreamFixtureEvent[],
): NormalizedFixtureResult {
  const events: RuntimeEvent[] = [];
  const skippedFrames: string[] = [];
  let sequence = 1;
  let terminalEmitted = false;
  let startedEmitted = false;

  for (const event of upstreamEvents) {
    if (!startedEmitted && event.type === "response.in_progress") {
      events.push(
        createRuntimeEvent({
          eventId: `${turnId}-started-${sequence}`,
          sessionId,
          turnId,
          occurredAt: new Date().toISOString(),
          payload: {
            message: "Normalized upstream turn start.",
            state: "running",
          },
          redaction: "metadata_only",
          sequence,
          terminal: false,
          type: "runtime.turn.started",
        }),
      );
      startedEmitted = true;
      sequence += 1;
      continue;
    }

    if (event.type === "response.output_text.delta") {
      events.push(
        createRuntimeEvent({
          eventId: `${turnId}-delta-${sequence}`,
          sessionId,
          turnId,
          occurredAt: new Date().toISOString(),
          payload: {
            delta: "normalized delta",
          },
          redaction: "metadata_only",
          sequence,
          terminal: false,
          type: "runtime.text.delta",
        }),
      );
      sequence += 1;
      continue;
    }

    const terminalEvent = terminalEventFromUpstream(
      sessionId,
      turnId,
      sequence,
      event,
    );
    if (terminalEvent) {
      if (!terminalEmitted) {
        events.push(terminalEvent);
        terminalEmitted = true;
        sequence += 1;
      }
      continue;
    }

    if (
      event.type === "session.status" ||
      event.type === "session.interrupted" ||
      event.type === "[DONE]"
    ) {
      continue;
    }

    skippedFrames.push(event.type);
  }

  return {
    events,
    skippedFrames,
  };
}

export function normalizeMalformedFrames(
  sessionId: string,
  turnId: string,
  frames: Array<{ readonly shape: string; readonly type?: string }>,
): NormalizedFixtureResult {
  const events: RuntimeEvent[] = [];
  const skippedFrames: string[] = [];
  let sequence = 1;

  for (const frame of frames) {
    if (frame.shape === "valid_event" && frame.type === "response.output_text.delta") {
      events.push(
        createRuntimeEvent({
          eventId: `${turnId}-valid-${sequence}`,
          sessionId,
          turnId,
          occurredAt: new Date().toISOString(),
          payload: {
            delta: "normalized delta",
          },
          redaction: "metadata_only",
          sequence,
          terminal: false,
          type: "runtime.text.delta",
        }),
      );
      sequence += 1;
      continue;
    }

    skippedFrames.push(frame.shape);
  }

  return {
    events,
    skippedFrames,
  };
}

export class FakeEventStream {
  private readonly events: RuntimeEvent[] = [];
  private nextSequence = 1;

  constructor(
    private readonly sessionId: string,
    private readonly turnId: string,
  ) {}

  append(event: RuntimeEvent | Omit<RuntimeEvent, "sequence" | "schema">): RuntimeEvent {
    const { schema: _schema, sequence: _sequence, ...rest } = event as RuntimeEvent;
    const runtimeEvent = createRuntimeEvent({
      ...rest,
      sequence: this.nextSequence,
    } as RuntimeEvent);
    this.events.push(runtimeEvent);
    this.nextSequence += 1;
    return runtimeEvent;
  }

  appendHeartbeat(): RuntimeHeartbeatEvent {
    return this.append({
      eventId: `${this.turnId}-heartbeat-${this.nextSequence}`,
      occurredAt: new Date().toISOString(),
      payload: {
        cursor: this.nextSequence,
      },
      redaction: "metadata_only",
      sessionId: this.sessionId,
      terminal: false,
      turnId: this.turnId,
      type: "runtime.heartbeat",
    }) as RuntimeHeartbeatEvent;
  }

  appendFixture(upstreamEvents: UpstreamFixtureEvent[], turnId = this.turnId): RuntimeEvent[] {
    const normalized = normalizeOmnigentFixture(
      this.sessionId,
      turnId,
      upstreamEvents,
    );
    const appended = normalized.events.map((event) =>
      this.append({
        ...event,
        eventId: event.eventId,
        occurredAt: event.occurredAt,
        payload: event.payload,
        redaction: event.redaction,
        sessionId: event.sessionId,
        terminal: event.terminal,
        turnId: event.turnId,
        type: event.type,
        correlationId: event.correlationId,
        evidenceRefs: event.evidenceRefs,
      }),
    );
    const terminalFailure = requireSingleTerminalEvent(appended);
    if (terminalFailure) {
      throw terminalFailure;
    }
    return appended;
  }

  forceSequenceGap(size = 1): void {
    this.nextSequence += size;
  }

  read(afterSequence = 0, includeHeartbeats = true): RuntimeEvent[] {
    const window = this.events.filter((event) => event.sequence > afterSequence);
    let expected = afterSequence + 1;
    for (const event of window) {
      if (event.sequence !== expected) {
      throw createRuntimeFailure({
        actor: "provider",
        category: "protocol",
        message: `Sequence gap detected after ${afterSequence}.`,
        retryable: false,
        scope: "session",
      });
      }
      expected += 1;
    }

    return window.filter((event) => includeHeartbeats || event.type !== "runtime.heartbeat");
  }

  async *stream(afterSequence = 0, includeHeartbeats = true): AsyncIterable<RuntimeEvent> {
    for (const event of this.read(afterSequence, includeHeartbeats)) {
      yield event;
    }
  }

  snapshot(): RuntimeEvent[] {
    return [...this.events];
  }

  lastSequence(): number {
    return this.nextSequence - 1;
  }
}

export function getProtocolFailure(error: unknown): RuntimeFailure | null {
  if (typeof error === "object" && error !== null && "category" in error) {
    return error as RuntimeFailure;
  }

  return null;
}
