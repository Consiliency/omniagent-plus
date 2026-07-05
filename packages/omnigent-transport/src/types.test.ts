import { describe, expect, it } from "vitest";

import {
  omnigentCapabilityStatuses,
  omnigentProviderModes,
  omnigentSessionStatuses,
  omnigentStreamEventTypes,
  type OmnigentHarnessCatalogResponse,
  type OmnigentHttpClientOptions,
  type OmnigentRawEvent,
  type OmnigentSessionSnapshot,
} from "./types.js";

describe("transport types", () => {
  it("freezes the provider modes, capability states, and stream events", () => {
    const httpOptions: OmnigentHttpClientOptions = {
      baseUrl: "http://127.0.0.1:4010",
    };
    const rawEvent: OmnigentRawEvent = {
      id: "item-1",
      type: "response.output_text.delta",
      sessionId: "session-1",
      occurredAt: "2026-06-30T00:00:00.000Z",
      delta: "hello",
      itemId: "item-1",
    };
    const snapshot: OmnigentSessionSnapshot = {
      id: "session-1",
      title: "transport test",
      status: "idle",
      createdAt: "2026-06-30T00:00:00.000Z",
      updatedAt: "2026-06-30T00:00:00.000Z",
      backend: "omnigent-http",
      active_response_id: "response-1",
      background_task_count: 1,
      items: [{ id: "item-1", event: rawEvent }],
      viewer_last_seen: 1_780_000_000,
      viewer_unread: false,
    };
    const harnessCatalog: OmnigentHarnessCatalogResponse = {
      local: [{ name: "codex", public_session_override: false }],
    };
    const reasoningEvent: OmnigentRawEvent = {
      id: "reasoning-1",
      occurredAt: "2026-06-30T00:00:00.000Z",
      reasoning_effort: "medium",
      sessionId: "session-1",
      type: "session.reasoning_effort",
    };

    expect(httpOptions.baseUrl).toContain("127.0.0.1");
    expect(omnigentProviderModes).toEqual(["http", "cli", "hybrid"]);
    expect(omnigentCapabilityStatuses).toContain("emulated");
    expect(omnigentSessionStatuses).toContain("waiting");
    expect(omnigentSessionStatuses).toContain("launching");
    expect(omnigentStreamEventTypes).toContain("response.output_text.delta");
    expect(omnigentStreamEventTypes).toContain("response.reasoning_text.delta");
    expect(omnigentStreamEventTypes).toContain("response.elicitation_request");
    expect(omnigentStreamEventTypes).toContain("session.usage");
    expect(omnigentStreamEventTypes).toContain("session.heartbeat");
    expect(snapshot.items[0]?.event.delta).toBe("hello");
    expect(snapshot.active_response_id).toBe("response-1");
    expect(snapshot.background_task_count).toBe(1);
    expect(harnessCatalog.local?.[0]?.name).toBe("codex");
    expect(reasoningEvent.reasoning_effort).toBe("medium");
  });
});
