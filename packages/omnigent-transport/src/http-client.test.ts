import { describe, expect, it } from "vitest";

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
  it("uses only documented v0.4 endpoints for session, catalog, history, and stream access", async () => {
    const server = await FakeOmnigentServer.start();

    try {
      const client = new OmnigentHttpClient({
        baseUrl: server.baseUrl,
      });
      const session = await client.createSession({
        idempotencyKey: "http-client",
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
      await collectAsync(client.streamSession(session.id));

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
    } finally {
      await server.stop();
    }
  });

  it("raises structured HTTP errors for invalid event requests", async () => {
    const server = await FakeOmnigentServer.start();

    try {
      const client = new OmnigentHttpClient({
        baseUrl: server.baseUrl,
      });
      const session = await client.createSession({
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
