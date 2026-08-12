import { describe, expect, it } from "vitest";

import {
  loadOmnigentEventFixture,
  loadOmnigentV09WireContract,
} from "./contract-fixtures.js";
import { mapOmnigentEventSequence } from "./event-mapper.js";
import { parseOmnigentSseStream } from "./sse-stream.js";

async function collectAsync<T>(values: AsyncIterable<T>): Promise<T[]> {
  const result: T[] = [];
  for await (const value of values) {
    result.push(value);
  }
  return result;
}

function toStream(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });
}

describe("sse stream parser", () => {
  it("skips malformed JSON, non-objects, and unknown event types", async () => {
    const skipped: string[] = [];
    const events = await collectAsync(
      parseOmnigentSseStream(
        toStream(
          [
            "data: not-json",
            "",
            'data: "not an object"',
            "",
            'data: {"type":"unknown.event"}',
            "",
            'data: {"id":"item-1","itemId":"item-1","occurredAt":"2026-06-30T00:00:00.000Z","sessionId":"session-1","type":"response.output_text.delta","delta":"hi"}',
            "",
            "data: [DONE]",
            "",
          ].join("\n"),
        ),
        {
          now: () => "2026-06-30T00:00:00.000Z",
          sessionId: "session-1",
        },
        (skip) => {
          skipped.push(skip.reason);
        },
      ),
    );

    expect(skipped).toEqual([
      "invalid_json",
      "non_object_payload",
      "unknown_event_type",
    ]);
    expect(events).toHaveLength(1);
    expect(events[0]?.delta).toBe("hi");
  });

  it("parses official v0.4 event families without unknown-event skips", async () => {
    const fixture = loadOmnigentEventFixture("v0-4-noop-events");
    const skipped: string[] = [];
    const events = await collectAsync(
      parseOmnigentSseStream(
        toStream(
          (fixture.events ?? [])
            .map((event, index) =>
              `data: ${JSON.stringify({
                id: `v04-${index + 1}`,
                occurredAt: "2026-06-30T00:00:00.000Z",
                sessionId: "session-1",
                type: event.type,
              })}`,
            )
            .join("\n\n"),
        ),
        {
          now: () => "2026-06-30T00:00:00.000Z",
          sessionId: "session-1",
        },
        (skip) => {
          skipped.push(skip.reason);
        },
      ),
    );

    expect(skipped).toEqual([]);
    expect(events.map((event) => event.type)).toEqual(
      (fixture.events ?? []).map((event) => event.type),
    );
  });

  it("parses official v0.5 metadata events without unknown-event skips", async () => {
    const fixture = loadOmnigentEventFixture("v0-5-noop-events");
    const skipped: string[] = [];
    const events = await collectAsync(
      parseOmnigentSseStream(
        toStream(
          (fixture.events ?? [])
            .map((event, index) =>
              `data: ${JSON.stringify({
                ...event,
                id: `v05-${index + 1}`,
                occurredAt: "2026-06-30T00:00:00.000Z",
                sessionId: "session-1",
              })}`,
            )
            .join("\n\n"),
        ),
        {
          now: () => "2026-06-30T00:00:00.000Z",
          sessionId: "session-1",
        },
        (skip) => {
          skipped.push(skip.reason);
        },
      ),
    );

    expect(skipped).toEqual([]);
    expect(events.map((event) => event.type)).toEqual([
      "session.mcp_startup",
      "response.policy_denied",
    ]);
    expect(events[0]?.servers?.["failed-server"]?.status).toBe("failed");
    expect(events[0]?.servers?.["failed-server"]?.error).toBe(
      "metadata_only_startup_failure",
    );
    expect(events[1]).toEqual(
      expect.objectContaining({
        phase: "tool_call",
        reason: "metadata_only_policy_denied",
      }),
    );
  });

  it("parses official v0.6 metadata events without unknown-event skips", async () => {
    const fixture = loadOmnigentEventFixture("v0-6-noop-events");
    const skipped: string[] = [];
    const events = await collectAsync(
      parseOmnigentSseStream(
        toStream(
          (fixture.events ?? [])
            .map((event, index) =>
              `data: ${JSON.stringify({
                ...event,
                id: `v06-${index + 1}`,
                occurredAt: "2026-06-30T00:00:00.000Z",
                sessionId: "session-1",
              })}`,
            )
            .join("\n\n"),
        ),
        {
          now: () => "2026-06-30T00:00:00.000Z",
          sessionId: "session-1",
        },
        (skip) => {
          skipped.push(skip.reason);
        },
      ),
    );

    expect(skipped).toEqual([]);
    expect(events.map((event) => event.type)).toEqual([
      "browser.action_request",
      "response.function_call_output.delta",
    ]);
    expect(events[0]).toEqual(
      expect.objectContaining({
        action: "snapshot",
        action_id: "baction_metadata_only",
        args: {},
      }),
    );
    expect(events[1]).toEqual(
      expect.objectContaining({
        call_id: "call_metadata_only",
        delta: "metadata-only tool output",
      }),
    );
  });

  it("normalizes verbatim v0.9 tagged frames deterministically", async () => {
    const frames = loadOmnigentV09WireContract().sse_frames;
    const events = await collectAsync(
      parseOmnigentSseStream(
        toStream(
          frames.map((frame) => `data: ${JSON.stringify(frame)}`).join("\n\n"),
        ),
        {
          now: () => "2026-08-12T19:00:00.000Z",
          sessionId: "session-route",
        },
      ),
    );

    expect(events.find((event) => event.type === "response.created")).toEqual(
      expect.objectContaining({
        occurredAt: "2026-06-01T00:00:50.000Z",
        sessionId: "session-route",
        turnId: "response-1",
      }),
    );
    expect(
      events.find((event) => event.type === "response.output_text.delta"),
    ).toEqual(
      expect.objectContaining({
        delta: "answer",
        occurredAt: "2026-08-12T19:00:00.000Z",
        turnId: "response-1",
      }),
    );
    expect(events.find((event) => event.type === "turn.started")?.turnId).toBeUndefined();
    const runtimeEvents = mapOmnigentEventSequence("session-route", events);
    expect(
      runtimeEvents.filter((event) => event.type === "runtime.session.created"),
    ).toEqual([]);
    expect(
      runtimeEvents.filter((event) => event.type === "runtime.turn.completed"),
    ).toHaveLength(1);
  });
});
