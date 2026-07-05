import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import {
  loadOmnigentCliSurface,
  loadOmnigentEventFixture,
  loadOmnigentFakeServerScenarios,
} from "./contract-fixtures.js";
import type {
  OmnigentEventAck,
  OmnigentHarnessCatalogResponse,
  OmnigentRawEvent,
  OmnigentSendEventInput,
  OmnigentSessionSnapshot,
} from "./types.js";

export interface FakeOmnigentServerOptions {
  readonly activeResponseId?: string;
  readonly malformedFrameBeforeValid?: boolean;
  readonly rejectNextTurnWith?: "auth" | "billing" | "policy" | "rate_limit";
  readonly streamDisconnect?: boolean;
}

export interface FakeOmnigentRequestLogEntry {
  readonly body?: unknown;
  readonly method: string;
  readonly path: string;
}

interface FakeSessionRecord {
  snapshot: OmnigentSessionSnapshot;
  stream: OmnigentRawEvent[];
}

function timestamp(offsetMs = 0): string {
  return new Date(Date.parse("2026-06-30T00:00:00.000Z") + offsetMs).toISOString();
}

function cloneSnapshot(snapshot: OmnigentSessionSnapshot): OmnigentSessionSnapshot {
  return {
    ...snapshot,
    items: snapshot.items.map((item) => ({
      ...item,
      event: {
        ...item.event,
      },
    })),
    metadata: snapshot.metadata === undefined ? undefined : { ...snapshot.metadata },
  };
}

function buildSessionCreatedEvent(sessionId: string, title: string): OmnigentRawEvent {
  return {
    id: `${sessionId}-created`,
    itemId: `${sessionId}-created`,
    message: title,
    occurredAt: timestamp(),
    sessionId,
    status: "idle",
    type: "session.created",
  };
}

function buildNormalTerminalEvents(
  sessionId: string,
  turnId: string,
  message: string,
): OmnigentRawEvent[] {
  const fixture = loadOmnigentEventFixture("normal-terminal");
  return (fixture.events ?? []).map((event, index) => ({
    delta:
      event.type === "response.output_text.delta" ? `Echo: ${message}` : undefined,
    id: `${turnId}-${index + 1}`,
    itemId: event.type === "[DONE]" ? undefined : `${turnId}-${index + 1}`,
    message:
      event.type === "response.created" || event.type === "turn.started"
        ? message
        : undefined,
    occurredAt: timestamp((index + 1) * 1000),
    outputText:
      event.type === "response.completed" ? `Echo: ${message}` : undefined,
    reason: event.reason,
    sessionId,
    status:
      event.type === "session.status" && event.status
        ? (event.status as OmnigentRawEvent["status"])
        : undefined,
    terminal: event.terminal,
    turnId:
      event.type.startsWith("response.") || event.type.startsWith("turn.")
        ? turnId
        : undefined,
    type: event.type as OmnigentRawEvent["type"],
  }));
}

function buildCancelEvents(sessionId: string, turnId: string): OmnigentRawEvent[] {
  const fixture = loadOmnigentEventFixture("cancel-interrupt");
  return (fixture.events ?? []).map((event, index) => ({
    id: `${turnId}-cancel-${index + 1}`,
    itemId: `${turnId}-cancel-${index + 1}`,
    occurredAt: timestamp((index + 10) * 1000),
    reason: event.reason,
    sessionId,
    status:
      event.type === "session.status" && event.status
        ? (event.status as OmnigentRawEvent["status"])
        : undefined,
    terminal: event.terminal,
    turnId: event.type.startsWith("response.") ? turnId : undefined,
    type: event.type as OmnigentRawEvent["type"],
  }));
}

function buildV04NoopEvents(sessionId: string, turnId: string): OmnigentRawEvent[] {
  const fixture = loadOmnigentEventFixture("v0-4-noop-events");
  return (fixture.events ?? []).map((event, index) => ({
    attempt: event.type === "response.retry" ? 1 : undefined,
    delay_seconds: event.type === "response.retry" ? 2 : undefined,
    elicitation_id:
      event.type === "response.elicitation_request" ? `${turnId}-elicitation` : undefined,
    error:
      event.type === "response.error"
        ? { message: "metadata-only error event" }
        : undefined,
    id: `${turnId}-v04-${index + 1}`,
    itemId: `${turnId}-v04-${index + 1}`,
    occurredAt: timestamp((index + 30) * 1000),
    reason: event.reason,
    reasoning_effort:
      event.type === "session.reasoning_effort" ? "medium" : undefined,
    response_id: event.type.startsWith("response.") ? turnId : undefined,
    sessionId,
    terminal: event.terminal,
    total_cost_usd: event.type === "session.usage" ? 0 : undefined,
    turnId: event.type.startsWith("response.") ? turnId : undefined,
    type: event.type as OmnigentRawEvent["type"],
    usage_by_model:
      event.type === "session.usage" ? { "metadata-only": {} } : undefined,
  }));
}

