import { describe, expect, it } from "vitest";

import { loadOmnigentV09WireContract } from "./contract-fixtures.js";
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

  it("rejects unknown session status as a malformed external response", async () => {
    const client = new OmnigentHttpClient({
      baseUrl: "http://127.0.0.1:4010",
      fetch: async () =>
        new Response(
          JSON.stringify({
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
        createdAt: "2026-06-01T00:00:00.000Z",
        subagentRoutingOverride: "smart",
        title: "Omnigent session session-123",
        updatedAt: "2026-06-01T00:00:01.000Z",
      }),
    );
    expect(await client.listChildSessions("session-123")).toEqual([
      expect.objectContaining({
        routed_model: "model-routed",
        routing_decision_id: "route-1",
      }),
    ]);
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
});
