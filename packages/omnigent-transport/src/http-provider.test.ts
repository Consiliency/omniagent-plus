import { describe, expect, it } from "vitest";

import { createHttpProvider } from "./http-provider.js";
import { FakeOmnigentServer } from "./fake-omnigent-server.js";

async function collectAsync<T>(values: AsyncIterable<T>): Promise<T[]> {
  const result: T[] = [];
  for await (const value of values) {
    result.push(value);
  }
  return result;
}

describe("http provider", () => {
  it("preserves v0.5 MCP startup metadata without synthesizing empty metadata", async () => {
    const snapshot = {
      backend: "omnigent-http",
      createdAt: "2026-06-30T00:00:00.000Z",
      id: "session-mcp-startup",
      items: [],
      mcp_startup: {
        "failed-server": {
          error: "metadata_only_startup_failure",
          status: "failed",
        },
      },
      metadata: { existing: "value" },
      status: "idle",
      title: "MCP startup",
      updatedAt: "2026-06-30T00:00:00.000Z",
    };
    const provider = createHttpProvider({
      baseUrl: "http://127.0.0.1:4010",
      fetch: async () =>
        new Response(JSON.stringify(snapshot), {
          headers: { "content-type": "application/json" },
          status: 200,
        }),
    });
    const session = await provider.createSession({
      idempotencyKey: "http-provider-mcp-startup",
      runtime: "omnigent",
      targetHarness: "codex",
      title: "MCP startup",
    });

    expect(session.metadata).toEqual({
      existing: "value",
      mcp_startup: snapshot.mcp_startup,
    });

    const providerWithoutMetadata = createHttpProvider({
      baseUrl: "http://127.0.0.1:4010",
      fetch: async () =>
        new Response(
          JSON.stringify({ ...snapshot, mcp_startup: null, metadata: undefined }),
          {
            headers: { "content-type": "application/json" },
            status: 200,
          },
        ),
    });
    const sessionWithoutMetadata = await providerWithoutMetadata.createSession({
      idempotencyKey: "http-provider-no-mcp-startup",
      runtime: "omnigent",
      targetHarness: "codex",
      title: "No MCP startup",
    });

    expect(sessionWithoutMetadata.metadata).toBeUndefined();
  });

  it("maps session history and stream events into the neutral provider contract", async () => {
    const server = await FakeOmnigentServer.start({
      malformedFrameBeforeValid: true,
    });

    try {
      const provider = createHttpProvider({
        baseUrl: server.baseUrl,
      });
      const session = await provider.createSession({
        idempotencyKey: "http-provider",
        runtime: "omnigent",
        targetHarness: "codex",
        title: "HTTP provider",
      });
      const handle = await provider.sendTurn({
        idempotencyKey: "http-provider-turn",
        message: "hello transport",
        sessionId: session.id,
      });
      const history = await provider.readHistory(session.id);
      const streamed = await collectAsync(provider.streamEvents(session.id));

      expect(handle.state).toBe("queued");
      expect(history.events.some((event) => event.type === "runtime.turn.started")).toBe(
        true,
      );
      expect(streamed.filter((event) => event.type === "runtime.turn.completed")).toHaveLength(
        1,
      );
      expect(streamed.filter((event) => event.type === "runtime.text.delta")).toHaveLength(
        1,
      );
    } finally {
      await server.stop();
    }
  });

  it("emulates logical close and exposes health snapshots", async () => {
    const server = await FakeOmnigentServer.start();

    try {
      const provider = createHttpProvider({
        baseUrl: server.baseUrl,
      });
      const session = await provider.createSession({
        idempotencyKey: "http-provider-close",
        runtime: "omnigent",
        targetHarness: "codex",
        title: "HTTP close",
      });
      await provider.closeSession(session.id);
      const info = await provider.getSessionInfo(session.id);
      const health = await provider.health();

      expect(info.state).toBe("closed");
      expect(health.backend).toBe("omnigent-http");
      expect(health.notes?.[0]).toContain("logical close");
      expect(health.sessionStateDrift).toEqual([]);
    } finally {
      await server.stop();
    }
  });

  it("maps active_response_id snapshots into active turn identity", async () => {
    const server = await FakeOmnigentServer.start({
      activeResponseId: "turn-active-response",
    });

    try {
      const provider = createHttpProvider({
        baseUrl: server.baseUrl,
      });
      const session = await provider.createSession({
        idempotencyKey: "http-provider-active-response",
        runtime: "omnigent",
        targetHarness: "codex",
        title: "HTTP active response",
      });
      const info = await provider.getSessionInfo(session.id);

      expect(info.activeTurnId).toBe("turn-active-response");
      expect(info.state).toBe("turn_active");
    } finally {
      await server.stop();
    }
  });
});
