import { describe, expect, it } from "vitest";

import {
  loadOmnigentEventFixture,
  loadOmnigentV09WireContract,
} from "./contract-fixtures.js";
import {
  mapOmnigentConversationHistory,
  mapOmnigentHistory,
} from "./history-mapper.js";
import { OmnigentEventMapper } from "./event-mapper.js";
import { OmnigentSseNormalizer } from "./sse-stream.js";
import type {
  OmnigentConversationItem,
  OmnigentHistoryItem,
  OmnigentRawEvent,
  OmnigentTaggedSseEvent,
} from "./types.js";

function historyFromFixture(fixtureName: string): OmnigentHistoryItem[] {
  const fixture = loadOmnigentEventFixture(fixtureName);
  return (fixture.events ?? [])
    .filter((event) => event.type !== "[DONE]")
    .map((event, index) => ({
      event: {
        delta:
          event.type === "response.output_text.delta" ? "history output" : undefined,
        id: `${fixtureName}-${index + 1}`,
        itemId: `${fixtureName}-${index + 1}`,
        message: event.type === "response.created" ? "history input" : undefined,
        occurredAt: new Date(
          Date.parse("2026-06-30T00:00:00.000Z") + index * 1000,
        ).toISOString(),
        outputText:
          event.type === "response.completed" ? "history output" : undefined,
        reason: event.reason,
        sessionId: "session-history",
        status:
          event.status === undefined
            ? undefined
            : (event.status as OmnigentRawEvent["status"]),
        turnId:
          event.type.startsWith("response.") || event.type.startsWith("turn.")
            ? "turn-history"
            : undefined,
        type: event.type as OmnigentRawEvent["type"],
      },
      id: `${fixtureName}-${index + 1}`,
    }));
}