function harnessCatalog(): OmnigentHarnessCatalogResponse {
  return {
    local: [
      {
        capability: "native-terminal",
        name: "codex",
        public_session_override: false,
      },
      {
        capability: "native-terminal",
        name: "claude",
        public_session_override: false,
      },
    ],
    sdk: [
      {
        capability: "sdk",
        name: "openai-agents",
        public_session_override: false,
      },
    ],
  };
}

function readBody(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      if (body.length === 0) {
        resolve(undefined);
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function writeJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify(body));
}

function stripQuery(pathname: string): string {
  return pathname.split("?")[0] ?? pathname;
}

export class FakeOmnigentServer {
  readonly requestLog: FakeOmnigentRequestLogEntry[] = [];
  readonly scenarioCatalog = loadOmnigentFakeServerScenarios();

  baseUrl = "";

  private readonly options: FakeOmnigentServerOptions;
  private rejectNextTurnWith: FakeOmnigentServerOptions["rejectNextTurnWith"];
  private readonly sessions = new Map<string, FakeSessionRecord>();
  private server = createServer((request, response) => {
    void this.handleRequest(request, response);
  });

  private constructor(options: FakeOmnigentServerOptions = {}) {
    this.options = options;
    this.rejectNextTurnWith = options.rejectNextTurnWith;
  }

