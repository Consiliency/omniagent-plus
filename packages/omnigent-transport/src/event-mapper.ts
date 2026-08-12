import {
  createRuntimeEvent,
  createRuntimeFailure,
  type RuntimeEvent,
} from "@consiliency/runtime-provider";

import type { OmnigentRawEvent } from "./types.js";

function defaultTurnMessage(rawEvent: OmnigentRawEvent): string {
  return rawEvent.message ?? `Omnigent turn ${rawEvent.turnId ?? "unknown"}`;
}

export interface OmnigentEventMapperOptions {
  readonly historicalTextByTurnId?: Iterable<readonly [string, string]>;
  readonly historicalToolCallIds?: Iterable<string>;
  readonly historicalToolResultIds?: Iterable<string>;
  readonly seenItemIds?: Iterable<string>;
  readonly startingSequence?: number;
  readonly startedTurnIds?: Iterable<string>;
  readonly terminalTurnIds?: Iterable<string>;
}

export class OmnigentEventMapper {
  readonly seenItemIds: Set<string>;

  private readonly emittedStartedTurnIds: Set<string>;
  private readonly emittedTerminalTurnIds: Set<string>;
  private readonly historicalItemIds: Set<string>;
  private readonly historicalTextRemainders: Map<string, string>;
  private readonly emittedToolCallIds: Set<string>;
  private readonly emittedToolResultIds: Set<string>;
  private nextSequence: number;

  constructor(
    private readonly sessionId: string,
    options: OmnigentEventMapperOptions = {},
  ) {
    this.emittedStartedTurnIds = new Set(options.startedTurnIds ?? []);
    this.emittedTerminalTurnIds = new Set(options.terminalTurnIds ?? []);
    this.historicalItemIds = new Set(options.seenItemIds ?? []);
    this.historicalTextRemainders = new Map(
      options.historicalTextByTurnId ?? [],
    );
    this.emittedToolCallIds = new Set(options.historicalToolCallIds ?? []);
    this.emittedToolResultIds = new Set(options.historicalToolResultIds ?? []);
    this.seenItemIds = new Set(options.seenItemIds ?? []);
    this.nextSequence = options.startingSequence ?? 1;
  }

  map(rawEvent: OmnigentRawEvent): RuntimeEvent[] {
    const historicalItemKey =
      rawEvent.itemId ??
      (rawEvent.type === "response.output_text.delta"
        ? rawEvent.message_id
        : undefined);
    if (historicalItemKey && this.historicalItemIds.has(historicalItemKey)) {
      return [];
    }

    const itemKey = rawEvent.itemId ?? rawEvent.id;
    if (itemKey && this.seenItemIds.has(itemKey)) {
      return [];
    }

    if (itemKey) {
      this.seenItemIds.add(itemKey);
    }

    switch (rawEvent.type) {
      case "session.created":
        return [];
      case "turn.started":
      case "response.created":
        if (!rawEvent.turnId || this.emittedStartedTurnIds.has(rawEvent.turnId)) {
          return [];
        }
        this.emittedStartedTurnIds.add(rawEvent.turnId);
        return [
          this.createEvent({
            eventId: rawEvent.id,
            occurredAt: rawEvent.occurredAt,
            payload: {
              message: defaultTurnMessage(rawEvent),
              state: "running",
            },
            terminal: false,
            turnId: rawEvent.turnId,
            type: "runtime.turn.started",
          }),
        ];
      case "response.output_text.delta":
        return this.mapTextDelta(rawEvent);
      case "response.output_item.done":
        return this.mapOutputItem(rawEvent);
      case "response.completed":
      case "turn.completed":
        return this.mapTerminalEvent(rawEvent, "runtime.turn.completed");
      case "response.cancelled":
      case "turn.cancelled":
        return this.mapTerminalEvent(rawEvent, "runtime.turn.cancelled");
      case "response.incomplete":
        if (rawEvent.reason?.includes("interrupt")) {
          return this.mapTerminalEvent(rawEvent, "runtime.turn.cancelled");
        }
        if (rawEvent.reason?.includes("timeout")) {
          return this.mapTerminalEvent(rawEvent, "runtime.turn.timed_out");
        }
        return this.mapFailedEvent(rawEvent);
      case "response.failed":
      case "turn.failed":
        return this.mapFailedEvent(rawEvent);
      case "session.status":
        return rawEvent.status === "failed"
          ? this.mapFailedEvent(rawEvent)
          : [];
      case "session.input.consumed":
      case "session.interrupted":
      case "session.child_session.updated":
      case "response.queued":
      case "response.in_progress":
      case "[DONE]":
        return [];
      default:
        return [];
    }
  }

  private mapTextDelta(rawEvent: OmnigentRawEvent): RuntimeEvent[] {
    let delta = rawEvent.delta ?? "";
    if (rawEvent.turnId && rawEvent.message_id === undefined) {
      const remaining = this.historicalTextRemainders.get(rawEvent.turnId);
      if (remaining !== undefined) {
        if (remaining.startsWith(delta)) {
          const next = remaining.slice(delta.length);
          if (next.length === 0) {
            this.historicalTextRemainders.delete(rawEvent.turnId);
          } else {
            this.historicalTextRemainders.set(rawEvent.turnId, next);
          }
          return [];
        }
        this.historicalTextRemainders.delete(rawEvent.turnId);
        if (delta.startsWith(remaining)) {
          delta = delta.slice(remaining.length);
          if (delta.length === 0) {
            return [];
          }
        }
      }
    } else if (rawEvent.turnId) {
      this.historicalTextRemainders.delete(rawEvent.turnId);
    }

    return [
      this.createEvent({
        eventId: rawEvent.id,
        occurredAt: rawEvent.occurredAt,
        payload: { delta },
        terminal: false,
        turnId: rawEvent.turnId,
        type: "runtime.text.delta",
      }),
    ];
  }

