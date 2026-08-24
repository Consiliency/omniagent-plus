import { describe, expect, it } from "vitest";

import {
  loadOmnigentEventFixture,
  loadOmnigentV010WireContract,
} from "./contract-fixtures.js";
import { mapOmnigentEventSequence } from "./event-mapper.js";
import type { OmnigentRawEvent } from "./types.js";

function fixtureToRawEvents(
  fixtureName: string,
  turnId = "turn-1",
): OmnigentRawEvent[] {
  const fixture = loadOmnigentEventFixture(fixtureName);
  return (fixture.events ?? []).map((event, index) => ({
    action: event.action,
    action_id: event.action_id,
    args: event.args,
    call_id: event.call_id,
    delta:
      event.type === "response.output_text.delta" ? "hello world" : event.delta,
    id: `${fixtureName}-${index + 1}`,
    itemId: `${fixtureName}-${index + 1}`,
    message: event.type === "response.created" ? "hello world" : undefined,
    occurredAt: new Date(Date.parse("2026-06-30T00:00:00.000Z") + index * 1000).toISOString(),
    outputText:
      event.type === "response.completed" ? "hello world" : undefined,
    phase: event.phase,
    reason: event.reason,
    servers: event.servers,
    sessionId: "session-1",
    status:
      event.status === undefined
        ? undefined
        : (event.status as OmnigentRawEvent["status"]),
    terminal: event.terminal ?? event.semantic_terminal,
    turnId:
      (event.type.startsWith("response.") &&
        event.type !== "response.policy_denied" &&
        event.type !== "response.function_call_output.delta") ||
      event.type.startsWith("turn.")
        ? turnId
        : undefined,
    type: event.type as OmnigentRawEvent["type"],
  }));
}