  static async start(
    options: FakeOmnigentServerOptions = {},
  ): Promise<FakeOmnigentServer> {
    const server = new FakeOmnigentServer(options);
    await new Promise<void>((resolve) => {
      server.server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.server.address() as AddressInfo;
    server.baseUrl = `http://127.0.0.1:${address.port}`;
    return server;
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  private async handleRequest(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    const method = request.method ?? "GET";
    const path = stripQuery(request.url ?? "/");
    const body = method === "GET" ? undefined : await readBody(request);
    this.requestLog.push({ body, method, path });

    if (method === "GET" && path === "/v1/harnesses") {
      writeJson(response, 200, harnessCatalog());
      return;
    }

    if (method === "POST" && path === "/v1/sessions") {
      const payload = (body ?? {}) as Record<string, unknown>;
      const idempotencyKey = String(payload.idempotencyKey ?? "session");
      const sessionId = `session-${idempotencyKey}`;
      const title = String(payload.title ?? "Omnigent session");
      const created = buildSessionCreatedEvent(sessionId, title);
      const snapshot: OmnigentSessionSnapshot = {
        active_response_id: this.options.activeResponseId,
        backend: "omnigent-http",
        createdAt: created.occurredAt,
        id: sessionId,
        items: [{ id: created.itemId ?? created.id, event: created }],
        metadata: {
          commands: loadOmnigentCliSurface().documented_commands.slice(0, 4),
          targetHarness: payload.targetHarness,
        },
        status: this.options.activeResponseId ? "running" : "idle",
        title,
        updatedAt: created.occurredAt,
      };
      this.sessions.set(sessionId, {
        snapshot,
        stream: [created],
      });
      writeJson(response, 200, cloneSnapshot(snapshot));
      return;
    }

    if (method === "GET" && path === "/v1/sessions") {
      writeJson(
        response,
        200,
        Array.from(this.sessions.values()).map((record) =>
          cloneSnapshot(record.snapshot),
        ),
      );
      return;
    }

    const sessionIdMatch =
      /^\/v1\/sessions\/([^/]+)(?:\/(items|stream|child_sessions|events|switch-agent|read-state))?$/.exec(
        path,
      );
    if (sessionIdMatch) {
      const sessionId = decodeURIComponent(sessionIdMatch[1] ?? "");
      const action = sessionIdMatch[2] ?? "";
      const record = this.sessions.get(sessionId);
      if (!record) {
        writeJson(response, 404, { error: "session not found" });
        return;
      }

      if (method === "GET" && action === "") {
        writeJson(response, 200, cloneSnapshot(record.snapshot));
        return;
      }

      if (method === "PATCH" && action === "") {
        const nextMetadata = {
          ...(record.snapshot.metadata ?? {}),
          ...((body as Record<string, unknown> | undefined) ?? {}),
        };
        record.snapshot = {
          ...record.snapshot,
          metadata: nextMetadata,
          updatedAt: timestamp(500),
        };
        writeJson(response, 200, cloneSnapshot(record.snapshot));
        return;
      }

      if (method === "DELETE" && action === "") {
        this.sessions.delete(sessionId);
        response.statusCode = 204;
        response.end();
        return;
      }

      if (method === "GET" && action === "items") {
        writeJson(response, 200, record.snapshot.items.map((item) => ({ ...item })));
        return;
      }

      if (method === "GET" && action === "child_sessions") {
        writeJson(response, 200, []);
        return;
      }

      if (method === "PUT" && action === "read-state") {
        const payload = (body ?? {}) as Record<string, unknown>;
        const lastSeen = Number(payload.last_seen);
        const unread = Boolean(payload.unread);
        record.snapshot = {
          ...record.snapshot,
          updatedAt: timestamp(750),
          viewerLastSeen: lastSeen,
          viewerUnread: unread,
          viewer_last_seen: lastSeen,
          viewer_unread: unread,
        };
        response.statusCode = 204;
        response.end();
        return;
      }

      if (method === "POST" && action === "switch-agent") {
        writeJson(response, 200, {
          switched: true,
        });
        return;
      }

      if (method === "POST" && action === "events") {
        const event = (body ?? {}) as OmnigentSendEventInput;
        if (event.type === "message" && this.rejectNextTurnWith) {
          const rejection = this.rejectNextTurnWith;
          this.rejectNextTurnWith = undefined;
          if (rejection === "rate_limit") {
            response.setHeader("retry-after", "60");
            writeJson(response, 429, {
              error: "usage cap reached",
            });
            return;
          }
          if (rejection === "billing") {
            writeJson(response, 403, { error: "billing issue" });
            return;
          }
          if (rejection === "policy") {
            writeJson(response, 403, { error: "policy blocked" });
            return;
          }
          writeJson(response, 403, { error: "auth required" });
          return;
        }

        if (event.type === "message") {
          const turnId = `turn-${record.snapshot.items.length + 1}`;
          const message = String(event.data.message ?? "send turn");
          const rawEvents = [
            ...buildNormalTerminalEvents(sessionId, turnId, message),
            ...buildV04NoopEvents(sessionId, turnId),
          ];
          record.stream.push(...rawEvents);
          record.snapshot = {
            ...record.snapshot,
            activeTurnId: undefined,
            active_response_id: undefined,
            items: [
              ...record.snapshot.items,
              ...rawEvents
                .filter((item) => item.type !== "[DONE]")
                .map((item) => ({
                  id: item.itemId ?? item.id,
                  event: item,
                })),
            ],
            status: "idle",
            updatedAt: timestamp(9000),
          };
          writeJson(response, 200, {
            queued: true,
            sessionId,
            turnId,
          } satisfies OmnigentEventAck);
          return;
        }

        if (event.type === "interrupt") {
          const turnId =
            record.snapshot.activeTurnId ??
            `turn-${record.snapshot.items.length + 1}`;
          const rawEvents = buildCancelEvents(sessionId, turnId);
          record.stream.push(...rawEvents);
          record.snapshot = {
            ...record.snapshot,
            items: [
              ...record.snapshot.items,
              ...rawEvents.map((item) => ({
                id: item.itemId ?? item.id,
                event: item,
              })),
            ],
            status: "idle",
            updatedAt: timestamp(12000),
          };
          writeJson(response, 200, {
            queued: false,
            sessionId,
            turnId,
          } satisfies OmnigentEventAck);
          return;
        }

        if (event.type === "stop_session") {
          record.snapshot = {
            ...record.snapshot,
            activeTurnId: undefined,
            status: "idle",
            updatedAt: timestamp(15000),
          };
          writeJson(response, 200, {
            queued: false,
            sessionId,
            turnId: record.snapshot.activeTurnId ?? "logical-close",
          } satisfies OmnigentEventAck);
          return;
        }

        writeJson(response, 400, { error: "unsupported event type" });
        return;
      }

      if (method === "GET" && action === "stream") {
        if (this.options.streamDisconnect) {
          response.destroy(new Error("simulated disconnect"));
          return;
        }
        response.statusCode = 200;
        response.setHeader("content-type", "text/event-stream");
        response.setHeader("cache-control", "no-cache");
        response.flushHeaders();

        if (this.options.malformedFrameBeforeValid) {
          response.write("data: not-json\n\n");
          response.write('data: "still not an object"\n\n');
          response.write('data: {"type":"unknown.event"}\n\n');
        }

        for (const item of record.stream) {
          if (item.type === "[DONE]") {
            response.write("data: [DONE]\n\n");
            continue;
          }
          response.write(`data: ${JSON.stringify(item)}\n\n`);
        }
        response.write("data: [DONE]\n\n");
        response.end();
        return;
      }
    }

    const forkMatch = /^\/v1\/sessions\/([^/]+)\/fork$/.exec(path);
    if (method === "POST" && forkMatch) {
      const sourceId = decodeURIComponent(forkMatch[1] ?? "");
      const sourceRecord = this.sessions.get(sourceId);
      if (!sourceRecord) {
        writeJson(response, 404, { error: "source session not found" });
        return;
      }
      const forkedId = `${sourceId}-fork`;
      const forkedSnapshot: OmnigentSessionSnapshot = {
        ...cloneSnapshot(sourceRecord.snapshot),
        id: forkedId,
        title: `${sourceRecord.snapshot.title} fork`,
      };
      this.sessions.set(forkedId, {
        snapshot: forkedSnapshot,
        stream: [...sourceRecord.stream],
      });
      writeJson(response, 200, forkedSnapshot);
      return;
    }

    writeJson(response, 404, { error: "route not found" });
  }
}
