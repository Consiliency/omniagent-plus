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
    delta:
      event.type === "response.output_text.delta" ? "hello world" : undefined,
    id: `${fixtureName}-${index + 1}`,
    itemId: `${fixtureName}-${index + 1}`,
    message: event.type === "response.created" ? "hello world" : undefined,
    occurredAt: new Date(Date.parse("2026-06-30T00:00:00.000Z") + index * 1000).toISOString(),
    outputText:
      event.type === "response.completed" ? "hello world" : undefined,
    reason: event.reason,
    sessionId: "session-1",
    status:
      event.status === undefined
        ? undefined
        : (event.status as OmnigentRawEvent["status"]),
    terminal: event.terminal ?? event.semantic_terminal,
    turnId:
      event.type.startsWith("response.") || event.type.startsWith("turn.")
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

  it("maps launching session-created status to starting", () => {
    const runtimeEvents = mapOmnigentEventSequence("session-1", [
      {
        id: "session-created-launching",
        itemId: "session-created-launching",
        occurredAt: "2026-06-30T00:00:00.000Z",
        sessionId: "session-1",
        status: "launching",
        type: "session.created",
      },
    ]);

    expect(runtimeEvents[0]).toEqual(
      expect.objectContaining({
        payload: expect.objectContaining({
          state: "starting",
        }),
        type: "runtime.session.created",
      }),
    );
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

  it("accepts v0.4 UI and metadata events as safe no-ops", () => {
    const runtimeEvents = mapOmnigentEventSequence(
      "session-1",
      fixtureToRawEvents("v0-4-noop-events"),
    );

    expect(runtimeEvents).toEqual([]);
  });
});
