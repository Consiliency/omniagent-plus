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
      active_response_id: null,
      agent_id: "agent-mcp-startup",
      created_at: 1_780_272_000,
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
      updated_at: 1_780_272_000,
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
      agentSpec: { kind: "named_agent", value: "agent-mcp-startup" },
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
      agentSpec: { kind: "named_agent", value: "agent-no-mcp-startup" },
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
        agentSpec: { kind: "named_agent", value: "agent-http-provider" },
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
      const info = await provider.getSessionInfo(session.id);

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
      expect(
        streamed.some((event) => event.eventId.includes("-v06-")),
      ).toBe(false);
      expect(info.activeTurnId).toBeUndefined();
      expect(info.state).toBe("idle");
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
        agentSpec: { kind: "named_agent", value: "agent-http-close" },
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
        agentSpec: { kind: "named_agent", value: "agent-active-response" },
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

  it("suppresses duplicate creates and sends within one provider process", async () => {
    const server = await FakeOmnigentServer.start();
    try {
      const provider = createHttpProvider({ baseUrl: server.baseUrl });
      const request = {
        agentSpec: { kind: "named_agent" as const, value: "agent-idempotent" },
        idempotencyKey: "same-create",
        runtime: "omnigent" as const,
        targetHarness: "codex" as const,
        title: "Idempotent",
      };
      const [first, second] = await Promise.all([
        provider.createSession(request),
        provider.createSession(request),
      ]);
      expect(second.id).toBe(first.id);

      const turn = {
        idempotencyKey: "same-turn",
        message: "hello",
        sessionId: first.id,
      };
      const [firstTurn, secondTurn] = await Promise.all([
        provider.sendTurn(turn),
        provider.sendTurn(turn),
      ]);
      expect(secondTurn.turnId).toBe(firstTurn.turnId);
      expect(
        server.requestLog.filter((entry) => entry.path === "/v1/sessions"),
      ).toHaveLength(1);
      expect(
        server.requestLog.filter(
          (entry) => entry.path === `/v1/sessions/${first.id}/events`,
        ),
      ).toHaveLength(1);
    } finally {
      await server.stop();
    }
  });

  it("caches synchronous policy denial without posting a second turn", async () => {
    const server = await FakeOmnigentServer.start({
      rejectNextTurnWith: "policy",
    });
    try {
      const provider = createHttpProvider({ baseUrl: server.baseUrl });
      const session = await provider.createSession({
        agentSpec: { kind: "named_agent", value: "agent-policy" },
        idempotencyKey: "policy-create",
        runtime: "omnigent",
        targetHarness: "codex",
        title: "Policy",
      });
      const request = {
        idempotencyKey: "policy-turn",
        message: "denied input",
        sessionId: session.id,
      };
      await expect(provider.sendTurn(request)).rejects.toEqual(
        expect.objectContaining({
          category: "policy_denied",
          retryable: false,
        }),
      );
      await expect(provider.sendTurn(request)).rejects.toEqual(
        expect.objectContaining({ category: "policy_denied" }),
      );
      expect(
        server.requestLog.filter(
          (entry) => entry.path === `/v1/sessions/${session.id}/events`,
        ),
      ).toHaveLength(1);
      expect((await provider.getSessionInfo(session.id)).activeTurnId).toBeUndefined();
    } finally {
      await server.stop();
    }
  });

  it("opens the tagged stream before snapshot and paginated history", async () => {
    const server = await FakeOmnigentServer.start();
    try {
      const provider = createHttpProvider({ baseUrl: server.baseUrl });
      const session = await provider.createSession({
        agentSpec: { kind: "named_agent", value: "agent-ordering" },
        idempotencyKey: "ordering-create",
        runtime: "omnigent",
        targetHarness: "codex",
        title: "Ordering",
      });
      await collectAsync(provider.streamEvents(session.id));
      const paths = server.requestLog.map((entry) => entry.path);
      const stream = paths.lastIndexOf(`/v1/sessions/${session.id}/stream`);
      const snapshot = paths.lastIndexOf(`/v1/sessions/${session.id}`);
      const items = paths.lastIndexOf(`/v1/sessions/${session.id}/items`);
      expect(stream).toBeLessThan(snapshot);
      expect(snapshot).toBeLessThan(items);
    } finally {
      await server.stop();
    }
  });

  it("consumes queued-only and pending acknowledgements without invented ids", async () => {
    for (const [ack, expected] of [
      [{ queued: true }, "omnigent:session-ack:turn-ack"],
      [{ pending_id: "pending-ack", queued: true }, "pending-ack"],
    ] as const) {
      const provider = createHttpProvider({
        baseUrl: "http://127.0.0.1:4010",
        fetch: async (_input, init) => {
          if (init?.method === "POST" && String(init.body).includes('"agent_id"')) {
            return new Response(
              JSON.stringify({
                active_response_id: null,
                agent_id: "agent-ack",
                created_at: 1_780_272_000,
                id: "session-ack",
                items: [],
                status: "idle",
                title: "Ack",
                updated_at: 1_780_272_000,
              }),
              { status: 200 },
            );
          }
          return new Response(JSON.stringify(ack), { status: 202 });
        },
      });
      const session = await provider.createSession({
        agentSpec: { kind: "named_agent", value: "agent-ack" },
        idempotencyKey: `create-${expected}`,
        runtime: "omnigent",
        targetHarness: "codex",
        title: "Ack",
      });
      const handle = await provider.sendTurn({
        idempotencyKey: "turn-ack",
        message: "hello",
        sessionId: session.id,
      });
      expect(handle.turnId).toBe(expected);
    }
  });

  it("evicts transport failures so the same send key can retry", async () => {
    const server = await FakeOmnigentServer.start({
      rejectNextTurnWith: "rate_limit",
    });
    try {
      const provider = createHttpProvider({ baseUrl: server.baseUrl });
      const session = await provider.createSession({
        agentSpec: { kind: "named_agent", value: "agent-retry" },
        idempotencyKey: "retry-create",
        runtime: "omnigent",
        targetHarness: "codex",
        title: "Retry",
      });
      const request = {
        idempotencyKey: "retry-turn",
        message: "retry me",
        sessionId: session.id,
      };
      await expect(provider.sendTurn(request)).rejects.toEqual(
        expect.objectContaining({ statusCode: 429 }),
      );
      await expect(provider.sendTurn(request)).resolves.toEqual(
        expect.objectContaining({ state: "queued" }),
      );
      expect(
        server.requestLog.filter(
          (entry) => entry.path === `/v1/sessions/${session.id}/events`,
        ),
      ).toHaveLength(2);
    } finally {
      await server.stop();
    }
  });

  it("aborts an eagerly opened stream when snapshot acquisition fails", async () => {
    let streamAborted = false;
    let request = 0;
    const provider = createHttpProvider({
      baseUrl: "http://127.0.0.1:4010",
      fetch: async (_input, init) => {
        request += 1;
        if (request === 1) {
          return new Response(
            JSON.stringify({
              active_response_id: null,
              agent_id: "agent-close",
              created_at: 1_780_272_000,
              id: "session-close",
              items: [],
              status: "idle",
              title: "Close",
              updated_at: 1_780_272_000,
            }),
          );
        }
        if (request === 2) {
          init?.signal?.addEventListener("abort", () => {
            streamAborted = true;
          });
          return new Response(
            new ReadableStream<Uint8Array>({
              start() {},
            }),
            { status: 200 },
          );
        }
        return new Response(JSON.stringify({ error: "snapshot failed" }), {
          status: 500,
        });
      },
    });
    const session = await provider.createSession({
      agentSpec: { kind: "named_agent", value: "agent-close" },
      idempotencyKey: "close-create",
      runtime: "omnigent",
      targetHarness: "codex",
      title: "Close",
    });

    await expect(collectAsync(provider.streamEvents(session.id))).rejects.toEqual(
      expect.objectContaining({ statusCode: 500 }),
    );
    expect(streamAborted).toBe(true);
  });

  it("returns a cursor for the limited history slice", async () => {
    const server = await FakeOmnigentServer.start();
    try {
      const provider = createHttpProvider({ baseUrl: server.baseUrl });
      const session = await provider.createSession({
        agentSpec: { kind: "named_agent", value: "agent-history-limit" },
        idempotencyKey: "history-limit-create",
        initialMessage: "first turn",
        runtime: "omnigent",
        targetHarness: "codex",
        title: "History limit",
      });
      await provider.sendTurn({
        idempotencyKey: "history-limit-turn",
        message: "second turn",
        sessionId: session.id,
      });

      const first = await provider.readHistory(session.id, { limit: 1 });
      const second = await provider.readHistory(session.id, {
        afterSequence: first.nextCursor,
        limit: 1,
      });
      expect(first.events).toHaveLength(1);
      expect(first.nextCursor).toBe(first.events[0]?.sequence);
      expect(second.events).toHaveLength(1);
      expect(second.events[0]?.sequence).toBeGreaterThan(first.nextCursor ?? 0);
    } finally {
      await server.stop();
    }
  });

  it("keeps provisional correlation through idle and retains status-only failure", async () => {
    const snapshot = {
      active_response_id: null,
      agent_id: "agent-idle-failure",
      created_at: 1_780_272_000,
      id: "session-idle-failure",
      items: [],
      status: "idle",
      title: "Idle failure",
      updated_at: 1_780_272_000,
    };
    const streamBody = [
      {
        conversation_id: snapshot.id,
        status: "idle",
        type: "session.status",
      },
      {
        delta: "continued after idle",
        type: "response.output_text.delta",
      },
      {
        conversation_id: snapshot.id,
        error: { code: "setup_failed", message: "turn setup failed" },
        status: "failed",
        type: "session.status",
      },
    ]
      .map((frame) => `data: ${JSON.stringify(frame)}`)
      .join("\n\n");
    const provider = createHttpProvider({
      baseUrl: "http://127.0.0.1:4010",
      fetch: async (input, init) => {
        const url = String(input);
        if (init?.method === "POST" && url.endsWith("/v1/sessions")) {
          return new Response(JSON.stringify(snapshot));
        }
        if (init?.method === "POST" && url.endsWith("/events")) {
          return new Response(JSON.stringify({ queued: true }), { status: 202 });
        }
        if (url.endsWith("/stream")) {
          return new Response(streamBody, {
            headers: { "content-type": "text/event-stream" },
          });
        }
        if (url.includes("/items")) {
          return new Response(
            JSON.stringify({
              data: [],
              first_id: null,
              has_more: false,
              last_id: null,
            }),
          );
        }
        if (url.includes(`/v1/sessions/${snapshot.id}`)) {
          return new Response(JSON.stringify(snapshot));
        }
        throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${url}`);
      },
    });
    const session = await provider.createSession({
      agentSpec: { kind: "named_agent", value: snapshot.agent_id },
      idempotencyKey: "idle-failure-create",
      runtime: "omnigent",
      targetHarness: "codex",
      title: snapshot.title,
    });
    const handle = await provider.sendTurn({
      idempotencyKey: "idle-failure-turn",
      message: "start",
      sessionId: session.id,
    });
    const idleSnapshotInfo = await provider.getSessionInfo(session.id);
    expect(idleSnapshotInfo.activeTurnId).toBe(handle.turnId);
    expect(idleSnapshotInfo.state).toBe("turn_active");

    const events = await collectAsync(provider.streamEvents(session.id));
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          payload: { delta: "continued after idle" },
          turnId: handle.turnId,
          type: "runtime.text.delta",
        }),
        expect.objectContaining({
          payload: expect.objectContaining({
            failure: expect.objectContaining({ message: "turn setup failed" }),
            outcome: "failed",
          }),
          turnId: handle.turnId,
          type: "runtime.turn.failed",
        }),
      ]),
    );
    const info = await provider.getSessionInfo(session.id);
    expect(info.activeTurnId).toBeUndefined();
    expect(info.lastError?.message).toBe("turn setup failed");
    expect(info.state).toBe("failed");
  });

  it("starts reconnect events strictly after a cursor beyond persisted history", async () => {
    const server = await FakeOmnigentServer.start();
    try {
      const provider = createHttpProvider({ baseUrl: server.baseUrl });
      const session = await provider.createSession({
        agentSpec: { kind: "named_agent", value: "agent-reconnect-cursor" },
        idempotencyKey: "reconnect-cursor-create",
        initialMessage: "persisted input",
        runtime: "omnigent",
        targetHarness: "codex",
        title: "Reconnect cursor",
      });
      await provider.sendTurn({
        idempotencyKey: "reconnect-cursor-turn",
        message: "live output",
        sessionId: session.id,
      });
      const events = await collectAsync(
        provider.streamEvents(session.id, { afterSequence: 50 }),
      );

      expect(events.length).toBeGreaterThan(0);
      expect(events.every((event) => event.sequence > 50)).toBe(true);
      expect(events[0]?.sequence).toBe(51);
    } finally {
      await server.stop();
    }
  });
});