describe("history mapper", () => {
  it("maps history items into replayable runtime events", () => {
    const mapped = mapOmnigentHistory(
      "session-history",
      historyFromFixture("normal-terminal"),
    );

    expect(mapped.history.events.some((event) => event.type === "runtime.turn.started")).toBe(
      true,
    );
    expect(mapped.history.nextCursor).toBeGreaterThan(0);
  });

  it("dedupes snapshot items by item id during reconnect", () => {
    const history = historyFromFixture("normal-terminal");
    const duplicated = [...history, history[1] ?? history[0]!];
    const mapped = mapOmnigentHistory("session-history", duplicated);

    expect(mapped.runtimeEvents.filter((event) => event.type === "runtime.text.delta")).toHaveLength(
      1,
    );
  });

  it("maps v0.9 conversation items without inventing successful completion", () => {
    const items = loadOmnigentV09WireContract()
      .conversation_items as OmnigentConversationItem[];
    const mapped = mapOmnigentConversationHistory("session-v09", items);

    expect(mapped.history.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "runtime.text.delta" }),
        expect.objectContaining({ type: "runtime.tool.call" }),
        expect.objectContaining({ type: "runtime.tool.result" }),
        expect.objectContaining({ type: "runtime.turn.cancelled" }),
        expect.objectContaining({ type: "runtime.turn.failed" }),
      ]),
    );
    expect(
      mapped.history.events.filter(
        (event) => event.type === "runtime.turn.completed",
      ),
    ).toEqual([]);
    expect(mapped.seenItemIds).toEqual(
      new Set(items.map((item) => item.id)),
    );

    const liveMapper = new OmnigentEventMapper("session-v09", {
      historicalTextByMessageId: mapped.historicalTextByMessageId,
      historicalTextByTurnId: mapped.historicalTextByTurnId,
      historicalToolCallIds: mapped.historicalToolCallIds,
      historicalToolResultIds: mapped.historicalToolResultIds,
      seenItemIds: mapped.seenItemIds,
      startedTurnIds: mapped.startedTurnIds,
      terminalTurnIds: mapped.terminalTurnIds,
    });
    expect(
      liveMapper.map({
        delta: "answer",
        id: "message-assistant:0",
        message_id: "message-assistant",
        occurredAt: "2026-08-12T19:00:00.000Z",
        sessionId: "session-v09",
        turnId: "response-1",
        type: "response.output_text.delta",
      }),
    ).toEqual([]);
    expect(
      liveMapper.map({
        delta: "new answer",
        id: "message-new:0",
        message_id: "message-new",
        occurredAt: "2026-08-12T19:00:00.000Z",
        sessionId: "session-v09",
        turnId: "response-1",
        type: "response.output_text.delta",
      }),
    ).toEqual([
      expect.objectContaining({
        payload: { delta: "new answer" },
        type: "runtime.text.delta",
      }),
    ]);
    expect(
      liveMapper.map({
        id: "buffered-cancel",
        occurredAt: "2026-08-12T19:00:00.000Z",
        sessionId: "session-v09",
        terminal: true,
        turnId: "response-2",
        type: "response.cancelled",
      }),
    ).toEqual([]);
  });

  it("preserves ambiguous identity-free fixture overlap and continued text", () => {
    const fixture = loadOmnigentV09WireContract();
    const history = mapOmnigentConversationHistory(
      "session-123",
      fixture.conversation_items as OmnigentConversationItem[],
    );
    const normalizer = new OmnigentSseNormalizer({
      now: () => "2026-08-12T19:00:00.000Z",
      sessionId: "session-123",
    });
    const liveMapper = new OmnigentEventMapper("session-123", {
      historicalTextByMessageId: history.historicalTextByMessageId,
      historicalTextByTurnId: history.historicalTextByTurnId,
      historicalToolCallIds: history.historicalToolCallIds,
      historicalToolResultIds: history.historicalToolResultIds,
      seenItemIds: history.seenItemIds,
      startedTurnIds: history.startedTurnIds,
      terminalTurnIds: history.terminalTurnIds,
    });
    const liveEvents = (fixture.sse_frames as OmnigentTaggedSseEvent[]).flatMap(
      (frame) => liveMapper.map(normalizer.normalize(frame)),
    );

    expect(
      history.runtimeEvents
        .concat(liveEvents)
        .filter((event) => event.type === "runtime.text.delta")
        .map((event) => event.payload.delta),
    ).toEqual(["answer", "answer"]);
    expect(
      history.runtimeEvents
        .concat(liveEvents)
        .filter((event) => event.type === "runtime.tool.call")
        .map((event) => event.payload.toolCall.toolCallId),
    ).toEqual(["call-1"]);

    const continuationMapper = new OmnigentEventMapper("session-123", {
      historicalTextByTurnId: history.historicalTextByTurnId,
    });
    expect(
      continuationMapper.map({
        delta: "answer continued",
        id: "identity-free-continuation",
        occurredAt: "2026-08-12T19:00:00.000Z",
        sessionId: "session-123",
        turnId: "response-1",
        type: "response.output_text.delta",
      }),
    ).toEqual([
      expect.objectContaining({
        payload: { delta: "answer continued" },
        type: "runtime.text.delta",
      }),
    ]);
  });

  it("keeps metadata-only history rows from creating neutral lifecycle", () => {
    for (const item of [
      {
        created_at: 1_780_272_000,
        applied: true,
        decision_id: "route-metadata-only",
        id: "routing-only",
        model: "model-routed",
        rationale: "Selected for the task.",
        response_id: "response-routing-only",
        scope: "turn",
        status: "completed",
        type: "routing_decision",
      },
      {
        content: [{ text: "hidden", type: "output_text" }],
        created_at: 1_780_272_001,
        id: "meta-only",
        is_meta: true,
        response_id: "response-meta-only",
        role: "assistant",
        status: "completed",
        type: "message",
      },
    ] as OmnigentConversationItem[]) {
      expect(mapOmnigentConversationHistory("session-metadata", [item]).runtimeEvents).toEqual([]);
    }
  });

  it("v0.15 A ignores informational persisted errors without losing their item identity", () => {
    const items = [
      {
        created_at: 1_780_272_000,
        id: "routing-info",
        response_id: "response-info",
        type: "error",
        code: "routing_notice",
        level: "info",
        message: "Route selected",
        source: "harness",
        status: "completed",
      },
      {
        created_at: 1_780_272_001,
        id: "real-error",
        response_id: "response-error",
        type: "error",
        code: "execution_failed",
        level: "error",
        message: "Execution failed",
        source: "execution",
        status: "completed",
      },
    ] as OmnigentConversationItem[];
    const mapped = mapOmnigentConversationHistory("session-info", items);

    expect(mapped.seenItemIds).toEqual(new Set(["routing-info", "real-error"]));
    expect(mapped.runtimeEvents.map((event) => event.turnId)).toEqual([
      "response-error",
      "response-error",
    ]);
    expect(mapped.runtimeEvents.at(-1)?.type).toBe("runtime.turn.failed");
  });

  it("v0.15 B suppresses delayed chunked previews by explicit stream identity", () => {
    const history = mapOmnigentConversationHistory("session-explicit", [{
      content: [{ text: "Hello world", type: "output_text" }],
      created_at: 1_780_272_000,
      id: "durable-a",
      response_id: "response-a",
      role: "assistant",
      status: "completed",
      stream_message_id: "preview-a",
      type: "message",
    }]);
    const mapper = new OmnigentEventMapper("session-explicit", history);
    const preview = (id: string, delta: string) => mapper.map({
      delta, id, message_id: "preview-a",
      occurredAt: "2026-08-12T19:00:00.000Z",
      sessionId: "session-explicit", turnId: "response-a",
      type: "response.output_text.delta",
    });
    expect(preview("chunk-1", "Hello ")).toEqual([]);
    expect(preview("chunk-2", "world")).toEqual([]);
    expect(preview("chunk-3", "Hello world")).toEqual([]);
    expect(preview("chunk-4", " world")).toEqual([]);
    expect(preview("chunk-5", " world!").map((event) =>
      event.type === "runtime.text.delta" ? event.payload.delta : "",
    )).toEqual(["!"]);
  });

  it("v0.15 B preserves preview content when durable stream identities collide", () => {
    const items = ["durable-a", "durable-b"].map((id) => ({
      content: [{ text: "same", type: "output_text" }],
      created_at: 1_780_272_000,
      id, response_id: "response-collision", role: "assistant",
      status: "completed", stream_message_id: "colliding-stream",
      type: "message",
    })) as OmnigentConversationItem[];
    const history = mapOmnigentConversationHistory("session-collision", items);
    const mapper = new OmnigentEventMapper("session-collision", history);
    const live = mapper.map({
      delta: "same", id: "collision-preview", message_id: "colliding-stream",
      occurredAt: "2026-08-12T19:00:00.000Z",
      sessionId: "session-collision", turnId: "response-collision",
      type: "response.output_text.delta",
    });
    expect(live.map((event) => event.type)).toEqual(["runtime.text.delta"]);
  });

  it("v0.15 B does not suppress another response reusing a historical stream id", () => {
    const history = mapOmnigentConversationHistory("session-explicit", [{
      content: [{ text: "same", type: "output_text" }],
      created_at: 1_780_272_000,
      id: "durable-a", response_id: "response-a", role: "assistant",
      status: "completed", stream_message_id: "shared-stream", type: "message",
    }]);
    const mapper = new OmnigentEventMapper("session-explicit", history);
    const events = mapper.map({
      delta: "same", id: "preview-b", message_id: "shared-stream",
      occurredAt: "2026-08-12T19:00:00.000Z",
      sessionId: "session-explicit", turnId: "response-b",
      type: "response.output_text.delta",
    });
    expect(events.filter((event) => event.type === "runtime.text.delta").map((event) =>
      event.payload.delta,
    )).toEqual(["same"]);
  });

  it("v0.15 B learns a late alias from an already-seen durable item", () => {
    const history = mapOmnigentConversationHistory("session-explicit", [{
      content: [{ text: "hello", type: "output_text" }],
      created_at: 1_780_272_000,
      id: "durable-a", response_id: "response-a", role: "assistant",
      status: "completed", type: "message",
    }]);
    const mapper = new OmnigentEventMapper("session-explicit", history);
    expect(mapper.map({
      id: "done-a", itemId: "durable-a",
      item: { type: "message", id: "durable-a", role: "assistant", stream_message_id: "late-stream", content: [{ text: "hello" }] },
      occurredAt: "2026-08-12T19:00:00.000Z",
      sessionId: "session-explicit", turnId: "response-a",
      type: "response.output_item.done",
    })).toEqual([]);
    for (const id of ["preview-1", "preview-2"]) {
      expect(mapper.map({
        delta: "hello", id, message_id: "late-stream",
        occurredAt: "2026-08-12T19:00:00.000Z",
        sessionId: "session-explicit", turnId: "response-a",
        type: "response.output_text.delta",
      })).toEqual([]);
    }
  });
});