describe("event mapper", () => {
  it("normalizes duplicate terminal markers down to one completed event", () => {
    const runtimeEvents = mapOmnigentEventSequence(
      "session-1",
      fixtureToRawEvents("normal-terminal"),
    );

    expect(runtimeEvents.filter((event) => event.type === "runtime.turn.completed")).toHaveLength(
      1,
    );
    expect(runtimeEvents.some((event) => event.type === "runtime.text.delta")).toBe(true);
  });

  it("maps interrupt fixtures to cancelled runtime events", () => {
    const runtimeEvents = mapOmnigentEventSequence(
      "session-1",
      fixtureToRawEvents("cancel-interrupt"),
    );

    expect(runtimeEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "runtime.turn.cancelled",
        }),
      ]),
    );
  });

  it("maps a correlated failed session status to one terminal failure", () => {
    const failedStatus: OmnigentRawEvent = {
      failure: {
        category: "backend_unavailable",
        message: "turn setup failed",
      },
      id: "session-failed",
      occurredAt: "2026-06-30T00:00:00.000Z",
      sessionId: "session-1",
      status: "failed",
      terminal: true,
      turnId: "turn-setup",
      type: "session.status",
    };
    const runtimeEvents = mapOmnigentEventSequence("session-1", [
      failedStatus,
      {
        ...failedStatus,
        id: "session-failed-official",
        turnAliasId: "turn-setup",
        turnId: "response-official",
        type: "response.failed",
      },
    ]);

    expect(runtimeEvents).toEqual([
      expect.objectContaining({
        payload: expect.objectContaining({
          failure: expect.objectContaining({ message: "turn setup failed" }),
          outcome: "failed",
        }),
        turnId: "turn-setup",
        type: "runtime.turn.failed",
      }),
    ]);
  });

  it("treats child session-created frames as metadata-only", () => {
    const runtimeEvents = mapOmnigentEventSequence("session-1", [
      {
        id: "session-created-launching",
        itemId: "session-created-launching",
        child_session_id: "child-1",
        occurredAt: "2026-06-30T00:00:00.000Z",
        sessionId: "session-1",
        status: "launching",
        type: "session.created",
      },
    ]);

    expect(runtimeEvents).toEqual([]);
  });

  it("preserves session-created events for the legacy CLI mapper", () => {
    const runtimeEvents = mapOmnigentEventSequence(
      "session-1",
      [
        {
          id: "session-created-launching",
          itemId: "session-created-launching",
          occurredAt: "2026-06-30T00:00:00.000Z",
          sessionId: "session-1",
          status: "launching",
          type: "session.created",
        },
      ],
      { legacySessionCreatedEvents: true },
    );

    expect(runtimeEvents).toEqual([
      expect.objectContaining({
        payload: expect.objectContaining({ state: "starting" }),
        type: "runtime.session.created",
      }),
    ]);
  });

  it("skips raw duplicates by item id during reconnect dedupe", () => {
    const rawEvents = fixtureToRawEvents("normal-terminal");
    const runtimeEvents = mapOmnigentEventSequence("session-1", rawEvents, {
      seenItemIds: [rawEvents[0]?.itemId ?? ""],
    });

    expect(runtimeEvents.some((event) => event.eventId === rawEvents[0]?.id)).toBe(false);
    expect(runtimeEvents.filter((event) => event.type === "runtime.turn.completed")).toHaveLength(
      1,
    );
  });

  it("keeps text that continues a persisted message id after reconnect", () => {
    const occurredAt = "2026-06-30T00:00:00.000Z";
    const runtimeEvents = mapOmnigentEventSequence(
      "session-1",
      [
        {
          delta: "hello",
          id: "delta-replayed",
          message_id: "message-1",
          occurredAt,
          sessionId: "session-1",
          turnId: "response-1",
          type: "response.output_text.delta",
        },
        {
          delta: " world",
          id: "delta-continuation",
          message_id: "message-1",
          occurredAt,
          sessionId: "session-1",
          turnId: "response-1",
          type: "response.output_text.delta",
        },
      ],
      {
        historicalTextByMessageId: [["message-1", "hello"]],
        seenItemIds: ["message-1"],
      },
    );

    expect(runtimeEvents).toEqual([
      expect.objectContaining({
        payload: { delta: " world" },
        turnId: "response-1",
        type: "runtime.text.delta",
      }),
    ]);
  });

  it("suppresses a buffered suffix of a persisted message after reconnect", () => {
    const runtimeEvents = mapOmnigentEventSequence(
      "session-1",
      [
        {
          delta: " world",
          id: "delta-buffered-suffix",
          message_id: "message-suffix",
          occurredAt: "2026-06-30T00:00:00.000Z",
          sessionId: "session-1",
          turnId: "response-suffix",
          type: "response.output_text.delta",
        },
      ],
      {
        historicalTextByMessageId: [["message-suffix", "Hello world"]],
      },
    );

    expect(runtimeEvents).toEqual([]);
  });

  it("suppresses buffered prefix chunks of a persisted message after reconnect", () => {
    const runtimeEvents = mapOmnigentEventSequence(
      "session-1",
      [
        {
          delta: "Hello",
          id: "delta-buffered-prefix-1",
          message_id: "message-prefix",
          occurredAt: "2026-06-30T00:00:00.000Z",
          sessionId: "session-1",
          turnId: "response-prefix",
          type: "response.output_text.delta",
        },
        {
          delta: " world",
          id: "delta-buffered-prefix-2",
          message_id: "message-prefix",
          occurredAt: "2026-06-30T00:00:01.000Z",
          sessionId: "session-1",
          turnId: "response-prefix",
          type: "response.output_text.delta",
        },
      ],
      {
        historicalTextByMessageId: [["message-prefix", "Hello world"]],
      },
    );

    expect(runtimeEvents).toEqual([]);
  });

  it("correlates buffered message chunks with persisted items from another id namespace", () => {
    const runtimeEvents = mapOmnigentEventSequence(
      "session-1",
      [
        {
          delta: "Hello",
          id: "delta-cross-namespace-1",
          message_id: "stream-message",
          occurredAt: "2026-06-30T00:00:00.000Z",
          sessionId: "session-1",
          turnId: "response-cross-namespace",
          type: "response.output_text.delta",
        },
        {
          delta: " world",
          id: "delta-cross-namespace-2",
          message_id: "stream-message",
          occurredAt: "2026-06-30T00:00:01.000Z",
          sessionId: "session-1",
          turnId: "response-cross-namespace",
          type: "response.output_text.delta",
        },
      ],
      {
        historicalMessagesByTurnId: [
          [
            "response-cross-namespace",
            [{ messageId: "ap-item", text: "Hello world" }],
          ],
        ],
        historicalTextByMessageId: [["ap-item", "Hello world"]],
      },
    );

    expect(runtimeEvents).toEqual([]);
  });

  it("prefers an exact persisted message over an earlier compatible prefix", () => {
    const runtimeEvents = mapOmnigentEventSequence(
      "session-1",
      [
        {
          delta: "same more",
          id: "delta-exact-cross-namespace",
          message_id: "stream-message-b",
          occurredAt: "2026-06-30T00:00:00.000Z",
          sessionId: "session-1",
          turnId: "response-cross-namespace",
          type: "response.output_text.delta",
        },
      ],
      {
        historicalMessagesByTurnId: [
          [
            "response-cross-namespace",
            [
              { messageId: "ap-item-a", text: "same" },
              { messageId: "ap-item-b", text: "same more" },
            ],
          ],
        ],
      },
    );

    expect(runtimeEvents).toEqual([]);
  });

  it("preserves a distinct longer message after a persisted prefix", () => {
    const occurredAt = "2026-06-30T00:00:00.000Z";
    const runtimeEvents = mapOmnigentEventSequence(
      "session-1",
      [
        {
          delta: "Hello again",
          id: "delta-distinct-longer-message",
          message_id: "stream-message-b",
          occurredAt,
          sessionId: "session-1",
          turnId: "response-shared",
          type: "response.output_text.delta",
        },
        {
          id: "item-distinct-longer-message",
          item: {
            content: [{ text: "Hello again", type: "output_text" }],
            id: "ap-item-b",
            response_id: "response-shared",
            role: "assistant",
            type: "message",
          },
          itemId: "ap-item-b",
          occurredAt,
          sessionId: "session-1",
          turnId: "response-shared",
          type: "response.output_item.done",
        },
      ],
      {
        historicalMessagesByTurnId: [
          [
            "response-shared",
            [{ messageId: "ap-item-a", text: "Hello" }],
          ],
        ],
      },
    );

    expect(
      runtimeEvents
        .filter((event) => event.type === "runtime.text.delta")
        .map((event) => event.payload.delta),
    ).toEqual(["Hello again"]);
  });

  it("preserves new identifier-free text that repeats a historical prefix", () => {
    const runtimeEvents = mapOmnigentEventSequence(
      "session-1",
      [
        {
          delta: "He",
          id: "delta-repeated-prefix",
          occurredAt: "2026-06-30T00:00:00.000Z",
          sessionId: "session-1",
          turnId: "response-prefix",
          type: "response.output_text.delta",
        },
      ],
      {
        historicalTextByTurnId: [["response-prefix", "Hello"]],
      },
    );

    expect(runtimeEvents).toEqual([
      expect.objectContaining({
        payload: { delta: "He" },
        turnId: "response-prefix",
        type: "runtime.text.delta",
      }),
    ]);
  });

  it("preserves identifier-free text that exactly repeats a historical suffix", () => {
    const runtimeEvents = mapOmnigentEventSequence(
      "session-1",
      [
        {
          delta: " world",
          id: "delta-identifier-free-suffix",
          occurredAt: "2026-06-30T00:00:00.000Z",
          sessionId: "session-1",
          turnId: "response-suffix",
          type: "response.output_text.delta",
        },
      ],
      {
        historicalTextByTurnId: [["response-suffix", "Hello world"]],
      },
    );

    expect(runtimeEvents).toEqual([
      expect.objectContaining({
        payload: { delta: " world" },
        turnId: "response-suffix",
        type: "runtime.text.delta",
      }),
    ]);
  });

  it("emits assistant output items when no text delta preceded them", () => {
    const events = mapOmnigentEventSequence("session-1", [
      {
        id: "message-done",
        item: {
          content: [{ text: "item-only reply", type: "output_text" }],
          id: "message-item-only",
          response_id: "response-item-only",
          role: "assistant",
          type: "message",
        },
        itemId: "message-item-only",
        occurredAt: "2026-06-30T00:00:00.000Z",
        sessionId: "session-1",
        turnId: "response-item-only",
        type: "response.output_item.done",
      },
    ]);

    expect(events).toEqual([
      expect.objectContaining({
        payload: { delta: "item-only reply" },
        turnId: "response-item-only",
        type: "runtime.text.delta",
      }),
    ]);
  });

  it("does not repeat identified assistant output after an identity-free delta", () => {
    const occurredAt = "2026-06-30T00:00:00.000Z";
    const events = mapOmnigentEventSequence("session-1", [
      {
        delta: "streamed reply",
        id: "delta-streamed:0",
        occurredAt,
        sessionId: "session-1",
        turnId: "response-streamed",
        type: "response.output_text.delta",
      },
      {
        id: "message-streamed-done",
        item: {
          content: [{ text: "streamed reply", type: "output_text" }],
          id: "message-streamed",
          response_id: "response-streamed",
          role: "assistant",
          type: "message",
        },
        itemId: "message-streamed",
        occurredAt,
        sessionId: "session-1",
        turnId: "response-streamed",
        type: "response.output_item.done",
      },
    ]);

    expect(
      events
        .filter((event) => event.type === "runtime.text.delta")
        .map((event) => event.payload.delta),
    ).toEqual(["streamed reply"]);
  });

  it("correlates streamed text with a committed item from another id namespace", () => {
    const occurredAt = "2026-06-30T00:00:00.000Z";
    const events = mapOmnigentEventSequence("session-1", [
      {
        delta: "Hello",
        id: "stream-message:0:1",
        message_id: "stream-message",
        occurredAt,
        sessionId: "session-1",
        turnId: "response-streamed",
        type: "response.output_text.delta",
      },
      {
        id: "ap-item-done",
        item: {
          content: [{ text: "Hello world", type: "output_text" }],
          id: "ap-item",
          response_id: "response-streamed",
          role: "assistant",
          type: "message",
        },
        itemId: "ap-item",
        occurredAt,
        sessionId: "session-1",
        turnId: "response-streamed",
        type: "response.output_item.done",
      },
    ]);

    expect(
      events
        .filter((event) => event.type === "runtime.text.delta")
        .map((event) => event.payload.delta),
    ).toEqual(["Hello", " world"]);
  });

  it("preserves complete text for distinct messages sharing one response", () => {
    const occurredAt = "2026-06-30T00:00:00.000Z";
    const events = mapOmnigentEventSequence("session-1", [
      {
        id: "message-first-done",
        item: {
          content: [{ text: "Hello", type: "output_text" }],
          id: "message-first",
          response_id: "response-shared",
          role: "assistant",
          type: "message",
        },
        itemId: "message-first",
        occurredAt,
        sessionId: "session-1",
        turnId: "response-shared",
        type: "response.output_item.done",
      },
      {
        id: "message-second-done",
        item: {
          content: [{ text: "Hello again", type: "output_text" }],
          id: "message-second",
          response_id: "response-shared",
          role: "assistant",
          type: "message",
        },
        itemId: "message-second",
        occurredAt,
        sessionId: "session-1",
        turnId: "response-shared",
        type: "response.output_item.done",
      },
    ]);

    expect(
      events
        .filter((event) => event.type === "runtime.text.delta")
        .map((event) => event.payload.delta),
    ).toEqual(["Hello", "Hello again"]);
  });

  it("accepts v0.4 UI and metadata events as safe no-ops", () => {
    const runtimeEvents = mapOmnigentEventSequence(
      "session-1",
      fixtureToRawEvents("v0-4-noop-events"),
    );

    expect(runtimeEvents).toEqual([]);
  });

  it("accepts v0.5 MCP startup and policy events as safe no-ops", () => {
    const rawEvents = fixtureToRawEvents("v0-5-noop-events");
    const runtimeEvents = mapOmnigentEventSequence("session-1", rawEvents);

    expect(runtimeEvents).toEqual([]);
    expect(rawEvents[0]?.servers?.["failed-server"]?.status).toBe("failed");
    expect(rawEvents[1]).toEqual(
      expect.objectContaining({
        phase: "tool_call",
        reason: "metadata_only_policy_denied",
        turnId: undefined,
      }),
    );
  });

  it("preserves repeated identity-free output deltas from the v0.10 fixture", () => {
    const deltas = loadOmnigentV010WireContract().sse_frames.filter(
      (frame): frame is Record<string, unknown> =>
        typeof frame === "object" &&
        frame !== null &&
        "type" in frame &&
        frame.type === "response.output_text.delta",
    );
    const runtimeEvents = mapOmnigentEventSequence(
      "session-v0-10",
      deltas.map((frame, index) => ({
        delta: String(frame.delta),
        id: `v0-10-delta-${index}`,
        occurredAt: "2026-08-24T06:00:29.000Z",
        sessionId: "session-v0-10",
        turnId: "response-1",
        type: "response.output_text.delta",
      })),
    );

    expect(
      runtimeEvents
        .filter((event) => event.type === "runtime.text.delta")
        .map((event) => event.payload.delta),
    ).toEqual(["answer", "answer"]);
  });

  it("accepts v0.6 browser and tool-output events as safe no-ops", () => {
    const rawEvents = fixtureToRawEvents("v0-6-noop-events");
    const runtimeEvents = mapOmnigentEventSequence("session-1", rawEvents);

    expect(runtimeEvents).toEqual([]);
    expect(rawEvents[0]).toEqual(
      expect.objectContaining({
        action: "snapshot",
        action_id: "baction_metadata_only",
        args: {},
        turnId: undefined,
      }),
    );
    expect(rawEvents[1]).toEqual(
      expect.objectContaining({
        call_id: "call_metadata_only",
        delta: "metadata-only tool output",
        turnId: undefined,
      }),
    );
  });
});
