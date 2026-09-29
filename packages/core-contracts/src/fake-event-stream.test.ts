import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  FakeEventStream,
  normalizeMalformedFrames,
  normalizeOmnigentFixture,
} from "./fake-event-stream.js";
import { reduceTurnState } from "./state-machines.js";

function readOmnigentFixture<T>(path: string): T {
  return JSON.parse(
    readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8"),
  ) as T;
}

describe("fake event stream", () => {
  it("normalizes duplicate upstream terminal markers into one terminal turn event", () => {
    const fixture = readOmnigentFixture<{
      events: Array<{ type: string; semantic_terminal?: boolean; terminal?: boolean }>;
    }>("fixtures/omnigent/events/dual-terminal-markers.json");
    const normalized = normalizeOmnigentFixture(
      "session-1",
      "turn-1",
      fixture.events,
    );

    expect(
      normalized.events.filter((event) => event.terminal),
    ).toHaveLength(1);
    expect(normalized.events[0]?.type).toBe("runtime.turn.completed");
  });

  it("supports replay cursors, heartbeats, and sequence-gap failure", async () => {
    const stream = new FakeEventStream("session-1", "turn-1");
    stream.append({
      eventId: "turn-1-started",
      occurredAt: "2026-06-30T00:00:00.000Z",
      payload: {
        message: "turn start",
        state: "running",
      },
      redaction: "metadata_only",
      sessionId: "session-1",
      terminal: false,
      turnId: "turn-1",
      type: "runtime.turn.started",
    });
    stream.appendHeartbeat();
    stream.append({
      eventId: "turn-1-completed",
      occurredAt: "2026-06-30T00:00:01.000Z",
      payload: {
        outcome: "completed",
      },
      redaction: "metadata_only",
      sessionId: "session-1",
      terminal: true,
      turnId: "turn-1",
      type: "runtime.turn.completed",
    });

    const replayed = [];
    for await (const event of stream.stream(1, true)) {
      replayed.push(event);
    }

    expect(replayed.map((event) => event.type)).toEqual([
      "runtime.heartbeat",
      "runtime.turn.completed",
    ]);
    expect(reduceTurnState(replayed)).toBe("completed");
    expect(stream.read(1, false).map((event) => event.sequence)).toEqual([3]);

    stream.forceSequenceGap();
    stream.append({
      eventId: "turn-1-extra",
      occurredAt: "2026-06-30T00:00:02.000Z",
      payload: {
        delta: "after gap",
      },
      redaction: "metadata_only",
      sessionId: "session-1",
      terminal: false,
      turnId: "turn-1",
      type: "runtime.text.delta",
    });

    expect(() => stream.read(3)).toThrow(/Sequence gap/);
    expect(() => stream.read(0, false)).toThrow(/Sequence gap/);
  });

  it("skips malformed frames and only yields valid event content", () => {
    const fixture = readOmnigentFixture<{
      frames: Array<{ shape: string; type?: string }>;
    }>("fixtures/omnigent/events/malformed-sse-skip.json");
    const normalized = normalizeMalformedFrames(
      "session-1",
      "turn-1",
      fixture.frames,
    );

    expect(normalized.skippedFrames).toEqual([
      "non_json_payload",
      "json_non_object",
      "unknown_event_type",
    ]);
    expect(normalized.events).toHaveLength(1);
    expect(normalized.events[0]?.type).toBe("runtime.text.delta");
  });
});
