import {
  createRuntimeEvent,
  createRuntimeFailure,
  type RuntimeEvent,
  type SessionHistory,
} from "@consiliency/runtime-provider";

import {
  createLegacyOmnigentEventMapper,
  type OmnigentEventMapperOptions,
} from "./event-mapper.js";
import type {
  OmnigentConversationItem,
  OmnigentHistoryItem,
} from "./types.js";

export interface MappedOmnigentHistory {
  readonly history: SessionHistory;
  readonly historicalTextByMessageId: Map<string, string>;
  readonly historicalTextByTurnId: Map<string, string>;
  readonly historicalToolCallIds: Set<string>;
  readonly historicalToolResultIds: Set<string>;
  readonly runtimeEvents: RuntimeEvent[];
  readonly seenItemIds: Set<string>;
  readonly startedTurnIds: Set<string>;
  readonly terminalTurnIds: Set<string>;
}

export interface OmnigentHistoryMapperOptions extends OmnigentEventMapperOptions {
  readonly afterSequence?: number;
}

export function mapOmnigentHistory(
  sessionId: string,
  items: readonly OmnigentHistoryItem[],
  options: OmnigentHistoryMapperOptions = {},
): MappedOmnigentHistory {
  const afterSequence = options.afterSequence;
  const mapper = createLegacyOmnigentEventMapper(sessionId, options);
  const runtimeEvents = items.flatMap((item) => mapper.map(item.event));
  const filteredEvents =
    afterSequence === undefined
      ? runtimeEvents
      : runtimeEvents.filter((event) => event.sequence > afterSequence);
  const historicalTextByTurnId = new Map<string, string>();
  const historicalTextByMessageId = new Map<string, string>();
  const historicalToolCallIds = new Set<string>();
  const historicalToolResultIds = new Set<string>();
  for (const event of runtimeEvents) {
    if (event.type === "runtime.text.delta" && event.turnId) {
      historicalTextByTurnId.set(
        event.turnId,
        `${historicalTextByTurnId.get(event.turnId) ?? ""}${event.payload.delta}`,
      );
    }
    if (event.type === "runtime.tool.call") {
      historicalToolCallIds.add(event.payload.toolCall.toolCallId);
    }
    if (event.type === "runtime.tool.result") {
      historicalToolResultIds.add(event.payload.toolCallId);
    }
  }
  for (const { event } of items) {
    if (
      event.type === "response.output_text.delta" &&
      event.message_id &&
      event.delta
    ) {
      historicalTextByMessageId.set(
        event.message_id,
        `${historicalTextByMessageId.get(event.message_id) ?? ""}${event.delta}`,
      );
    }
  }

  return {
    history: {
      events: filteredEvents,
      nextCursor: filteredEvents.at(-1)?.sequence ?? afterSequence ?? 0,
      sessionId,
    },
    historicalTextByMessageId,
    historicalTextByTurnId,
    historicalToolCallIds,
    historicalToolResultIds,
    runtimeEvents,
    seenItemIds: new Set(mapper.seenItemIds),
    startedTurnIds: new Set(
      runtimeEvents.flatMap((event) =>
        event.type === "runtime.turn.started" && event.turnId
          ? [event.turnId]
          : [],
      ),
    ),
    terminalTurnIds: new Set(
      runtimeEvents.flatMap((event) =>
        event.terminal && event.turnId ? [event.turnId] : [],
      ),
    ),
  };
}

function asRecord(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : {};
}

function itemTimestamp(item: OmnigentConversationItem): string {
  return new Date(item.created_at * 1000).toISOString();
}

function contentText(item: OmnigentConversationItem): string[] {
  const data = asRecord(item);
  if (!Array.isArray(data.content) || data.is_meta === true) {
    return [];
  }
  return data.content.flatMap((block) => {
    const content = asRecord(block);
    return typeof content.text === "string" ? [content.text] : [];
  });
}