  private mapOutputItem(rawEvent: OmnigentRawEvent): RuntimeEvent[] {
    if (!rawEvent.item || !rawEvent.turnId) {
      return [];
    }
    const item = rawEvent.item;
    const itemType = typeof item.type === "string" ? item.type : undefined;
    if (itemType === "function_call") {
      const callId =
        typeof item.call_id === "string" ? item.call_id : rawEvent.call_id;
      const toolName = typeof item.name === "string" ? item.name : undefined;
      if (!callId || !toolName) {
        return [];
      }
      if (this.emittedToolCallIds.has(callId)) {
        return [];
      }
      this.emittedToolCallIds.add(callId);
      return [
        this.createEvent({
          eventId: rawEvent.id,
          occurredAt: rawEvent.occurredAt,
          payload: {
            toolCall: {
              approvalRequired: false,
              argumentsRedacted: item.arguments,
              sessionId: this.sessionId,
              toolCallId: callId,
              toolName,
              turnId: rawEvent.turnId,
            },
          },
          terminal: false,
          turnId: rawEvent.turnId,
          type: "runtime.tool.call",
        }),
      ];
    }
    if (itemType === "function_call_output") {
      const callId =
        typeof item.call_id === "string" ? item.call_id : rawEvent.call_id;
      if (!callId) {
        return [];
      }
      if (this.emittedToolResultIds.has(callId)) {
        return [];
      }
      this.emittedToolResultIds.add(callId);
      return [
        this.createEvent({
          eventId: rawEvent.id,
          occurredAt: rawEvent.occurredAt,
          payload: {
            outputRedacted: item.output,
            toolCallId: callId,
          },
          terminal: false,
          turnId: rawEvent.turnId,
          type: "runtime.tool.result",
        }),
      ];
    }
    return [];
  }

  private mapFailedEvent(rawEvent: OmnigentRawEvent): RuntimeEvent[] {
    if (!rawEvent.turnId || this.emittedTerminalTurnIds.has(rawEvent.turnId)) {
      return [];
    }
    this.emittedTerminalTurnIds.add(rawEvent.turnId);

    return [
      this.createEvent({
        eventId: rawEvent.id,
        occurredAt: rawEvent.occurredAt,
        payload: {
          failure: createRuntimeFailure({
            actor: "omnigent",
            category: rawEvent.failure?.category ?? "backend_unavailable",
            message:
              rawEvent.failure?.message ??
              rawEvent.reason ??
              "Omnigent reported a terminal failure.",
            resetAt: rawEvent.failure?.resetAt,
            retryAfterSeconds: rawEvent.failure?.retryAfterSeconds,
            retryable:
              (rawEvent.failure?.category ?? "backend_unavailable") !==
              "backend_capability_missing",
            safeDiagnostics:
              rawEvent.failure?.statusCode === undefined
                ? undefined
                : { statusCode: rawEvent.failure.statusCode },
            scope: "turn",
          }),
          outcome: "failed",
        },
        terminal: true,
        turnId: rawEvent.turnId,
        type: "runtime.turn.failed",
      }),
    ];
  }

  private mapTerminalEvent(
    rawEvent: OmnigentRawEvent,
    type:
      | "runtime.turn.completed"
      | "runtime.turn.cancelled"
      | "runtime.turn.timed_out",
  ): RuntimeEvent[] {
    if (!rawEvent.turnId || this.emittedTerminalTurnIds.has(rawEvent.turnId)) {
      return [];
    }
    this.emittedTerminalTurnIds.add(rawEvent.turnId);

    if (type === "runtime.turn.completed") {
      return [
        this.createEvent({
          eventId: rawEvent.id,
          occurredAt: rawEvent.occurredAt,
          payload: {
            outcome: "completed",
            outputSummary: rawEvent.outputText,
          },
          terminal: true,
          turnId: rawEvent.turnId,
          type,
        }),
      ];
    }

    if (type === "runtime.turn.cancelled") {
      return [
        this.createEvent({
          eventId: rawEvent.id,
          occurredAt: rawEvent.occurredAt,
          payload: {
            outcome: "cancelled",
            reason: rawEvent.reason,
          },
          terminal: true,
          turnId: rawEvent.turnId,
          type,
        }),
      ];
    }

    return [
      this.createEvent({
        eventId: rawEvent.id,
        occurredAt: rawEvent.occurredAt,
        payload: {
          outcome: "timed_out",
        },
        terminal: true,
        turnId: rawEvent.turnId,
        type,
      }),
    ];
  }

  private createEvent<TType extends RuntimeEvent["type"]>(
    event: {
      eventId: string;
      occurredAt: string;
      payload: Extract<RuntimeEvent, { type: TType }>["payload"];
      sessionId?: string;
      terminal: boolean;
      turnId?: string;
      type: TType;
    },
  ): Extract<RuntimeEvent, { type: TType }> {
    const runtimeEvent = {
      ...event,
      redaction: "metadata_only",
      sequence: this.nextSequence,
      sessionId: event.sessionId ?? this.sessionId,
    } as unknown as Extract<RuntimeEvent, { type: TType }> & {
      sequence: number;
    };
    const created = createRuntimeEvent(runtimeEvent);
    this.nextSequence += 1;
    return created as Extract<RuntimeEvent, { type: TType }>;
  }
}

export function mapOmnigentEventSequence(
  sessionId: string,
  rawEvents: readonly OmnigentRawEvent[],
  options: OmnigentEventMapperOptions = {},
): RuntimeEvent[] {
  const mapper = new OmnigentEventMapper(sessionId, options);
  return rawEvents.flatMap((rawEvent) => mapper.map(rawEvent));
}
