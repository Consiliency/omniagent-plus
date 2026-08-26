import { describe, expect, it } from "vitest";

import {
  loadOmnigentEventFixture,
  loadOmnigentV011WireContract,
  loadOmnigentV010WireContract,
  loadOmnigentV09WireContract,
} from "./contract-fixtures.js";
import { mapOmnigentEventSequence } from "./event-mapper.js";
import {
  OmnigentSseNormalizer,
  parseOmnigentSseStream,
} from "./sse-stream.js";

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

  it("parses CRLF-delimited SSE frames independently", async () => {
    const events = await collectAsync(
      parseOmnigentSseStream(
        toStream(
          [
            'data: {"response":{"id":"response-crlf","status":"in_progress"},"type":"response.created"}',
            "",
            'data: {"delta":"hello","response_id":"response-crlf","type":"response.output_text.delta"}',
            "",
          ].join("\r\n"),
        ),
        { sessionId: "session-crlf" },
      ),
    );

    expect(events.map((event) => event.type)).toEqual([
      "response.created",
      "response.output_text.delta",
    ]);
    expect(events[1]).toEqual(
      expect.objectContaining({ delta: "hello", turnId: "response-crlf" }),
    );
  });

  it("skips response lifecycle frames without an authoritative identity", async () => {
    const skipped: string[] = [];
    const events = await collectAsync(
      parseOmnigentSseStream(
        toStream('data: {"type":"response.completed"}\n\n'),
        { sessionId: "session-invalid-lifecycle" },
        ({ reason }) => {
          skipped.push(reason);
        },
      ),
    );

    expect(events).toEqual([]);
    expect(skipped).toEqual(["invalid_event_shape"]);
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
    expect(events.find((event) => event.type === "session.input.consumed")).toEqual(
      expect.objectContaining({
        cleared_pending_id: "pending-1",
        consumed_item_id: "message-user",
      }),
    );
    expect(events.find((event) => event.type === "session.created")).toEqual(
      expect.objectContaining({
        agent_id: "agent-child",
        child_session_id: "child-1",
        conversation_id: "session-123",
        parent_session_id: "session-123",
        sessionId: "session-123",
      }),
    );
    const runtimeEvents = mapOmnigentEventSequence("session-route", events);
    expect(
      runtimeEvents.filter((event) => event.type === "runtime.session.created"),
    ).toEqual([]);
    expect(
      runtimeEvents.filter((event) => event.type === "runtime.turn.completed"),
    ).toHaveLength(1);
  });

  it("normalizes v0.10 frames without changing identity-free output", async () => {
    const skipped: string[] = [];
    const events = await collectAsync(
      parseOmnigentSseStream(
        toStream(
          loadOmnigentV010WireContract()
            .sse_frames.map((frame) => `data: ${JSON.stringify(frame)}`)
            .join("\n\n"),
        ),
        {
          now: () => "2026-08-24T06:00:29.000Z",
          sessionId: "session-v0-10",
        },
        (skip) => skipped.push(skip.reason),
      ),
    );

    expect(skipped).toEqual([]);
    expect(
      events
        .filter((event) => event.type === "response.output_text.delta")
        .map((event) => event.delta),
    ).toEqual(["answer", "answer"]);
  });

  it("accepts v0.11 session metadata events and rejects malformed variants", async () => {
    const skipped: string[] = [];
    const events = await collectAsync(
      parseOmnigentSseStream(
        toStream(
          [
            {
              conversation_id: "session-v0-11",
              item: { id: "message-1" },
              permission_mode: "plan",
              response_id: "forged-response",
              type: "session.permission_mode",
            },
            {
              conversation_id: "session-v0-11",
              response_id: "forged-response",
              title: "Renamed",
              type: "session.title",
            },
            { conversation_id: "session-v0-11", type: "session.title" },
            { permission_mode: "plan", type: "session.permission_mode" },
          ]
            .map((event) => `data: ${JSON.stringify(event)}`)
            .join("\n\n"),
        ),
        { sessionId: "session-v0-11" },
        (skip) => skipped.push(skip.reason),
      ),
    );

    expect(events).toEqual([
      expect.objectContaining({
        permission_mode: "plan",
        item: undefined,
        itemId: undefined,
        response_id: undefined,
        turnAliasId: undefined,
        turnId: undefined,
        type: "session.permission_mode",
      }),
      expect.objectContaining({
        response_id: undefined,
        title: "Renamed",
        turnAliasId: undefined,
        turnId: undefined,
        type: "session.title",
      }),
    ]);
    expect(mapOmnigentEventSequence("session-v0-11", events)).toEqual([]);
    expect(skipped).toEqual(["invalid_event_shape", "invalid_event_shape"]);
  });

  it("accepts v0.11 pre-allocation failures without inventing response identity", async () => {
    const normalizer = new OmnigentSseNormalizer({
      now: () => "2026-08-26T02:47:18.000Z",
      sessionId: "session-v0-11-failure",
    });
    normalizer.setFallbackTurnId("provisional-turn");
    const events = await collectAsync(
      parseOmnigentSseStream(
        toStream(
          'data: {"type":"response.failed","call_id":"forged-call","response_id":"forged-response","response":{"status":"failed","error":{"code":"setup_error","message":"setup failed"}}}\n\n',
        ),
        { sessionId: "session-v0-11-failure" },
        undefined,
        normalizer,
      ),
    );

    expect(events).toEqual([
      expect.objectContaining({
        failure: expect.objectContaining({ message: "setup failed" }),
        call_id: undefined,
        id: expect.stringContaining("response.failed"),
        itemId: undefined,
        response_id: undefined,
        terminal: true,
        turnId: "provisional-turn",
      }),
    ]);
  });

  it("keeps ambiguous id-less failures unattributed and binds an active response", () => {
    const ambiguous = new OmnigentSseNormalizer({ sessionId: "session-ambiguous" });
    ambiguous.setFallbackTurnId("turn-one");
    ambiguous.setFallbackTurnId("turn-two");
    expect(
      ambiguous.normalize({
        response: { status: "failed" },
        response_id: "forged-response",
        type: "response.failed",
      }),
    ).toEqual(
      expect.objectContaining({
        response_id: undefined,
        turnAliasId: undefined,
        turnId: undefined,
      }),
    );

    const active = new OmnigentSseNormalizer({ sessionId: "session-active" });
    active.setActiveResponseId("response-active");
    expect(
      active.normalize({
        response: { status: "failed" },
        type: "response.failed",
      }),
    ).toEqual(
      expect.objectContaining({
        response_id: undefined,
        turnId: "response-active",
      }),
    );
  });

  it("rejects nested id-less failures that are not status-gated", async () => {
    const skipped: string[] = [];
    const legacyFields = {
      id: "legacy-event-id",
      occurredAt: "2026-08-26T02:47:18.000Z",
      response_id: "forged-response",
      sessionId: "session-v0-11-failure",
      terminal: true,
      type: "response.failed",
    };
    const events = await collectAsync(
      parseOmnigentSseStream(
        toStream(
          [
            {
              ...legacyFields,
              response: { status: "incomplete" },
            },
            {
              response: { error: { message: "missing status" } },
              response_id: "forged-response",
              type: "response.failed",
            },
            { ...legacyFields, response: [] },
            { ...legacyFields, response: null },
            { ...legacyFields, response: "failed" },
          ]
            .map((event) => `data: ${JSON.stringify(event)}`)
            .join("\n\n"),
        ),
        { sessionId: "session-v0-11-failure" },
        (skip) => skipped.push(skip.reason),
      ),
    );

    expect(events).toEqual([]);
    expect(skipped).toEqual(Array(5).fill("invalid_event_shape"));
  });

  it("keeps malformed v0.11 task detail from suppressing a failed status edge", async () => {
    const events = await collectAsync(
      parseOmnigentSseStream(
        toStream(
          'data: {"type":"session.status","conversation_id":"session-task-detail","status":"failed","error":{"message":"failed"},"background_tasks":[{"id":42,"description":"kept","future":"preserved"},false]}\n\n',
        ),
        { sessionId: "session-task-detail" },
      ),
    );

    expect(events).toEqual([
      expect.objectContaining({
        background_tasks: [
          expect.objectContaining({ description: "kept", future: "preserved" }),
        ],
        status: "failed",
        terminal: true,
      }),
    ]);
    expect(events[0]?.background_tasks?.[0]).not.toHaveProperty("id");
  });

  it("normalizes the tagged v0.11 fixture without skips", async () => {
    const skipped: string[] = [];
    const events = await collectAsync(
      parseOmnigentSseStream(
        toStream(
          loadOmnigentV011WireContract()
            .sse_frames.map((frame) => `data: ${JSON.stringify(frame)}`)
            .join("\n\n"),
        ),
        { sessionId: "session-v0-11-fixture" },
        (skip) => skipped.push(skip.reason),
      ),
    );

    expect(skipped).toEqual([]);
    expect(events.some(({ type }) => type === "session.permission_mode")).toBe(true);
    expect(events.some(({ type }) => type === "session.title")).toBe(true);
    expect(
      events.some(
        ({ response_id, type }) =>
          type === "response.failed" && response_id === undefined,
      ),
    ).toBe(true);
  });

  it("maps a fixture assistant item when the harness emitted no text deltas", async () => {
    const frames = loadOmnigentV09WireContract().item_only_sse_frames;
    const events = await collectAsync(
      parseOmnigentSseStream(
        toStream(
          frames.map((frame) => `data: ${JSON.stringify(frame)}`).join("\n\n"),
        ),
        {
          now: () => "2026-08-12T19:00:00.000Z",
          sessionId: "session-item-only",
        },
      ),
    );

    expect(
      mapOmnigentEventSequence("session-item-only", events)
        .filter((event) => event.type === "runtime.text.delta")
        .map((event) => event.payload.delta),
    ).toEqual(["terminal-backed fixture reply"]);
  });

  it("preserves every indexed chunk that shares a stable message id", async () => {
    const events = await collectAsync(
      parseOmnigentSseStream(
        toStream(
          [
            {
              response: {
                created_at: 1_780_272_000,
                id: "response-chunks",
                status: "in_progress",
              },
              type: "response.created",
            },
            {
              delta: "first",
              final: false,
              index: 0,
              message_id: "message-stable",
              type: "response.output_text.delta",
            },
            {
              delta: "second",
              final: true,
              index: 0,
              message_id: "message-stable",
              type: "response.output_text.delta",
            },
          ]
            .map((frame) => `data: ${JSON.stringify(frame)}`)
            .join("\n\n"),
        ),
        { sessionId: "session-chunks" },
      ),
    );
    const runtime = mapOmnigentEventSequence("session-chunks", events);

    expect(
      runtime
        .filter((event) => event.type === "runtime.text.delta")
        .map((event) => event.payload.delta),
    ).toEqual(["first", "second"]);
    expect(new Set(events.slice(1).map((event) => event.id)).size).toBe(2);
    expect(events.slice(1).map((event) => event.itemId)).toEqual([
      undefined,
      undefined,
    ]);
  });

  it("preserves provisional correlation across an id-less idle status", () => {
    const normalizer = new OmnigentSseNormalizer({
      now: () => "2026-08-12T19:00:00.000Z",
      sessionId: "session-idle-flap",
    });
    normalizer.setFallbackTurnId("provisional-turn");

    expect(
      normalizer.normalize({
        conversation_id: "session-idle-flap",
        status: "idle",
        type: "session.status",
      }).turnId,
    ).toBe("provisional-turn");
    expect(
      normalizer.normalize({
        delta: "continued after idle",
        type: "response.output_text.delta",
      }).turnId,
    ).toBe("provisional-turn");
    const failed = normalizer.normalize({
      conversation_id: "session-idle-flap",
      error: { code: "setup_failed", message: "setup failed" },
      status: "failed",
      type: "session.status",
    });
    expect(failed).toEqual(
      expect.objectContaining({ terminal: true, turnId: "provisional-turn" }),
    );
    const officialFailure = normalizer.normalize({
      response: {
        error: { code: "setup_failed", message: "setup failed" },
        id: "response-official",
        status: "failed",
      },
      type: "response.failed",
    });
    expect(officialFailure).toEqual(
      expect.objectContaining({
        terminal: true,
        turnAliasId: "provisional-turn",
        turnId: "response-official",
      }),
    );

    normalizer.setFallbackTurnId("next-provisional-turn");
    expect(
      normalizer.normalize({
        conversation_id: "session-idle-flap",
        response_id: "official-turn",
        status: "idle",
        type: "session.status",
      }).terminal,
    ).toBe(true);
    expect(
      normalizer.normalize({
        delta: "after correlated idle",
        type: "response.output_text.delta",
      }).turnId,
    ).toBeUndefined();
  });

  it("does not let a replayed known response consume a newer fallback", () => {
    const normalizer = new OmnigentSseNormalizer({
      sessionId: "session-known-response",
    });
    normalizer.setActiveResponseId("response-a");
    normalizer.setFallbackTurnId("turn-b");

    const replayed = normalizer.normalize({
      response: { id: "response-a", status: "in_progress" },
      type: "response.created",
    });
    const next = normalizer.normalize({
      response: { id: "response-b", status: "in_progress" },
      type: "response.created",
    });

    expect(replayed.turnAliasId).toBeUndefined();
    expect(next).toMatchObject({
      turnAliasId: "turn-b",
      turnId: "response-b",
    });
  });

  it("does not attribute an identity-free terminal across multiple pending turns", () => {
    const normalizer = new OmnigentSseNormalizer({
      sessionId: "session-ambiguous-status",
    });
    normalizer.setFallbackTurnId("turn-first");
    normalizer.setFallbackTurnId("turn-second");

    const failed = normalizer.normalize({
      status: "failed",
      type: "session.status",
    });
    const official = normalizer.normalize({
      response: { id: "response-first", status: "in_progress" },
      type: "response.created",
    });

    expect(failed).toEqual(
      expect.objectContaining({ terminal: true, turnId: undefined }),
    );
    expect(official).toEqual(
      expect.objectContaining({
        turnAliasConfirmed: true,
        turnAliasId: "turn-first",
      }),
    );
  });

  it("keeps prior terminal identity after a new response becomes official", () => {
    const normalizer = new OmnigentSseNormalizer({
      now: () => "2026-08-12T19:00:00.000Z",
      sessionId: "session-late-terminal",
    });
    normalizer.setFallbackTurnId("provisional-one");
    normalizer.normalize({
      conversation_id: "session-late-terminal",
      status: "failed",
      type: "session.status",
    });

    normalizer.setFallbackTurnId("provisional-two");
    expect(
      normalizer.normalize({
        response: { id: "response-two", status: "in_progress" },
        type: "response.created",
      }),
    ).toEqual(
      expect.objectContaining({
        turnAliasId: "provisional-two",
        turnId: "response-two",
      }),
    );
    expect(
      normalizer.normalize({
        response: {
          error: { message: "late failure" },
          id: "response-one",
          status: "failed",
        },
        type: "response.failed",
      }),
    ).toEqual(
      expect.objectContaining({
        turnAliasId: "provisional-one",
        turnId: "response-one",
      }),
    );
    expect(
      normalizer.normalize({
        delta: "current turn output",
        type: "response.output_text.delta",
      }).turnId,
    ).toBe("response-two");
  });

  it("binds snapshot response identity to the provisional fallback", () => {
    const normalizer = new OmnigentSseNormalizer({
      sessionId: "session-snapshot-reconcile",
    });
    normalizer.setFallbackTurnId("provisional-snapshot");
    normalizer.bindResponseId("response-snapshot", "provisional-snapshot");
    normalizer.setActiveResponseId("response-snapshot");

    expect(
      normalizer.normalize({
        delta: "snapshot-correlated",
        type: "response.output_text.delta",
      }),
    ).toEqual(
      expect.objectContaining({
        turnAliasId: "provisional-snapshot",
        turnId: "response-snapshot",
      }),
    );
  });

  it("replaces and removes pre-acknowledgement fallback identities", () => {
    const replaced = new OmnigentSseNormalizer({
      sessionId: "session-ack-replace",
    });
    replaced.setFallbackTurnId("request-provisional");
    replaced.replaceFallbackTurnId("request-provisional", "item-acknowledged");
    expect(
      replaced.normalize({
        response: { id: "response-replaced", status: "in_progress" },
        type: "response.created",
      }),
    ).toEqual(
      expect.objectContaining({
        turnAliasId: "item-acknowledged",
        turnId: "response-replaced",
      }),
    );

    const removed = new OmnigentSseNormalizer({
      sessionId: "session-ack-remove",
    });
    removed.setFallbackTurnId("request-rejected");
    removed.removeFallbackTurnId("request-rejected");
    removed.setFallbackTurnId("request-accepted");
    expect(
      removed.normalize({
        response: { id: "response-accepted", status: "in_progress" },
        type: "response.created",
      }),
    ).toEqual(
      expect.objectContaining({
        turnAliasId: "request-accepted",
        turnId: "response-accepted",
      }),
    );
  });

  it("does not let a rejected response capture the next fallback turn", () => {
    const normalizer = new OmnigentSseNormalizer({
      sessionId: "session-rejected-response",
    });
    normalizer.setFallbackTurnId("request-rejected");
    expect(
      normalizer.normalize({
        response: { id: "response-rejected", status: "in_progress" },
        type: "response.created",
      }),
    ).toEqual(
      expect.objectContaining({
        turnAliasId: "request-rejected",
        turnId: "response-rejected",
      }),
    );
    normalizer.rejectTurnId("request-rejected");
    normalizer.rejectTurnId("response-rejected");
    normalizer.setFallbackTurnId("request-accepted");

    expect(
      normalizer.normalize({
        response: { id: "response-rejected", status: "in_progress" },
        type: "response.created",
      }),
    ).toEqual(
      expect.objectContaining({
        turnAliasId: undefined,
        turnId: "response-rejected",
      }),
    );

    expect(
      normalizer.normalize({
        delta: "identity-free rejected output",
        type: "response.output_text.delta",
      }),
    ).toEqual(
      expect.objectContaining({
        turnAliasId: undefined,
        turnId: "response-rejected",
      }),
    );
    expect(
      normalizer.normalize({
        delta: "late rejected output",
        response_id: "response-rejected",
        type: "response.output_text.delta",
      }),
    ).toEqual(
      expect.objectContaining({
        turnAliasId: undefined,
        turnId: "response-rejected",
      }),
    );
    expect(
      normalizer.normalize({
        response: { id: "response-accepted", status: "in_progress" },
        type: "response.created",
      }),
    ).toEqual(
      expect.objectContaining({
        turnAliasId: "request-accepted",
        turnId: "response-accepted",
      }),
    );
  });

  it("does not restore a rejected fallback without an explicit retry", () => {
    const normalizer = new OmnigentSseNormalizer({
      sessionId: "session-rejected-fallback",
    });
    normalizer.rejectTurnId("request-rejected");
    normalizer.setFallbackTurnId("request-rejected");
    normalizer.setFallbackTurnId("request-accepted");

    expect(
      normalizer.normalize({
        response: { id: "response-accepted", status: "in_progress" },
        type: "response.created",
      }),
    ).toEqual(
      expect.objectContaining({
        turnAliasId: "request-accepted",
        turnId: "response-accepted",
      }),
    );
  });

  it("keeps rejected snapshot identity as identity-free quarantine", () => {
    const normalizer = new OmnigentSseNormalizer({
      sessionId: "session-rejected-snapshot",
    });
    normalizer.rejectTurnId("response-rejected-a");
    normalizer.setFallbackTurnId("pending-b");
    normalizer.setActiveResponseId("response-rejected-a");

    expect(
      normalizer.normalize({
        delta: "late A",
        type: "response.output_text.delta",
      }),
    ).toEqual(
      expect.objectContaining({
        turnAliasId: undefined,
        turnId: "response-rejected-a",
      }),
    );
    expect(
      normalizer.normalize({
        response: { id: "response-b", status: "in_progress" },
        type: "response.created",
      }),
    ).toEqual(
      expect.objectContaining({
        turnAliasId: "pending-b",
        turnId: "response-b",
      }),
    );
  });

  it("binds rapid accepted turns to official responses in lifecycle order", () => {
    const normalizer = new OmnigentSseNormalizer({
      sessionId: "session-rapid-turns",
    });
    normalizer.setFallbackTurnId("provisional-one");
    normalizer.setFallbackTurnId("provisional-two");

    expect(
      normalizer.normalize({
        response: { id: "response-one", status: "in_progress" },
        type: "response.created",
      }),
    ).toEqual(
      expect.objectContaining({
        turnAliasId: "provisional-one",
        turnId: "response-one",
      }),
    );
    expect(
      normalizer.normalize({
        response: { id: "response-two", status: "in_progress" },
        type: "response.created",
      }),
    ).toEqual(
      expect.objectContaining({
        turnAliasId: "provisional-two",
        turnId: "response-two",
      }),
    );
  });

  it("confirms a deferred multi-turn snapshot binding on terminal evidence", () => {
    const normalizer = new OmnigentSseNormalizer({
      sessionId: "session-snapshot-terminal",
    });
    normalizer.setFallbackTurnId("provisional-one");
    normalizer.setFallbackTurnId("provisional-two");
    normalizer.setActiveResponseId("response-one");

    expect(
      normalizer.normalize({
        response: { id: "response-one", status: "failed" },
        type: "response.failed",
      }),
    ).toEqual(
      expect.objectContaining({
        turnAliasConfirmed: true,
        turnAliasId: "provisional-one",
      }),
    );
    expect(
      normalizer.normalize({
        response: { id: "response-two", status: "in_progress" },
        type: "response.created",
      }),
    ).toEqual(
      expect.objectContaining({
        turnAliasConfirmed: true,
        turnAliasId: "provisional-two",
      }),
    );
  });

  it("does not confirm ambiguous reversed terminals for status-only failures", () => {
    const normalizer = new OmnigentSseNormalizer({
      sessionId: "session-reversed-terminals",
    });
    normalizer.setFallbackTurnId("provisional-one");
    const firstStatus = normalizer.normalize({
      status: "failed",
      type: "session.status",
    });
    normalizer.setFallbackTurnId("provisional-two");
    const secondStatus = normalizer.normalize({
      status: "failed",
      type: "session.status",
    });
    const officialTwo = normalizer.normalize({
      response: { id: "response-two", status: "failed" },
      type: "response.failed",
    });
    const officialOne = normalizer.normalize({
      response: { id: "response-one", status: "failed" },
      type: "response.failed",
    });

    expect(officialTwo.turnAliasConfirmed).toBe(false);
    expect(officialOne.turnAliasConfirmed).toBe(false);
    expect(
      mapOmnigentEventSequence("session-reversed-terminals", [
        firstStatus,
        secondStatus,
        officialTwo,
        officialOne,
      ]).filter((event) => event.type === "runtime.turn.failed"),
    ).toHaveLength(2);

    normalizer.setFallbackTurnId("provisional-three");
    expect(
      normalizer.normalize({
        response: { id: "response-three", status: "completed" },
        type: "response.completed",
      }),
    ).toEqual(
      expect.objectContaining({
        turnAliasConfirmed: true,
        turnAliasId: "provisional-three",
      }),
    );
  });

  it("keeps bare turn frames metadata-only and clears after a correlated terminal", () => {
    const normalizer = new OmnigentSseNormalizer({
      now: () => "2026-08-12T19:00:00.000Z",
      sessionId: "session-seed",
    });
    normalizer.setActiveResponseId("response-active");

    expect(
      normalizer.normalize({
        delta: "mid-turn",
        type: "response.output_text.delta",
      }).turnId,
    ).toBe("response-active");
    const bareTerminal = normalizer.normalize({ type: "turn.completed" });
    expect(bareTerminal.terminal).toBe(false);
    expect(bareTerminal.turnId).toBeUndefined();
    expect(
      normalizer.normalize({
        delta: "after bare terminal",
        type: "response.output_text.delta",
      }).turnId,
    ).toBe("response-active");
    expect(
      normalizer.normalize({
        response: { id: "response-active", status: "completed" },
        type: "response.completed",
      }).terminal,
    ).toBe(true);
    expect(
      normalizer.normalize({
        conversation_id: "session-seed",
        status: "launching",
        type: "session.status",
      }),
    ).toEqual(expect.objectContaining({ status: "launching", turnId: undefined }));
  });
});
