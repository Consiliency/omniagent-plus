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
        historicalTextByTurnId: [["response-1", "hello"]],
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
