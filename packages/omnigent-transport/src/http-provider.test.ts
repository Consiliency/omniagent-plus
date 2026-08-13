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

  it("reconciles a provisional handle from snapshot-only evidence", async () => {
    const snapshot = {
      active_response_id: null as string | null,
      agent_id: "agent-snapshot-reconcile",
      created_at: 1_780_272_000,
      id: "session-snapshot-reconcile",
      items: [],
      status: "idle",
      title: "Snapshot reconcile",
      updated_at: 1_780_272_000,
    };
    let turnAccepted = false;
    const provider = createHttpProvider({
      baseUrl: "http://127.0.0.1:4010",
      fetch: async (_input, init) => {
        if (init?.method === "POST" && String(init.body).includes('"agent_id"')) {
          return new Response(JSON.stringify(snapshot));
        }
        if (init?.method === "POST") {
          turnAccepted = true;
          return new Response(
            JSON.stringify({ item_id: "item-provisional", queued: true }),
            { status: 202 },
          );
        }
        return new Response(
          JSON.stringify({
            ...snapshot,
            active_response_id: turnAccepted ? "response-official" : null,
            status: turnAccepted ? "running" : "idle",
          }),
        );
      },
    });
    const session = await provider.createSession({
      agentSpec: { kind: "named_agent", value: snapshot.agent_id },
      idempotencyKey: "snapshot-reconcile-create",
      runtime: "omnigent",
      targetHarness: "codex",
      title: snapshot.title,
    });
    const handle = await provider.sendTurn({
      idempotencyKey: "snapshot-reconcile-turn",
      message: "start",
      sessionId: session.id,
    });
    expect(handle.turnId).toBe("item-provisional");

    const info = await provider.getSessionInfo(session.id);
    expect(handle.turnId).toBe("response-official");
    expect(info.activeTurnId).toBe("response-official");
  });

  it("reconciles stream events that arrive before the send acknowledgement", async () => {
    const snapshot = {
      active_response_id: null,
      agent_id: "agent-send-stream-race",
      created_at: 1_780_272_000,
      id: "session-send-stream-race",
      items: [],
      pending_inputs: [],
      status: "idle",
      title: "Send stream race",
      updated_at: 1_780_272_002,
    };
    let resolveAck!: (response: Response) => void;
    let resolveHistoryReady!: () => void;
    let resolveTurnPosted!: () => void;
    let streamController!: ReadableStreamDefaultController<Uint8Array>;
    const historyReady = new Promise<void>((resolve) => {
      resolveHistoryReady = resolve;
    });
    const turnPosted = new Promise<void>((resolve) => {
      resolveTurnPosted = resolve;
    });
    const encoder = new TextEncoder();
    const provider = createHttpProvider({
      baseUrl: "http://127.0.0.1:4010",
      fetch: async (input, init) => {
        const url = String(input);
        if (init?.method === "POST" && String(init.body).includes('"agent_id"')) {
          return new Response(JSON.stringify(snapshot));
        }
        if (init?.method === "POST") {
          streamController.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                response: {
                  created_at: 1_780_272_001,
                  id: "response-race",
                  status: "in_progress",
                },
                type: "response.created",
              })}\n\n`,
            ),
          );
          streamController.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                response: {
                  completed_at: 1_780_272_002,
                  id: "response-race",
                  status: "completed",
                },
                type: "response.completed",
              })}\n\n`,
            ),
          );
          resolveTurnPosted();
          return new Promise<Response>((resolve) => {
            resolveAck = resolve;
          });
        }
        if (url.endsWith("/stream")) {
          return new Response(
            new ReadableStream<Uint8Array>({
              start(controller) {
                streamController = controller;
              },
            }),
            { headers: { "content-type": "text/event-stream" } },
          );
        }
        if (url.includes("/items")) {
          resolveHistoryReady();
          return new Response(
            JSON.stringify({
              data: [],
              first_id: null,
              has_more: false,
              last_id: null,
            }),
          );
        }
        return new Response(JSON.stringify(snapshot));
      },
    });
    const session = await provider.createSession({
      agentSpec: { kind: "named_agent", value: snapshot.agent_id },
      idempotencyKey: "send-stream-race-create",
      runtime: "omnigent",
      targetHarness: "codex",
      title: snapshot.title,
    });
    const iterator = provider.streamEvents(session.id)[Symbol.asyncIterator]();
    const firstEvent = iterator.next();
    await historyReady;

    const send = provider.sendTurn({
      idempotencyKey: "send-stream-race-turn",
      message: "race the acknowledgement",
      sessionId: session.id,
    });
    await turnPosted;

    await expect(firstEvent).resolves.toEqual(
      expect.objectContaining({
        value: expect.objectContaining({
          turnId: "response-race",
          type: "runtime.turn.started",
        }),
      }),
    );
    await expect(iterator.next()).resolves.toEqual(
      expect.objectContaining({
        value: expect.objectContaining({
          turnId: "response-race",
          type: "runtime.turn.completed",
        }),
      }),
    );
    resolveAck(
      new Response(
        JSON.stringify({ item_id: "item-race", queued: true }),
        { status: 202 },
      ),
    );

    const handle = await send;
    expect(handle.turnId).toBe("response-race");
    streamController.close();
    await expect(iterator.next()).resolves.toEqual({
      done: true,
      value: undefined,
    });
    await provider.readHistory(session.id);
    const info = await provider.getSessionInfo(session.id);
    expect(handle.turnId).toBe("response-race");
    expect(info.activeTurnId).toBeUndefined();
    expect(info.state).toBe("idle");
  });

  it("caches stream-proven acceptance when the acknowledgement connection fails", async () => {
    const snapshot = {
      active_response_id: null,
      agent_id: "agent-lost-ack",
      created_at: 1_780_272_000,
      id: "session-lost-ack",
      items: [],
      pending_inputs: [],
      status: "idle",
      title: "Lost acknowledgement",
      updated_at: 1_780_272_001,
    };
    let postCount = 0;
    let rejectAck!: (error: Error) => void;
    let resolveHistoryReady!: () => void;
    let streamController!: ReadableStreamDefaultController<Uint8Array>;
    const historyReady = new Promise<void>((resolve) => {
      resolveHistoryReady = resolve;
    });
    const encoder = new TextEncoder();
    const provider = createHttpProvider({
      baseUrl: "http://127.0.0.1:4010",
      fetch: async (input, init) => {
        const url = String(input);
        if (init?.method === "POST" && url.endsWith("/v1/sessions")) {
          return new Response(JSON.stringify(snapshot));
        }
        if (init?.method === "POST") {
          postCount += 1;
          streamController.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                response: { id: "response-lost-ack", status: "in_progress" },
                type: "response.created",
              })}\n\n`,
            ),
          );
          return new Promise<Response>((_resolve, reject) => {
            rejectAck = reject;
          });
        }
        if (url.endsWith("/stream")) {
          return new Response(
            new ReadableStream<Uint8Array>({
              start(controller) {
                streamController = controller;
              },
            }),
            { headers: { "content-type": "text/event-stream" } },
          );
        }
        if (url.includes("/items")) {
          resolveHistoryReady();
          return new Response(
            JSON.stringify({ data: [], first_id: null, has_more: false, last_id: null }),
          );
        }
        return new Response(JSON.stringify(snapshot));
      },
    });
    const session = await provider.createSession({
      agentSpec: { kind: "named_agent", value: snapshot.agent_id },
      idempotencyKey: "lost-ack-create",
      runtime: "omnigent",
      targetHarness: "codex",
      title: snapshot.title,
    });
    const iterator = provider.streamEvents(session.id)[Symbol.asyncIterator]();
    const firstEvent = iterator.next();
    await historyReady;
    const request = {
      idempotencyKey: "lost-ack-turn",
      message: "accept before disconnect",
      sessionId: session.id,
    };

    const firstSend = provider.sendTurn(request);
    expect(await firstEvent).toEqual(
      expect.objectContaining({
        value: expect.objectContaining({
          turnId: "response-lost-ack",
          type: "runtime.turn.started",
        }),
      }),
    );
    rejectAck(new TypeError("acknowledgement connection lost"));
    const first = await firstSend;
    const second = await provider.sendTurn(request);

    expect(first).toBe(second);
    expect(first.turnId).toBe("response-lost-ack");
    expect(postCount).toBe(1);
    streamController.close();
    await iterator.return?.();
  });

  it("keeps policy denial authoritative after pre-acknowledgement lifecycle", async () => {
    const snapshot = {
      active_response_id: null,
      agent_id: "agent-streamed-denial",
      created_at: 1_780_272_000,
      id: "session-streamed-denial",
      items: [],
      pending_inputs: [],
      status: "idle",
      title: "Streamed denial",
      updated_at: 1_780_272_001,
    };
    let postCount = 0;
    let resolveAck!: (response: Response) => void;
    let resolveHistoryReady!: () => void;
    let streamController!: ReadableStreamDefaultController<Uint8Array>;
    const historyReady = new Promise<void>((resolve) => {
      resolveHistoryReady = resolve;
    });
    const provider = createHttpProvider({
      baseUrl: "http://127.0.0.1:4010",
      fetch: async (input, init) => {
        const url = String(input);
        if (init?.method === "POST" && url.endsWith("/v1/sessions")) {
          return new Response(JSON.stringify(snapshot));
        }
        if (init?.method === "POST") {
          postCount += 1;
          streamController.enqueue(
            new TextEncoder().encode(
              `data: ${JSON.stringify({
                response: { id: "response-denied", status: "in_progress" },
                type: "response.created",
              })}\n\n`,
            ),
          );
          return new Promise<Response>((resolve) => {
            resolveAck = resolve;
          });
        }
        if (url.endsWith("/stream")) {
          return new Response(
            new ReadableStream<Uint8Array>({
              start(controller) {
                streamController = controller;
              },
            }),
            { headers: { "content-type": "text/event-stream" } },
          );
        }
        if (url.includes("/items")) {
          resolveHistoryReady();
          return new Response(
            JSON.stringify({ data: [], first_id: null, has_more: false, last_id: null }),
          );
        }
        return new Response(JSON.stringify(snapshot));
      },
    });
    const session = await provider.createSession({
      agentSpec: { kind: "named_agent", value: snapshot.agent_id },
      idempotencyKey: "streamed-denial-create",
      runtime: "omnigent",
      targetHarness: "codex",
      title: snapshot.title,
    });
    const iterator = provider.streamEvents(session.id)[Symbol.asyncIterator]();
    const lifecycle = iterator.next();
    await historyReady;
    const request = {
      idempotencyKey: "streamed-denial-turn",
      message: "deny after lifecycle",
      sessionId: session.id,
    };
    const denied = provider.sendTurn(request);
    await lifecycle;
    resolveAck(
      new Response(
        JSON.stringify({
          denied: true,
          queued: false,
          reason: "policy rejected streamed input",
        }),
        { status: 200 },
      ),
    );

    await expect(denied).rejects.toEqual(
      expect.objectContaining({ category: "policy_denied", retryable: false }),
    );
    await expect(provider.sendTurn(request)).rejects.toEqual(
      expect.objectContaining({ category: "policy_denied" }),
    );
    expect(postCount).toBe(1);
    expect((await provider.getSessionInfo(session.id)).activeTurnId).toBeUndefined();
    streamController.close();
    await iterator.return?.();
  });

  it("reconciles from persisted history before yielding its first event", async () => {
    const snapshot = {
      active_response_id: null,
      agent_id: "agent-history-reconcile",
      created_at: 1_780_272_000,
      id: "session-history-reconcile",
      items: [],
      status: "idle",
      title: "History reconcile",
      updated_at: 1_780_272_000,
    };
    const provider = createHttpProvider({
      baseUrl: "http://127.0.0.1:4010",
      fetch: async (input, init) => {
        const url = String(input);
        if (init?.method === "POST" && String(init.body).includes('"agent_id"')) {
          return new Response(JSON.stringify(snapshot));
        }
        if (init?.method === "POST") {
          return new Response(
            JSON.stringify({ item_id: "item-provisional", queued: true }),
            { status: 202 },
          );
        }
        if (url.endsWith("/stream")) {
          return new Response("", {
            headers: { "content-type": "text/event-stream" },
          });
        }
        if (url.includes("/items")) {
          return new Response(
            JSON.stringify({
              data: [
                {
                  content: [{ text: "start", type: "input_text" }],
                  created_at: 1_780_272_001,
                  id: "item-provisional",
                  response_id: "response-official",
                  role: "user",
                  status: "completed",
                  type: "message",
                },
              ],
              first_id: "item-provisional",
              has_more: false,
              last_id: "item-provisional",
            }),
          );
        }
        return new Response(JSON.stringify(snapshot));
      },
    });
    const session = await provider.createSession({
      agentSpec: { kind: "named_agent", value: snapshot.agent_id },
      idempotencyKey: "history-reconcile-create",
      runtime: "omnigent",
      targetHarness: "codex",
      title: snapshot.title,
    });
    const handle = await provider.sendTurn({
      idempotencyKey: "history-reconcile-turn",
      message: "start",
      sessionId: session.id,
    });
    const iterator = provider.streamEvents(session.id)[Symbol.asyncIterator]();
    const first = await iterator.next();

    expect(first).toEqual(
      expect.objectContaining({
        value: expect.objectContaining({
          turnId: "response-official",
          type: "runtime.turn.started",
        }),
      }),
    );
    expect(handle.turnId).toBe("response-official");
    expect((await provider.getSessionInfo(session.id)).activeTurnId).toBe(
      "response-official",
    );
    await iterator.return?.();
  });

  it("applies persisted terminal history to tracked provider state", async () => {
    const snapshot = {
      active_response_id: null,
      agent_id: "agent-persisted-terminal",
      created_at: 1_780_272_000,
      id: "session-persisted-terminal",
      items: [],
      pending_inputs: [],
      status: "idle",
      title: "Persisted terminal",
      updated_at: 1_780_272_002,
    };
    const history = [
      {
        content: [{ text: "fail from history", type: "input_text" }],
        created_at: 1_780_272_001,
        id: "item-persisted-terminal",
        response_id: "response-persisted-terminal",
        role: "user",
        status: "completed",
        type: "message",
      },
      {
        created_at: 1_780_272_002,
        id: "error-persisted-terminal",
        message: "persisted terminal failure",
        response_id: "response-persisted-terminal",
        status: "failed",
        type: "error",
      },
    ];
    const provider = createHttpProvider({
      baseUrl: "http://127.0.0.1:4010",
      fetch: async (input, init) => {
        const url = String(input);
        if (init?.method === "POST" && url.endsWith("/v1/sessions")) {
          return new Response(JSON.stringify(snapshot));
        }
        if (init?.method === "POST") {
          return new Response(
            JSON.stringify({ item_id: "item-persisted-terminal", queued: true }),
            { status: 202 },
          );
        }
        if (url.endsWith("/stream")) {
          return new Response("", {
            headers: { "content-type": "text/event-stream" },
          });
        }
        if (url.includes("/items")) {
          return new Response(
            JSON.stringify({
              data: history,
              first_id: history[0]?.id,
              has_more: false,
              last_id: history.at(-1)?.id,
            }),
          );
        }
        return new Response(JSON.stringify(snapshot));
      },
    });
    const session = await provider.createSession({
      agentSpec: { kind: "named_agent", value: snapshot.agent_id },
      idempotencyKey: "persisted-terminal-create",
      runtime: "omnigent",
      targetHarness: "codex",
      title: snapshot.title,
    });
    const handle = await provider.sendTurn({
      idempotencyKey: "persisted-terminal-turn",
      message: "fail from history",
      sessionId: session.id,
    });

    const events = await collectAsync(provider.streamEvents(session.id));
    const info = await provider.getSessionInfo(session.id);

    expect(handle.turnId).toBe("response-persisted-terminal");
    expect(events).toContainEqual(
      expect.objectContaining({
        turnId: "response-persisted-terminal",
        type: "runtime.turn.failed",
      }),
    );
    expect(info.activeTurnId).toBeUndefined();
    expect(info.lastError?.message).toBe("persisted terminal failure");
    expect(info.state).toBe("failed");
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

  it("reconciles a pending acknowledgement through input-consumed and history", async () => {
    const snapshot = {
      active_response_id: null,
      agent_id: "agent-pending-consumed",
      created_at: 1_780_272_000,
      id: "session-pending-consumed",
      items: [],
      pending_inputs: [],
      status: "running",
      title: "Pending consumed",
      updated_at: 1_780_272_001,
    };
    let history: Record<string, unknown>[] = [];
    const provider = createHttpProvider({
      baseUrl: "http://127.0.0.1:4010",
      fetch: async (input, init) => {
        const url = String(input);
        if (init?.method === "POST" && String(init.body).includes('"agent_id"')) {
          return new Response(JSON.stringify(snapshot));
        }
        if (init?.method === "POST") {
          return new Response(
            JSON.stringify({ pending_id: "pending-native-1", queued: true }),
            { status: 202 },
          );
        }
        if (url.endsWith("/stream")) {
          return new Response(
            `data: ${JSON.stringify({
              data: {
                cleared_pending_id: "pending-native-1",
                created_by: null,
                data: {
                  content: [{ text: "native prompt", type: "input_text" }],
                  role: "user",
                },
                item_id: "item-native-1",
                type: "message",
              },
              sequence_number: null,
              type: "session.input.consumed",
            })}\n\n`,
            { headers: { "content-type": "text/event-stream" } },
          );
        }
        if (url.includes("/items")) {
          return new Response(
            JSON.stringify({
              data: history,
              first_id: history[0]?.id ?? null,
              has_more: false,
              last_id: history.at(-1)?.id ?? null,
            }),
          );
        }
        return new Response(JSON.stringify(snapshot));
      },
    });
    const session = await provider.createSession({
      agentSpec: { kind: "named_agent", value: snapshot.agent_id },
      idempotencyKey: "pending-consumed-create",
      runtime: "omnigent",
      targetHarness: "codex",
      title: snapshot.title,
    });
    const handle = await provider.sendTurn({
      idempotencyKey: "pending-consumed-turn",
      message: "native prompt",
      sessionId: session.id,
    });
    expect(handle.turnId).toBe("pending-native-1");

    await collectAsync(provider.streamEvents(session.id));
    history = [
      {
        content: [{ text: "native prompt", type: "input_text" }],
        created_at: 1_780_272_001,
        id: "item-native-1",
        response_id: "response-native-1",
        role: "user",
        status: "completed",
        type: "message",
      },
    ];
    await provider.readHistory(session.id);

    expect(handle.turnId).toBe("response-native-1");
  });

  it("restores delayed pending acknowledgement correlation after a status terminal", async () => {
    const snapshot = {
      active_response_id: null,
      agent_id: "agent-delayed-pending",
      created_at: 1_780_272_000,
      id: "session-delayed-pending",
      items: [],
      pending_inputs: [],
      status: "idle",
      title: "Delayed pending acknowledgement",
      updated_at: 1_780_272_002,
    };
    let history: Record<string, unknown>[] = [];
    let resolveAck!: (response: Response) => void;
    let resolveFirstHistory!: () => void;
    let streamController!: ReadableStreamDefaultController<Uint8Array>;
    const firstHistoryReady = new Promise<void>((resolve) => {
      resolveFirstHistory = resolve;
    });
    let historyReads = 0;
    const provider = createHttpProvider({
      baseUrl: "http://127.0.0.1:4010",
      fetch: async (input, init) => {
        const url = String(input);
        if (init?.method === "POST" && url.endsWith("/v1/sessions")) {
          return new Response(JSON.stringify(snapshot));
        }
        if (init?.method === "POST") {
          return new Promise<Response>((resolve) => {
            resolveAck = resolve;
          });
        }
        if (url.endsWith("/stream")) {
          if (historyReads > 0) {
            return new Response("", {
              headers: { "content-type": "text/event-stream" },
            });
          }
          return new Response(
            new ReadableStream<Uint8Array>({
              start(controller) {
                streamController = controller;
              },
            }),
            { headers: { "content-type": "text/event-stream" } },
          );
        }
        if (url.includes("/items")) {
          historyReads += 1;
          if (historyReads === 1) {
            resolveFirstHistory();
          }
          return new Response(
            JSON.stringify({
              data: history,
              first_id: history[0]?.id ?? null,
              has_more: false,
              last_id: history.at(-1)?.id ?? null,
            }),
          );
        }
        return new Response(JSON.stringify(snapshot));
      },
    });
    const session = await provider.createSession({
      agentSpec: { kind: "named_agent", value: snapshot.agent_id },
      idempotencyKey: "delayed-pending-create",
      runtime: "omnigent",
      targetHarness: "codex",
      title: snapshot.title,
    });
    const firstIterator = provider.streamEvents(session.id)[Symbol.asyncIterator]();
    const terminal = firstIterator.next();
    await firstHistoryReady;
    const pendingHandle = provider.sendTurn({
      idempotencyKey: "delayed-pending-turn",
      message: "persist after terminal",
      sessionId: session.id,
    });
    streamController.enqueue(
      new TextEncoder().encode(
        `data: ${JSON.stringify({
          conversation_id: session.id,
          error: { message: "ambiguous setup failure" },
          status: "failed",
          type: "session.status",
        })}\n\n`,
      ),
    );
    await terminal;
    resolveAck(
      new Response(JSON.stringify({ pending_id: "pending-delayed", queued: true }), {
        status: 202,
      }),
    );
    const handle = await pendingHandle;
    expect(handle.turnId).toBe("pending-delayed");
    streamController.close();
    await firstIterator.next();

    history = [
      {
        content: [{ text: "persist after terminal", type: "input_text" }],
        created_at: 1_780_272_002,
        id: "item-delayed",
        response_id: "response-delayed",
        role: "user",
        status: "completed",
        type: "message",
      },
    ];
    await collectAsync(provider.streamEvents(session.id));

    expect(handle.turnId).toBe("response-delayed");
  });

  it("reconciles multiple consumed pending turns from snapshot and ordered history", async () => {
    const snapshot = {
      active_response_id: null,
      agent_id: "agent-pending-reconnect",
      created_at: 1_780_272_000,
      id: "session-pending-reconnect",
      items: [],
      pending_inputs: [],
      status: "running",
      title: "Pending reconnect",
      updated_at: 1_780_272_002,
    };
    let sendCount = 0;
    const history = [
      {
        content: [{ text: "> first native\n[Attached: context]", type: "input_text" }],
        created_at: 1_780_272_001,
        id: "item-native-first",
        response_id: "response-native-first",
        role: "user",
        status: "completed",
        type: "message",
      },
      {
        content: [{ text: "second   native", type: "input_text" }],
        created_at: 1_780_272_002,
        id: "item-native-second",
        response_id: "response-native-second",
        role: "user",
        status: "completed",
        type: "message",
      },
    ];
    const provider = createHttpProvider({
      baseUrl: "http://127.0.0.1:4010",
      fetch: async (input, init) => {
        const url = String(input);
        if (init?.method === "POST" && String(init.body).includes('"agent_id"')) {
          return new Response(JSON.stringify(snapshot));
        }
        if (init?.method === "POST") {
          sendCount += 1;
          return new Response(
            JSON.stringify({ pending_id: `pending-native-${sendCount}`, queued: true }),
            { status: 202 },
          );
        }
        if (url.endsWith("/stream")) {
          return new Response("", {
            headers: { "content-type": "text/event-stream" },
          });
        }
        if (url.includes("/items")) {
          return new Response(
            JSON.stringify({
              data: history,
              first_id: "item-native-first",
              has_more: false,
              last_id: "item-native-second",
            }),
          );
        }
        return new Response(JSON.stringify(snapshot));
      },
    });
    const session = await provider.createSession({
      agentSpec: { kind: "named_agent", value: snapshot.agent_id },
      idempotencyKey: "pending-reconnect-create",
      runtime: "omnigent",
      targetHarness: "codex",
      title: snapshot.title,
    });
    const first = await provider.sendTurn({
      idempotencyKey: "pending-reconnect-first",
      message: "first native",
      sessionId: session.id,
    });
    const second = await provider.sendTurn({
      idempotencyKey: "pending-reconnect-second",
      message: "second native",
      sessionId: session.id,
    });

    await collectAsync(provider.streamEvents(session.id));

    expect(first.turnId).toBe("response-native-first");
    expect(second.turnId).toBe("response-native-second");
  });

  it("excludes exact item acknowledgements from pending FIFO recovery", async () => {
    const snapshot = {
      active_response_id: null,
      agent_id: "agent-mixed-ack-reconnect",
      created_at: 1_780_272_000,
      id: "session-mixed-ack-reconnect",
      items: [],
      pending_inputs: [],
      status: "running",
      title: "Mixed acknowledgement reconnect",
      updated_at: 1_780_272_002,
    };
    let sendCount = 0;
    const history = [
      {
        content: [{ text: "pending first", type: "input_text" }],
        created_at: 1_780_272_001,
        id: "item-pending-first",
        response_id: "response-pending-first",
        role: "user",
        status: "completed",
        type: "message",
      },
      {
        content: [{ text: "item second", type: "input_text" }],
        created_at: 1_780_272_002,
        id: "item-exact-second",
        response_id: "response-exact-second",
        role: "user",
        status: "completed",
        type: "message",
      },
    ];
    const provider = createHttpProvider({
      baseUrl: "http://127.0.0.1:4010",
      fetch: async (input, init) => {
        const url = String(input);
        if (init?.method === "POST" && url.endsWith("/v1/sessions")) {
          return new Response(JSON.stringify(snapshot));
        }
        if (init?.method === "POST") {
          sendCount += 1;
          return new Response(
            JSON.stringify(
              sendCount === 1
                ? { pending_id: "pending-first", queued: true }
                : { item_id: "item-exact-second", queued: true },
            ),
            { status: 202 },
          );
        }
        if (url.endsWith("/stream")) {
          return new Response("", {
            headers: { "content-type": "text/event-stream" },
          });
        }
        if (url.includes("/items")) {
          return new Response(
            JSON.stringify({
              data: history,
              first_id: history[0]?.id,
              has_more: false,
              last_id: history.at(-1)?.id,
            }),
          );
        }
        return new Response(JSON.stringify(snapshot));
      },
    });
    const session = await provider.createSession({
      agentSpec: { kind: "named_agent", value: snapshot.agent_id },
      idempotencyKey: "mixed-ack-create",
      runtime: "omnigent",
      targetHarness: "codex",
      title: snapshot.title,
    });
    const first = await provider.sendTurn({
      idempotencyKey: "mixed-ack-first",
      message: "pending first",
      sessionId: session.id,
    });
    const second = await provider.sendTurn({
      idempotencyKey: "mixed-ack-second",
      message: "item second",
      sessionId: session.id,
    });

    await collectAsync(provider.streamEvents(session.id));

    expect(first.turnId).toBe("response-pending-first");
    expect(second.turnId).toBe("response-exact-second");
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

  it("aborts an idle stream when the iterator exits before the first frame", async () => {
    const snapshot = {
      active_response_id: null,
      agent_id: "agent-idle-cancel",
      created_at: 1_780_272_000,
      id: "session-idle-cancel",
      items: [],
      status: "idle",
      title: "Idle cancel",
      updated_at: 1_780_272_000,
    };
    let streamAborted = false;
    let resolveHistoryReady: (() => void) | undefined;
    const historyReady = new Promise<void>((resolve) => {
      resolveHistoryReady = resolve;
    });
    const provider = createHttpProvider({
      baseUrl: "http://127.0.0.1:4010",
      fetch: async (input, init) => {
        const url = String(input);
        if (init?.method === "POST") {
          return new Response(JSON.stringify(snapshot));
        }
        if (url.endsWith("/stream")) {
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
        if (url.includes("/items")) {
          resolveHistoryReady?.();
          return new Response(
            JSON.stringify({
              data: [],
              first_id: null,
              has_more: false,
              last_id: null,
            }),
          );
        }
        return new Response(JSON.stringify(snapshot));
      },
    });
    const session = await provider.createSession({
      agentSpec: { kind: "named_agent", value: snapshot.agent_id },
      idempotencyKey: "idle-cancel-create",
      runtime: "omnigent",
      targetHarness: "codex",
      title: snapshot.title,
    });
    const iterator = provider.streamEvents(session.id)[Symbol.asyncIterator]();
    const pending = iterator.next();
    await historyReady;

    await Promise.race([
      iterator.return?.(),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error("idle iterator return timed out")), 250);
      }),
    ]);

    expect(streamAborted).toBe(true);
    await expect(pending).resolves.toEqual({ done: true, value: undefined });
  });

  it("dedupes a buffered message that commits after stream open", async () => {
    const snapshot = {
      active_response_id: "response-shared",
      agent_id: "agent-message-replay",
      created_at: 1_780_272_000,
      id: "session-message-replay",
      items: [],
      status: "running",
      title: "Message replay",
      updated_at: 1_780_272_002,
    };
    const history = [
      {
        content: [{ text: "A", type: "output_text" }],
        created_at: 1_780_272_001,
        id: "message-a",
        response_id: "response-shared",
        role: "assistant",
        status: "completed",
        type: "message",
      },
      {
        content: [{ text: "B", type: "output_text" }],
        created_at: 1_780_272_002,
        id: "message-b",
        response_id: "response-shared",
        role: "assistant",
        status: "completed",
        type: "message",
      },
    ];
    const provider = createHttpProvider({
      baseUrl: "http://127.0.0.1:4010",
      fetch: async (input, init) => {
        const url = String(input);
        if (init?.method === "POST") {
          return new Response(JSON.stringify(snapshot));
        }
        if (url.endsWith("/stream")) {
          return new Response(
            [
              `data: ${JSON.stringify({
                response: {
                  created_at: 1_780_272_000,
                  id: "response-shared",
                  status: "in_progress",
                },
                type: "response.created",
              })}`,
              "",
              `data: ${JSON.stringify({
                delta: "B",
                index: 0,
                message_id: "message-b",
                type: "response.output_text.delta",
              })}`,
              "",
            ].join("\n"),
            { headers: { "content-type": "text/event-stream" } },
          );
        }
        if (url.includes("/items")) {
          return new Response(
            JSON.stringify({
              data: history,
              first_id: "message-a",
              has_more: false,
              last_id: "message-b",
            }),
          );
        }
        return new Response(JSON.stringify(snapshot));
      },
    });
    const session = await provider.createSession({
      agentSpec: { kind: "named_agent", value: snapshot.agent_id },
      idempotencyKey: "message-replay-create",
      runtime: "omnigent",
      targetHarness: "codex",
      title: snapshot.title,
    });

    const events = await collectAsync(provider.streamEvents(session.id));

    expect(
      events
        .filter((event) => event.type === "runtime.text.delta")
        .map((event) => event.payload.delta),
    ).toEqual(["A", "B"]);
  });

  it("emits a terminal-backed assistant item without preceding text deltas", async () => {
    const snapshot = {
      active_response_id: null,
      agent_id: "agent-item-only",
      created_at: 1_780_272_000,
      id: "session-item-only",
      items: [],
      pending_inputs: [],
      status: "running",
      title: "Item only",
      updated_at: 1_780_272_001,
    };
    const provider = createHttpProvider({
      baseUrl: "http://127.0.0.1:4010",
      fetch: async (input, init) => {
        const url = String(input);
        if (init?.method === "POST") {
          return new Response(JSON.stringify(snapshot));
        }
        if (url.endsWith("/stream")) {
          return new Response(
            [
              `data: ${JSON.stringify({
                response: {
                  created_at: 1_780_272_000,
                  id: "response-item-only",
                  status: "in_progress",
                },
                type: "response.created",
              })}`,
              "",
              `data: ${JSON.stringify({
                item: {
                  content: [{ text: "terminal-backed reply", type: "output_text" }],
                  id: "message-item-only",
                  response_id: "response-item-only",
                  role: "assistant",
                  status: "completed",
                  type: "message",
                },
                type: "response.output_item.done",
              })}`,
              "",
              `data: ${JSON.stringify({
                response: {
                  completed_at: 1_780_272_001,
                  id: "response-item-only",
                  status: "completed",
                },
                type: "response.completed",
              })}`,
              "",
            ].join("\n"),
            { headers: { "content-type": "text/event-stream" } },
          );
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
        return new Response(JSON.stringify(snapshot));
      },
    });
    const session = await provider.createSession({
      agentSpec: { kind: "named_agent", value: snapshot.agent_id },
      idempotencyKey: "item-only-create",
      runtime: "omnigent",
      targetHarness: "custom",
      title: snapshot.title,
    });

    const events = await collectAsync(provider.streamEvents(session.id));

    expect(
      events
        .filter((event) => event.type === "runtime.text.delta")
        .map((event) => event.payload.delta),
    ).toEqual(["terminal-backed reply"]);
    expect(events).toContainEqual(
      expect.objectContaining({
        turnId: "response-item-only",
        type: "runtime.turn.completed",
      }),
    );
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
      {
        response: {
          error: { code: "setup_failed", message: "turn setup failed" },
          id: "response-official-failure",
          status: "failed",
        },
        type: "response.failed",
      },
      {
        conversation_id: snapshot.id,
        response_id: "response-official-failure",
        status: "idle",
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
    const provisionalTurnId = handle.turnId;
    const idleSnapshotInfo = await provider.getSessionInfo(session.id);
    expect(idleSnapshotInfo.activeTurnId).toBe(handle.turnId);
    expect(idleSnapshotInfo.state).toBe("turn_active");

    const events = await collectAsync(provider.streamEvents(session.id));
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          payload: { delta: "continued after idle" },
          turnId: provisionalTurnId,
          type: "runtime.text.delta",
        }),
        expect.objectContaining({
          payload: expect.objectContaining({
            failure: expect.objectContaining({ message: "turn setup failed" }),
            outcome: "failed",
          }),
          turnId: provisionalTurnId,
          type: "runtime.turn.failed",
        }),
      ]),
    );
    expect(
      events.filter((event) => event.type === "runtime.turn.failed"),
    ).toHaveLength(1);
    expect(handle.turnId).toBe("response-official-failure");
    const info = await provider.getSessionInfo(session.id);
    expect(info.activeTurnId).toBeUndefined();
    expect(info.lastError?.message).toBe("turn setup failed");
    expect(info.state).toBe("failed");
  });

  it("reseeds a long-lived stream when a later turn is accepted", async () => {
    const snapshot = {
      active_response_id: null,
      agent_id: "agent-long-lived",
      created_at: 1_780_272_000,
      id: "session-long-lived",
      items: [],
      status: "idle",
      title: "Long lived",
      updated_at: 1_780_272_000,
    };
    let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
    let resolveHistoryReady: (() => void) | undefined;
    const historyReady = new Promise<void>((resolve) => {
      resolveHistoryReady = resolve;
    });
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
          return new Response(
            new ReadableStream<Uint8Array>({
              start(controller) {
                streamController = controller;
              },
            }),
            { headers: { "content-type": "text/event-stream" } },
          );
        }
        if (url.includes("/items")) {
          resolveHistoryReady?.();
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
      idempotencyKey: "long-lived-create",
      runtime: "omnigent",
      targetHarness: "codex",
      title: snapshot.title,
    });
    const iterator = provider.streamEvents(session.id)[Symbol.asyncIterator]();
    const firstEvent = iterator.next();
    await historyReady;

    const handle = await provider.sendTurn({
      idempotencyKey: "long-lived-turn",
      message: "start after stream",
      sessionId: session.id,
    });
    for (const frame of [
      { delta: "late turn output", type: "response.output_text.delta" },
      {
        conversation_id: snapshot.id,
        error: { code: "setup_failed", message: "late setup failed" },
        status: "failed",
        type: "session.status",
      },
    ]) {
      streamController?.enqueue(
        new TextEncoder().encode(`data: ${JSON.stringify(frame)}\n\n`),
      );
    }
    streamController?.close();

    const events = [];
    const first = await firstEvent;
    if (!first.done) {
      events.push(first.value);
    }
    for (;;) {
      const next = await iterator.next();
      if (next.done) {
        break;
      }
      events.push(next.value);
    }
    expect(events).toEqual([
      expect.objectContaining({
        payload: { delta: "late turn output" },
        turnId: handle.turnId,
        type: "runtime.text.delta",
      }),
      expect.objectContaining({
        payload: expect.objectContaining({
          failure: expect.objectContaining({ message: "late setup failed" }),
          outcome: "failed",
        }),
        turnId: handle.turnId,
        type: "runtime.turn.failed",
      }),
    ]);
    const info = await provider.getSessionInfo(session.id);
    expect(info.lastError?.message).toBe("late setup failed");
    expect(info.state).toBe("failed");
  });

  it("does not reseed terminalized ambiguous turns on a later reconnect", async () => {
    const snapshot = {
      active_response_id: null,
      agent_id: "agent-terminal-reconnect",
      created_at: 1_780_272_000,
      id: "session-terminal-reconnect",
      items: [],
      status: "idle",
      title: "Terminal reconnect",
      updated_at: 1_780_272_000,
    };
    const streamControllers: ReadableStreamDefaultController<Uint8Array>[] = [];
    let historyReads = 0;
    let resolveFirstHistory: (() => void) | undefined;
    let resolveSecondHistory: (() => void) | undefined;
    const firstHistoryReady = new Promise<void>((resolve) => {
      resolveFirstHistory = resolve;
    });
    const secondHistoryReady = new Promise<void>((resolve) => {
      resolveSecondHistory = resolve;
    });
    let sendCount = 0;
    const provider = createHttpProvider({
      baseUrl: "http://127.0.0.1:4010",
      fetch: async (input, init) => {
        const url = String(input);
        if (init?.method === "POST" && url.endsWith("/v1/sessions")) {
          return new Response(JSON.stringify(snapshot));
        }
        if (init?.method === "POST" && url.endsWith("/events")) {
          sendCount += 1;
          return new Response(
            JSON.stringify({ item_id: `item-${sendCount}`, queued: true }),
            { status: 202 },
          );
        }
        if (url.endsWith("/stream")) {
          return new Response(
            new ReadableStream<Uint8Array>({
              start(controller) {
                streamControllers.push(controller);
              },
            }),
            { headers: { "content-type": "text/event-stream" } },
          );
        }
        if (url.includes("/items")) {
          historyReads += 1;
          if (historyReads === 1) {
            resolveFirstHistory?.();
          } else if (historyReads === 2) {
            resolveSecondHistory?.();
          }
          const data =
            historyReads < 3
              ? []
              : [
                  {
                    content: [{ text: "one", type: "input_text" }],
                    created_at: 1_780_272_001,
                    id: "item-1",
                    response_id: "response-one",
                    role: "user",
                    status: "completed",
                    type: "message",
                  },
                  {
                    content: [{ text: "two", type: "input_text" }],
                    created_at: 1_780_272_002,
                    id: "item-2",
                    response_id: "response-two",
                    role: "user",
                    status: "completed",
                    type: "message",
                  },
                ];
          return new Response(
            JSON.stringify({
              data,
              first_id: data[0]?.id ?? null,
              has_more: false,
              last_id: data.at(-1)?.id ?? null,
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
      idempotencyKey: "terminal-reconnect-create",
      runtime: "omnigent",
      targetHarness: "codex",
      title: snapshot.title,
    });
    const firstIterator = provider.streamEvents(session.id)[Symbol.asyncIterator]();
    const firstEvent = firstIterator.next();
    await firstHistoryReady;
    const firstHandle = await provider.sendTurn({
      idempotencyKey: "terminal-reconnect-one",
      message: "one",
      sessionId: session.id,
    });
    streamControllers[0]?.enqueue(
      new TextEncoder().encode(
        `data: ${JSON.stringify({
          conversation_id: session.id,
          error: { message: "one failed" },
          status: "failed",
          type: "session.status",
        })}\n\n`,
      ),
    );
    expect(await firstEvent).toEqual(
      expect.objectContaining({
        value: expect.objectContaining({
          turnId: firstHandle.turnId,
          type: "runtime.turn.failed",
        }),
      }),
    );

    const secondHandle = await provider.sendTurn({
      idempotencyKey: "terminal-reconnect-two",
      message: "two",
      sessionId: session.id,
    });
    const secondFailure = firstIterator.next();
    streamControllers[0]?.enqueue(
      new TextEncoder().encode(
        `data: ${JSON.stringify({
          conversation_id: session.id,
          error: { message: "two failed" },
          status: "failed",
          type: "session.status",
        })}\n\n`,
      ),
    );
    expect(await secondFailure).toEqual(
      expect.objectContaining({
        value: expect.objectContaining({
          turnId: secondHandle.turnId,
          type: "runtime.turn.failed",
        }),
      }),
    );
    for (const responseId of ["response-two", "response-one"]) {
      streamControllers[0]?.enqueue(
        new TextEncoder().encode(
          `data: ${JSON.stringify({
            response: {
              error: { message: `${responseId} failed` },
              id: responseId,
              status: "failed",
            },
            type: "response.failed",
          })}\n\n`,
        ),
      );
    }
    streamControllers[0]?.close();
    expect(await firstIterator.next()).toEqual({ done: true, value: undefined });
    expect(firstHandle.turnId).toBe("item-1");
    expect(secondHandle.turnId).toBe("item-2");

    const thirdHandle = await provider.sendTurn({
      idempotencyKey: "terminal-reconnect-three",
      message: "three",
      sessionId: session.id,
    });
    const secondIterator = provider.streamEvents(session.id)[Symbol.asyncIterator]();
    const thirdTerminal = secondIterator.next();
    await secondHistoryReady;
    streamControllers[1]?.enqueue(
      new TextEncoder().encode(
        `data: ${JSON.stringify({
          response: { id: "response-three", status: "completed" },
          type: "response.completed",
        })}\n\n`,
      ),
    );
    expect(await thirdTerminal).toEqual(
      expect.objectContaining({
        value: expect.objectContaining({
          turnId: "response-three",
          type: "runtime.turn.completed",
        }),
      }),
    );
    streamControllers[1]?.close();
    expect(await secondIterator.next()).toEqual({ done: true, value: undefined });
    expect(thirdHandle.turnId).toBe("response-three");
    expect(firstHandle.turnId).toBe("item-1");
    expect(secondHandle.turnId).toBe("item-2");

    await provider.readHistory(session.id);
    expect(firstHandle.turnId).toBe("response-one");
    expect(secondHandle.turnId).toBe("response-two");
  });

  it("keeps rapid accepted turns separate when prior lifecycle arrives late", async () => {
    const snapshot = {
      active_response_id: null,
      agent_id: "agent-rapid-turns",
      created_at: 1_780_272_000,
      id: "session-rapid-turns",
      items: [],
      status: "idle",
      title: "Rapid turns",
      updated_at: 1_780_272_000,
    };
    let sendCount = 0;
    let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
    let resolveHistoryReady: (() => void) | undefined;
    const historyReady = new Promise<void>((resolve) => {
      resolveHistoryReady = resolve;
    });
    const provider = createHttpProvider({
      baseUrl: "http://127.0.0.1:4010",
      fetch: async (input, init) => {
        const url = String(input);
        if (init?.method === "POST" && url.endsWith("/v1/sessions")) {
          return new Response(JSON.stringify(snapshot));
        }
        if (init?.method === "POST" && url.endsWith("/events")) {
          sendCount += 1;
          return new Response(
            JSON.stringify({ item_id: `item-${sendCount}`, queued: true }),
            { status: 202 },
          );
        }
        if (url.endsWith("/stream")) {
          return new Response(
            new ReadableStream<Uint8Array>({
              start(controller) {
                streamController = controller;
              },
            }),
            { headers: { "content-type": "text/event-stream" } },
          );
        }
        if (url.includes("/items")) {
          resolveHistoryReady?.();
          return new Response(
            JSON.stringify({
              data: [],
              first_id: null,
              has_more: false,
              last_id: null,
            }),
          );
        }
        return new Response(
          JSON.stringify(
            sendCount === 2
              ? {
                  ...snapshot,
                  active_response_id: "response-one",
                  status: "running",
                }
              : snapshot,
          ),
        );
      },
    });
    const session = await provider.createSession({
      agentSpec: { kind: "named_agent", value: snapshot.agent_id },
      idempotencyKey: "rapid-create",
      runtime: "omnigent",
      targetHarness: "codex",
      title: snapshot.title,
    });
    const firstHandle = await provider.sendTurn({
      idempotencyKey: "rapid-one",
      message: "one",
      sessionId: session.id,
    });
    const secondHandle = await provider.sendTurn({
      idempotencyKey: "rapid-two",
      message: "two",
      sessionId: session.id,
    });
    const iterator = provider.streamEvents(session.id)[Symbol.asyncIterator]();
    const firstEvent = iterator.next();
    await historyReady;

    streamController?.enqueue(
      new TextEncoder().encode(
        `data: ${JSON.stringify({
          response: { id: "response-one", status: "in_progress" },
          type: "response.created",
        })}\n\n`,
      ),
    );
    expect(await firstEvent).toEqual(
      expect.objectContaining({
        value: expect.objectContaining({
          turnId: "response-one",
          type: "runtime.turn.started",
        }),
      }),
    );
    expect(firstHandle.turnId).toBe("response-one");
    expect(secondHandle.turnId).toBe("item-2");
    expect((await provider.getSessionInfo(session.id)).activeTurnId).toBe(
      "item-2",
    );

    const failedEvent = iterator.next();
    streamController?.enqueue(
      new TextEncoder().encode(
        `data: ${JSON.stringify({
          response: {
            error: { message: "first failed" },
            id: "response-one",
            status: "failed",
          },
          type: "response.failed",
        })}\n\n`,
      ),
    );
    expect(await failedEvent).toEqual(
      expect.objectContaining({
        value: expect.objectContaining({
          turnId: "response-one",
          type: "runtime.turn.failed",
        }),
      }),
    );
    const afterPriorFailure = await provider.getSessionInfo(session.id);
    expect(afterPriorFailure.activeTurnId).toBe("item-2");
    expect(afterPriorFailure.state).toBe("turn_active");

    const secondStarted = iterator.next();
    streamController?.enqueue(
      new TextEncoder().encode(
        `data: ${JSON.stringify({
          response: { id: "response-two", status: "in_progress" },
          type: "response.created",
        })}\n\n`,
      ),
    );
    expect(await secondStarted).toEqual(
      expect.objectContaining({
        value: expect.objectContaining({
          turnId: "response-two",
          type: "runtime.turn.started",
        }),
      }),
    );
    expect(secondHandle.turnId).toBe("response-two");
    expect((await provider.getSessionInfo(session.id)).activeTurnId).toBe(
      "response-two",
    );
    streamController?.close();
    await iterator.return?.();
  });

  it("reconciles a new turn before ignoring a late prior-turn terminal", async () => {
    const snapshot = {
      active_response_id: null,
      agent_id: "agent-late-terminal",
      created_at: 1_780_272_000,
      id: "session-late-terminal",
      items: [],
      status: "idle",
      title: "Late terminal",
      updated_at: 1_780_272_000,
    };
    let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
    let resolveHistoryReady: (() => void) | undefined;
    const historyReady = new Promise<void>((resolve) => {
      resolveHistoryReady = resolve;
    });
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
          return new Response(
            new ReadableStream<Uint8Array>({
              start(controller) {
                streamController = controller;
              },
            }),
            { headers: { "content-type": "text/event-stream" } },
          );
        }
        if (url.includes("/items")) {
          resolveHistoryReady?.();
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
      idempotencyKey: "late-terminal-create",
      runtime: "omnigent",
      targetHarness: "codex",
      title: snapshot.title,
    });
    const firstHandle = await provider.sendTurn({
      idempotencyKey: "late-terminal-first",
      message: "first",
      sessionId: session.id,
    });
    const iterator = provider.streamEvents(session.id)[Symbol.asyncIterator]();
    const firstEvent = iterator.next();
    await historyReady;
    streamController?.enqueue(
      new TextEncoder().encode(
        `data: ${JSON.stringify({
          conversation_id: snapshot.id,
          error: { message: "first turn failed" },
          status: "failed",
          type: "session.status",
        })}\n\n`,
      ),
    );
    expect(await firstEvent).toEqual(
      expect.objectContaining({
        value: expect.objectContaining({
          turnId: firstHandle.turnId,
          type: "runtime.turn.failed",
        }),
      }),
    );

    const secondHandle = await provider.sendTurn({
      idempotencyKey: "late-terminal-second",
      message: "second",
      sessionId: session.id,
    });
    streamController?.enqueue(
      new TextEncoder().encode(
        `data: ${JSON.stringify({
          response: { id: "response-second", status: "in_progress" },
          type: "response.created",
        })}\n\n`,
      ),
    );
    expect(await iterator.next()).toEqual(
      expect.objectContaining({
        value: expect.objectContaining({
          turnId: "response-second",
          type: "runtime.turn.started",
        }),
      }),
    );
    expect(secondHandle.turnId).toBe("response-second");

    const nextEvent = iterator.next();
    streamController?.enqueue(
      new TextEncoder().encode(
        `data: ${JSON.stringify({
          response: {
            error: { message: "first turn failed" },
            id: "response-first",
            status: "failed",
          },
          type: "response.failed",
        })}\n\n`,
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    const afterLateTerminal = await provider.getSessionInfo(session.id);
    expect(afterLateTerminal.activeTurnId).toBe("response-second");
    expect(afterLateTerminal.state).toBe("turn_active");

    streamController?.enqueue(
      new TextEncoder().encode(
        `data: ${JSON.stringify({
          delta: "second turn output",
          type: "response.output_text.delta",
        })}\n\n`,
      ),
    );
    streamController?.close();

    const remaining = [];
    const next = await nextEvent;
    if (!next.done) {
      remaining.push(next.value);
    }
    for (;;) {
      const following = await iterator.next();
      if (following.done) {
        break;
      }
      remaining.push(following.value);
    }
    expect(remaining).toEqual([
      expect.objectContaining({
        payload: { delta: "second turn output" },
        turnId: "response-second",
        type: "runtime.text.delta",
      }),
    ]);
    expect(secondHandle.turnId).toBe("response-second");
    const info = await provider.getSessionInfo(session.id);
    expect(info.activeTurnId).toBe("response-second");
    expect(info.state).toBe("turn_active");
  });

  it("reconciles a provisional handle to the official lifecycle identity", async () => {
    const server = await FakeOmnigentServer.start();
    try {
      const provider = createHttpProvider({ baseUrl: server.baseUrl });
      const session = await provider.createSession({
        agentSpec: { kind: "named_agent", value: "agent-reconcile" },
        idempotencyKey: "reconcile-create",
        runtime: "omnigent",
        targetHarness: "codex",
        title: "Reconcile",
      });
      const handle = await provider.sendTurn({
        idempotencyKey: "reconcile-turn",
        message: "reconcile me",
        sessionId: session.id,
      });
      expect(handle.turnId).toBe("message-user-1");

      const events = await collectAsync(provider.streamEvents(session.id));
      const officialTurnId = events.find(
        (event) => event.type === "runtime.turn.started",
      )?.turnId;
      expect(officialTurnId).toBeDefined();
      expect(handle.turnId).toBe(officialTurnId);
      expect(
        events
          .filter((event) => event.turnId !== undefined)
          .every((event) => event.turnId === officialTurnId),
      ).toBe(true);
    } finally {
      await server.stop();
    }
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
