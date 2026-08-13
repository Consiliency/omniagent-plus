import { describe, expect, it } from "vitest";

import { loadOmnigentEventFixture } from "./contract-fixtures.js";
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
