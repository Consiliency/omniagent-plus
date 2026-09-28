import { describe, expect, it } from "vitest";

import {
  loadOmnigentV010WireContract,
  loadOmnigentV012WireContract,
  loadOmnigentV09WireContract,
} from "./contract-fixtures.js";
import { FakeOmnigentServer } from "./fake-omnigent-server.js";
import { OmnigentHttpClient, OmnigentHttpError } from "./http-client.js";

async function collectAsync<T>(values: AsyncIterable<T>): Promise<T[]> {
  const result: T[] = [];
  for await (const value of values) {
    result.push(value);
  }
  return result;
}

describe("http client", () => {
  it("uses the documented v0.9 wire for session, catalog, history, and stream access", async () => {
    const server = await FakeOmnigentServer.start();

    try {
      const client = new OmnigentHttpClient({
        baseUrl: server.baseUrl,
      });
      const session = await client.createSession({
        agentSpec: { kind: "named_agent", value: "agent-http-client" },
        idempotencyKey: "http-client",
        initialMessage: "initial hello",
        metadata: {
          project_id: "must-not-be-serialized",
          terminal_launch_args: ["--dangerous-untyped-control"],
        },
        repoRoot: "/repo/root",
        runtime: "omnigent",
        targetHarness: "codex",
        title: "HTTP client test",
      });
      await client.sendTurn({
        idempotencyKey: "turn-http-client",
        message: "hello",
        sessionId: session.id,
      });
      await client.getSession(session.id);
      const harnesses = await client.listHarnesses();
      await client.getHistory(session.id);
      await client.listChildSessions(session.id);
      await client.setReadState(session.id, {
        lastSeen: 1_780_000_000,
        unread: true,
      });
      const streamed = await collectAsync(client.streamSession(session.id));

      expect(
        server.requestLog.find(
          (entry) => entry.method === "POST" && entry.path === "/v1/sessions",
        )?.body,
      ).toEqual({
        agent_id: "agent-http-client",
        initial_items: [
          {
            data: {
              content: [{ text: "initial hello", type: "input_text" }],
              role: "user",
            },
            type: "message",
          },
        ],
        title: "HTTP client test",
        workspace: "/repo/root",
      });
      expect(
        server.requestLog.find(
          (entry) =>
            entry.method === "POST" &&
            entry.path === `/v1/sessions/${session.id}/events`,
        )?.body,
      ).toEqual({
        data: {
          content: [{ text: "hello", type: "input_text" }],
          role: "user",
        },
        type: "message",
      });
      expect(
        server.requestLog.map((entry) => `${entry.method} ${entry.path}`),
      ).toEqual(
        expect.arrayContaining([
          "POST /v1/sessions",
          `POST /v1/sessions/${session.id}/events`,
          `GET /v1/sessions/${session.id}`,
          "GET /v1/harnesses",
          `GET /v1/sessions/${session.id}/items`,
          `GET /v1/sessions/${session.id}/child_sessions`,
          `PUT /v1/sessions/${session.id}/read-state`,
          `GET /v1/sessions/${session.id}/stream`,
        ]),
      );
      expect(
        server.requestLog.find(
          (entry) =>
            entry.method === "PUT" &&
            entry.path === `/v1/sessions/${session.id}/read-state`,
        )?.body,
      ).toEqual({
        last_seen: 1_780_000_000,
        unread: true,
      });
      expect(harnesses.local?.[0]).toEqual(
        expect.objectContaining({
          name: "codex",
          public_session_override: false,
        }),
      );
      expect(streamed).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: "snapshot",
            action_id: "baction_metadata_only",
            type: "browser.action_request",
          }),
          expect.objectContaining({
            call_id: "call_metadata_only",
            delta: "metadata-only tool output",
            type: "response.function_call_output.delta",
          }),
        ]),
      );
      expect("importSession" in client).toBe(false);
      expect("autoTitleSession" in client).toBe(false);
    } finally {
      await server.stop();
    }
  });

  it("fails unsupported create specs before network I/O", async () => {
    let requests = 0;
    let resolverCalls = 0;
    const client = new OmnigentHttpClient({
      baseUrl: "http://127.0.0.1:4010",
      fetch: async () => {
        requests += 1;
        return new Response();
      },
      resolveAgentId: () => {
        resolverCalls += 1;
        return "must-not-resolve";
      },
    });

    await expect(
      client.createSession({
        agentSpec: { kind: "inline_spec", value: "{}" },
        idempotencyKey: "unsupported",
        runtime: "omnigent",
        targetHarness: "codex",
        title: "Unsupported",
      }),
    ).rejects.toEqual(
      expect.objectContaining({ category: "backend_capability_missing" }),
    );
    expect(requests).toBe(0);
    expect(resolverCalls).toBe(0);
  });

  it("types resolver rejection before Omnigent network I/O", async () => {
    let requests = 0;
    const client = new OmnigentHttpClient({
      baseUrl: "http://127.0.0.1:4010",
      fetch: async () => {
        requests += 1;
        return new Response();
      },
      resolveAgentId: () => {
        throw new Error("resolver unavailable");
      },
    });

    await expect(
      client.createSession({
        agentSpec: { kind: "named_agent", value: "agent-name" },
        idempotencyKey: "resolver-rejection",
        runtime: "omnigent",
        targetHarness: "codex",
        title: "Resolver rejection",
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        category: "backend_capability_missing",
        retryable: false,
        schema: "runtime_failure.v0.1",
      }),
    );
    expect(requests).toBe(0);
  });

  it("rejects unknown session status as a malformed external response", async () => {
    const client = new OmnigentHttpClient({
      baseUrl: "http://127.0.0.1:4010",
      fetch: async () =>
        new Response(
          JSON.stringify({
            agent_id: "agent-malformed-status",
            created_at: 1_780_272_000,
            id: "session-malformed-status",
            items: [],
            status: "surprising",
            title: "Malformed",
          }),
        ),
    });

    await expect(client.getSession("session-malformed-status")).rejects.toEqual(
      expect.objectContaining({ category: "malformed_response" }),
    );
  });

  it("walks every cursor page and rejects a cursor that does not advance", async () => {
    const server = await FakeOmnigentServer.start({ pageSize: 1 });
    try {
      const client = new OmnigentHttpClient({ baseUrl: server.baseUrl });
      for (const value of ["one", "two", "three"]) {
        await client.createSession({
          agentSpec: { kind: "named_agent", value: `agent-${value}` },
          idempotencyKey: value,
          runtime: "omnigent",
          targetHarness: "codex",
          title: value,
        });
      }
      expect(await client.listSessions()).toHaveLength(3);
      expect(
        server.requestLog.filter(
          (entry) => entry.method === "GET" && entry.path === "/v1/sessions",
        ),
      ).toHaveLength(3);
    } finally {
      await server.stop();
    }

    const stagnant = await FakeOmnigentServer.start({
      pageSize: 1,
      stagnantPagination: true,
    });
    try {
      const client = new OmnigentHttpClient({ baseUrl: stagnant.baseUrl });
      for (const value of ["one", "two", "three"]) {
        await client.createSession({
          agentSpec: { kind: "named_agent", value: `agent-${value}` },
          idempotencyKey: value,
          runtime: "omnigent",
          targetHarness: "codex",
          title: value,
        });
      }
      await expect(client.listSessions()).rejects.toEqual(
        expect.objectContaining({ category: "malformed_response" }),
      );
    } finally {
      await stagnant.stop();
    }
  });

  it("rejects empty continuing pages for every paginated endpoint", async () => {
    for (const request of [
      (client: OmnigentHttpClient) => client.listSessions(),
      (client: OmnigentHttpClient) => client.getHistory("session-empty-page"),
      (client: OmnigentHttpClient) =>
        client.listChildSessions("session-empty-page"),
    ]) {
      const client = new OmnigentHttpClient({
        baseUrl: "http://127.0.0.1:4010",
        fetch: async () =>
          new Response(
            JSON.stringify({
              data: [],
              first_id: null,
              has_more: true,
              last_id: "cursor-after-empty-page",
            }),
          ),
      });

      await expect(request(client)).rejects.toEqual(
        expect.objectContaining({ category: "malformed_response" }),
      );
    }
  });

  it("v0.15 D restarts a stale cursor from page one and discards abandoned rows", async () => {
    const requests: string[] = [];
    const row = (id: string) => ({
      agent_id: "agent-pagination", created_at: 1_780_272_000, id,
      status: "idle", title: id, updated_at: 1_780_272_000,
    });
    const client = new OmnigentHttpClient({
      baseUrl: "http://127.0.0.1:4010",
      fetch: async (input) => {
        const url = new URL(String(input));
        requests.push(url.search);
        if (requests.length === 2) {
          return new Response(JSON.stringify({ error: { code: "stale_cursor", message: "deleted" } }), { status: 400 });
        }
        const id = requests.length === 1 ? "abandoned" : "current";
        return new Response(JSON.stringify({
          data: requests.length === 4 ? [] : [row(id)],
          has_more: requests.length !== 4,
          last_id: id,
        }));
      },
    });

    expect((await client.listSessions()).map((session) => session.id)).toEqual(["current"]);
    expect(requests).toHaveLength(4);
    expect(requests[0]).toBe(requests[2]);
  });

  it("v0.15 D bounds stale recovery independently for all three paginated GETs", async () => {
    const rows = {
      session: { agent_id: "agent-d", created_at: 1_780_272_000, id: "session-d", status: "idle", title: "D", updated_at: 1_780_272_000 },
      item: { created_at: 1_780_272_000, id: "item-d", response_id: "response-d", status: "completed", type: "message", role: "assistant", content: [] },
      child: { created_at: 1_780_272_000, id: "child-d", parent_session_id: "session-d", updated_at: 1_780_272_000 },
    };
    for (const [kind, request] of [
      ["session", (client: OmnigentHttpClient) => client.listSessions()],
      ["item", (client: OmnigentHttpClient) => client.getHistory("session-d")],
      ["child", (client: OmnigentHttpClient) => client.listChildSessions("session-d")],
    ] as const) {
      const cursors: (string | null)[] = [];
      const client = new OmnigentHttpClient({
        baseUrl: "http://127.0.0.1:4010",
        fetch: async (input) => {
          const after = new URL(String(input)).searchParams.get("after");
          cursors.push(after);
          return after === null
            ? new Response(JSON.stringify({ data: [rows[kind]], has_more: true, last_id: rows[kind].id }))
            : new Response(JSON.stringify({ error: { code: "stale_cursor", message: "gone" } }), { status: 400 });
        },
      });
      await expect(request(client)).rejects.toEqual(expect.objectContaining({
        body: { error: { code: "stale_cursor", message: "gone" } },
        statusCode: 400,
      }));
      expect(cursors).toEqual([null, rows[kind].id, null, rows[kind].id]);
    }
  });

  it("v0.15 D restarts history and child-list reads without old partial rows", async () => {
    for (const [kind, request] of [
      ["item", (client: OmnigentHttpClient) => client.getHistory("session-d")],
      ["child", (client: OmnigentHttpClient) => client.listChildSessions("session-d")],
    ] as const) {
      let requests = 0;
      const row = (id: string) => kind === "item"
        ? { created_at: 1_780_272_000, id, response_id: "response-d", status: "completed", type: "message", role: "assistant", content: [] }
        : { created_at: 1_780_272_000, id, parent_session_id: "session-d", updated_at: 1_780_272_000 };
      const client = new OmnigentHttpClient({
        baseUrl: "http://127.0.0.1:4010",
        fetch: async () => {
          requests += 1;
          if (requests === 2) return new Response(JSON.stringify({ error: { code: "stale_cursor" } }), { status: 400 });
          return new Response(JSON.stringify({
            data: requests === 4 ? [] : [row(requests === 1 ? "abandoned" : "current")],
            has_more: requests !== 4, last_id: requests === 1 ? "abandoned" : "current",
          }));
        },
      });
      expect((await request(client)).map((entry) => entry.id)).toEqual(["current"]);
      expect(requests).toBe(4);
    }
  });

  it("v0.15 D does not restart first-page or noncanonical cursor errors", async () => {
    for (const [firstPage, body] of [
      [true, { error: { code: "stale_cursor" } }],
      [false, { detail: { code: "stale_cursor" } }],
      [false, { error: { code: "stale_cursor_like" } }],
      [false, "stale_cursor"],
      [false, { error: ["stale_cursor"] }],
    ] as const) {
      let requests = 0;
      const client = new OmnigentHttpClient({
        baseUrl: "http://127.0.0.1:4010",
        fetch: async () => {
          requests += 1;
          return !firstPage && requests === 1
            ? new Response(JSON.stringify({ data: [{ agent_id: "agent-d", created_at: 1_780_272_000, id: "session-d", status: "idle", updated_at: 1_780_272_000 }], has_more: true, last_id: "session-d" }))
            : new Response(JSON.stringify(body), { status: 400 });
        },
      });
      await expect(client.listSessions()).rejects.toEqual(expect.objectContaining({ body, statusCode: 400 }));
      expect(requests).toBe(firstPage ? 1 : 2);
    }
  });

  it("normalizes nullable session wire and preserves child routing metadata", async () => {
    const wire = loadOmnigentV09WireContract();
    const client = new OmnigentHttpClient({
      baseUrl: "http://127.0.0.1:4010",
      fetch: async (input) =>
        new Response(
          JSON.stringify(
            String(input).includes("child_sessions")
              ? wire.child_page
              : wire.session_response,
          ),
          { status: 200 },
        ),
    });

    const session = await client.getSession("session-123");
    expect(session).toEqual(
      expect.objectContaining({
        activeResponseId: null,
        agentId: "agent-session-123",
        createdAt: "2026-06-01T00:00:00.000Z",
        subagentRoutingOverride: "smart",
        title: "Omnigent session session-123",
        updatedAt: "2026-06-01T00:00:01.000Z",
      }),
    );
    const children = await client.listChildSessions("session-123");
    expect(children).toEqual([
      expect.objectContaining({
        busy: true,
        current_task_status: "in_progress",
        parent_session_id: "session-123",
        routed_model: "model-routed",
        routing_decision_id: "route-1",
      }),
    ]);
    expect(children[0]).not.toHaveProperty("status");
  });

  it("preserves v0.12 background-task detail without making snapshots brittle", async () => {
    const wire = loadOmnigentV012WireContract();
    const response = {
      ...wire.session_response,
      background_tasks: [
        ...(wire.session_response.background_tasks ?? []),
        { description: "partial", id: 42, future: "preserved" },
        false,
      ],
    };
    const client = new OmnigentHttpClient({
      baseUrl: "http://127.0.0.1:4010",
      fetch: async () => new Response(JSON.stringify(response)),
    });

    const session = await client.getSession("session-123");
    expect(session.backgroundTasks).toEqual([
      expect.objectContaining({
        command: "sleep 120",
        future_detail: "preserved",
        id: "shell-1",
      }),
      expect.objectContaining({ description: "partial", future: "preserved" }),
    ]);
    expect(session.backgroundTasks?.[1]).not.toHaveProperty("id");

    const malformedTopLevel = new OmnigentHttpClient({
      baseUrl: "http://127.0.0.1:4010",
      fetch: async () =>
        new Response(JSON.stringify({ ...response, background_tasks: "future" })),
    });
    await expect(malformedTopLevel.getSession("session-123")).resolves.toEqual(
      expect.objectContaining({ backgroundTasks: undefined }),
    );
  });

  it("accepts absent, null, and string task summaries across child pages", async () => {
    const wire = loadOmnigentV010WireContract();
    const firstPage = {
      ...wire.child_page,
      has_more: true,
    };
    const omittedSummary = {
      agent_id: "agent-child-omitted",
      busy: false,
      created_at: 1_780_272_014,
      id: "child-task-summary-omitted",
      parent_session_id: "session-123",
      title: "Child With Omitted Summary",
      updated_at: 1_780_272_015,
    };
    const client = new OmnigentHttpClient({
      baseUrl: "http://127.0.0.1:4010",
      fetch: async (input) =>
        new Response(
          JSON.stringify(
            String(input).includes("after=")
              ? {
                  data: [omittedSummary],
                  first_id: omittedSummary.id,
                  has_more: false,
                  last_id: omittedSummary.id,
                }
              : firstPage,
          ),
        ),
    });

    const children = await client.listChildSessions("session-123");

    expect(children.map(({ task_summary }) => task_summary)).toEqual([
      "Inspect the tagged v0.10 transport contract.",
      null,
      undefined,
    ]);
  });

  it("rejects malformed task summaries at the HTTP boundary", async () => {
    for (const taskSummary of [42, false, {}, []]) {
      const client = new OmnigentHttpClient({
        baseUrl: "http://127.0.0.1:4010",
        fetch: async () =>
          new Response(
            JSON.stringify({
              data: [
                {
                  created_at: 1_780_272_010,
                  id: "child-malformed-task-summary",
                  parent_session_id: "session-123",
                  task_summary: taskSummary,
                  updated_at: 1_780_272_011,
                },
              ],
              first_id: "child-malformed-task-summary",
              has_more: false,
              last_id: "child-malformed-task-summary",
            }),
          ),
      });

      await expect(client.listChildSessions("session-123")).rejects.toEqual(
        expect.objectContaining({
          category: "malformed_response",
          retryable: false,
        }),
      );
    }
  });

  it("accepts an official session response without optional items", async () => {
    const wire = loadOmnigentV09WireContract();
    const sessionResponse = wire.session_response as Record<string, unknown>;
    const { items: _items, ...withoutItems } = sessionResponse;
    const client = new OmnigentHttpClient({
      baseUrl: "http://127.0.0.1:4010",
      fetch: async () => new Response(JSON.stringify(withoutItems)),
    });

    await expect(client.getSession("session-123")).resolves.toEqual(
      expect.objectContaining({
        agentId: "agent-session-123",
        items: [],
      }),
    );
  });

  it("normalizes official flat conversation item rows", async () => {
    const wire = loadOmnigentV09WireContract();
    const client = new OmnigentHttpClient({
      baseUrl: "http://127.0.0.1:4010",
      fetch: async () =>
        new Response(
          JSON.stringify({
            data: wire.conversation_items,
            first_id: "message-user",
            has_more: false,
            last_id: "error",
          }),
        ),
    });

    const items = await client.getHistory("session-123");
    expect(items[0]).toEqual(
      expect.objectContaining({
        content: [{ text: "question", type: "input_text" }],
        role: "user",
      }),
    );
    expect(items[0]).not.toHaveProperty("data");
  });

  it("normalizes nested conversation items embedded in a session response", async () => {
    const wire = loadOmnigentV09WireContract();
    const sessionResponse = wire.session_response as Record<string, unknown>;
    expect((sessionResponse.items as unknown[])[0]).toEqual(
      expect.objectContaining({
        data: expect.objectContaining({ role: "assistant" }),
      }),
    );
    const client = new OmnigentHttpClient({
      baseUrl: "http://127.0.0.1:4010",
      fetch: async () => new Response(JSON.stringify(sessionResponse)),
    });

    const session = await client.getSession("session-123");
    expect(session.items[0]).toEqual(
      expect.objectContaining({
        content: [{ text: "snapshot answer", type: "output_text" }],
        role: "assistant",
      }),
    );
    expect(session.items[0]).not.toHaveProperty("data");
    expect(session.pendingInputs).toEqual([
      {
        content: [{ text: "pending snapshot", type: "input_text" }],
        pendingId: "pending-snapshot-1",
      },
    ]);
  });

  it("rejects malformed session and child page rows", async () => {
    for (const [path, row] of [
      [
        "/v1/sessions",
        {
          agent_id: "agent-unknown-status",
          created_at: 1_780_272_000,
          id: "session-unknown-status",
          status: "surprising",
          title: "Unknown",
          updated_at: 1_780_272_000,
        },
      ],
      [
        "/v1/sessions",
        {
          created_at: 1_780_272_000,
          id: "session-missing-agent",
          status: "idle",
          updated_at: 1_780_272_000,
        },
      ],
      [
        "/v1/sessions",
        {
          agent_id: "agent-missing-updated",
          created_at: 1_780_272_000,
          id: "session-missing-updated",
          status: "idle",
        },
      ],
      [
        "/v1/sessions",
        {
          agent_id: "agent-launching",
          created_at: 1_780_272_000,
          id: "session-launching",
          status: "launching",
          updated_at: 1_780_272_000,
        },
      ],
      [
        "/child_sessions",
        {
          created_at: "not-an-epoch",
          id: "child-invalid-epoch",
          parent_session_id: "session-parent",
          title: "Invalid epoch",
          updated_at: 1_780_272_000,
        },
      ],
    ] as const) {
      const client = new OmnigentHttpClient({
        baseUrl: "http://127.0.0.1:4010",
        fetch: async () =>
          new Response(
            JSON.stringify({
              data: [row],
              first_id: row.id,
              has_more: false,
              last_id: row.id,
            }),
          ),
      });

      const request = path === "/v1/sessions"
        ? client.listSessions()
        : client.listChildSessions("session-parent");
      await expect(request).rejects.toEqual(
        expect.objectContaining({ category: "malformed_response" }),
      );
    }
  });

  it("raises structured HTTP errors for invalid event requests", async () => {
    const server = await FakeOmnigentServer.start();

    try {
      const client = new OmnigentHttpClient({
        baseUrl: server.baseUrl,
      });
      const session = await client.createSession({
        agentSpec: { kind: "named_agent", value: "agent-http-error" },
        idempotencyKey: "http-client-error",
        runtime: "omnigent",
        targetHarness: "codex",
        title: "HTTP error test",
      });

      await expect(
        client.sendEvent(session.id, {
          data: {},
          type: "compact",
        }),
      ).rejects.toBeInstanceOf(OmnigentHttpError);
    } finally {
      await server.stop();
    }
  });

  it("preserves every structured v0.10 HTTP error field", async () => {
    const fixture = loadOmnigentV010WireContract().structured_error;
    const client = new OmnigentHttpClient({
      baseUrl: "http://127.0.0.1:4010",
      fetch: async () =>
        new Response(JSON.stringify(fixture.body), {
          headers: fixture.headers,
          status: fixture.status_code,
        }),
    });

    const request = client.getSession("session-structured-error");
    await expect(request).rejects.toEqual(
      expect.objectContaining({
        body: fixture.body,
        headers: expect.objectContaining(fixture.headers),
        statusCode: fixture.status_code,
      }),
    );
  });

  it("rejects malformed event acknowledgement shapes", async () => {
    for (const ack of [
      {},
      { denied: true, queued: false },
      { item_id: "", queued: true },
      { item_id: "message-only-id", queued: false },
      { pending_id: 42, queued: true },
      { pending_id: "pending-only-id", queued: false },
    ]) {
      const client = new OmnigentHttpClient({
        baseUrl: "http://127.0.0.1:4010",
        fetch: async () => new Response(JSON.stringify(ack), { status: 202 }),
      });

      await expect(
        client.sendEvent("session-malformed-ack", {
          data: {},
          type: "compact",
        }),
      ).rejects.toEqual(
        expect.objectContaining({
          category: "malformed_response",
          retryable: false,
          scope: "turn",
        }),
      );
    }
  });

  it("accepts queued-false control acknowledgements but not for send-turn", async () => {
    const client = new OmnigentHttpClient({
      baseUrl: "http://127.0.0.1:4010",
      fetch: async () =>
        new Response(JSON.stringify({ queued: false }), { status: 202 }),
    });

    await expect(
      client.sendEvent("session-control-ack", {
        data: {},
        type: "interrupt",
      }),
    ).resolves.toEqual({ queued: false });
    await expect(
      client.sendTurn({
        idempotencyKey: "turn-control-ack",
        message: "hello",
        sessionId: "session-control-ack",
      }),
    ).rejects.toEqual(
      expect.objectContaining({ category: "malformed_response" }),
    );
  });
});