export function mapOmnigentConversationHistory(
  sessionId: string,
  items: readonly OmnigentConversationItem[],
  options: Pick<OmnigentHistoryMapperOptions, "afterSequence"> = {},
): MappedOmnigentHistory {
  const runtimeEvents: RuntimeEvent[] = [];
  const seenItemIds = new Set<string>();
  const startedTurnIds = new Set<string>();
  const terminalTurnIds = new Set<string>();
  const historicalTextByTurnId = new Map<string, string>();
  const historicalTextByMessageId = new Map<string, string>();
  const historicalToolCallIds = new Set<string>();
  const historicalToolResultIds = new Set<string>();
  let sequence = 1;

  const append = (
    event: Omit<RuntimeEvent, "redaction" | "schema" | "sequence" | "sessionId">,
  ): void => {
    runtimeEvents.push(
      createRuntimeEvent({
        ...event,
        redaction: "metadata_only",
        sequence,
        sessionId,
      } as RuntimeEvent),
    );
    sequence += 1;
  };

  const ensureStarted = (
    item: OmnigentConversationItem,
    data: Readonly<Record<string, unknown>>,
    text: readonly string[],
  ): void => {
    const turnId = item.response_id;
    if (startedTurnIds.has(turnId)) {
      return;
    }
    startedTurnIds.add(turnId);
    append({
      eventId: `${item.id}:turn-started`,
      occurredAt: itemTimestamp(item),
      payload: {
        message:
          item.type === "message" && data.role === "user"
            ? (text.join("\n") || `Omnigent turn ${turnId}`)
            : `Omnigent turn ${turnId}`,
        state: "running",
      },
      terminal: false,
      turnId,
      type: "runtime.turn.started",
    });
  };

  for (const item of items) {
    seenItemIds.add(item.id);
    const data = asRecord(item);
    const turnId = item.response_id;
    const occurredAt = itemTimestamp(item);
    const text = contentText(item);

    if (item.type === "message") {
      if (data.is_meta === true || (data.role !== "user" && data.role !== "assistant")) {
        continue;
      }
      ensureStarted(item, data, text);
      if (data.role === "user") {
        continue;
      }
      historicalTextByTurnId.set(
        turnId,
        `${historicalTextByTurnId.get(turnId) ?? ""}${text.join("")}`,
      );
      historicalTextByMessageId.set(item.id, text.join(""));
      text.forEach((delta, index) => {
        append({
          eventId: `${item.id}:text:${index}`,
          occurredAt,
          payload: { delta },
          terminal: false,
          turnId,
          type: "runtime.text.delta",
        });
      });
      if (data.interrupted === true && !terminalTurnIds.has(turnId)) {
        terminalTurnIds.add(turnId);
        append({
          eventId: `${item.id}:cancelled`,
          occurredAt,
          payload: { outcome: "cancelled", reason: "interrupted" },
          terminal: true,
          turnId,
          type: "runtime.turn.cancelled",
        });
      }
      continue;
    }

    if (item.type === "function_call") {
      const callId = typeof data.call_id === "string" ? data.call_id : undefined;
      const toolName = typeof data.name === "string" ? data.name : undefined;
      if (callId && toolName) {
        ensureStarted(item, data, text);
        historicalToolCallIds.add(callId);
        append({
          eventId: item.id,
          occurredAt,
          payload: {
            toolCall: {
              approvalRequired: false,
              argumentsRedacted: data.arguments,
              sessionId,
              toolCallId: callId,
              toolName,
              turnId,
            },
          },
          terminal: false,
          turnId,
          type: "runtime.tool.call",
        });
      }
      continue;
    }

    if (item.type === "function_call_output") {
      const callId = typeof data.call_id === "string" ? data.call_id : undefined;
      if (callId) {
        ensureStarted(item, data, text);
        historicalToolResultIds.add(callId);
        append({
          eventId: item.id,
          occurredAt,
          payload: {
            outputRedacted: data.output,
            toolCallId: callId,
          },
          terminal: false,
          turnId,
          type: "runtime.tool.result",
        });
      }
      continue;
    }

    if (item.type === "error" && !terminalTurnIds.has(turnId)) {
      ensureStarted(item, data, text);
      terminalTurnIds.add(turnId);
      append({
        eventId: item.id,
        occurredAt,
        payload: {
          failure: createRuntimeFailure({
            actor: "omnigent",
            category: "backend_unavailable",
            message:
              typeof data.message === "string"
                ? data.message
                : "Omnigent persisted a terminal error.",
            retryable: true,
            scope: "turn",
          }),
          outcome: "failed",
        },
        terminal: true,
        turnId,
        type: "runtime.turn.failed",
      });
    }
  }

  const filteredEvents =
    options.afterSequence === undefined
      ? runtimeEvents
      : runtimeEvents.filter((event) => event.sequence > options.afterSequence!);

  return {
    history: {
      events: filteredEvents,
      nextCursor:
        filteredEvents.at(-1)?.sequence ?? options.afterSequence ?? 0,
      sessionId,
    },
    historicalTextByMessageId,
    historicalTextByTurnId,
    historicalToolCallIds,
    historicalToolResultIds,
    runtimeEvents,
    seenItemIds,
    startedTurnIds,
    terminalTurnIds,
  };
}
