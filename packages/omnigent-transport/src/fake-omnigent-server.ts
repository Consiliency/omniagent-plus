import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import { loadOmnigentFakeServerScenarios } from "./contract-fixtures.js";
import type {
  OmnigentChildSessionSummary,
  OmnigentConversationItem,
  OmnigentHarnessCatalogResponse,
  OmnigentSendEventInput,
  OmnigentSessionListItem,
  OmnigentTaggedSseEvent,
  OmnigentWirePage,
  OmnigentWireSessionResponse,
} from "./types.js";

export interface FakeOmnigentServerOptions {
  readonly activeResponseId?: string;
  readonly malformedFrameBeforeValid?: boolean;
  readonly pageSize?: number;
  readonly rejectNextTurnWith?: "auth" | "billing" | "policy" | "rate_limit";
  readonly stagnantPagination?: boolean;
  readonly streamDisconnect?: boolean;
}

export interface FakeOmnigentRequestLogEntry {
  readonly body?: unknown;
  readonly method: string;
  readonly path: string;
  readonly url: string;
}

interface FakeSessionRecord {
  items: OmnigentConversationItem[];
  snapshot: OmnigentWireSessionResponse;
  stream: OmnigentTaggedSseEvent[];
}

const EPOCH = 1_780_272_000;

function timestamp(offsetSeconds = 0): number {
  return EPOCH + offsetSeconds;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
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

function textFromMessage(event: OmnigentSendEventInput): string {
  const content = Array.isArray(event.data.content) ? event.data.content : [];
  const first = content[0];
  return typeof first === "object" && first !== null && "text" in first
    ? String(first.text)
    : "send turn";
}

function listItem(snapshot: OmnigentWireSessionResponse): OmnigentSessionListItem {
  return {
    agent_id: snapshot.agent_id,
    created_at: snapshot.created_at,
    id: snapshot.id,
    kind: snapshot.kind,
    parent_session_id: snapshot.parent_session_id,
    project_id: snapshot.project_id,
    status: snapshot.status,
    title: snapshot.title,
    updated_at: snapshot.updated_at ?? snapshot.created_at,
  };
}

export class FakeOmnigentServer {
  readonly requestLog: FakeOmnigentRequestLogEntry[] = [];
  readonly scenarioCatalog = loadOmnigentFakeServerScenarios();

  baseUrl = "";

  private nextSession = 1;
  private nextTurn = 1;
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
        } else {
          resolve();
        }
      });
    });
  }

  private page<T extends { readonly id: string }>(
    values: readonly T[],
    url: URL,
  ): OmnigentWirePage<T> {
    const after = url.searchParams.get("after");
    const requested = Number(url.searchParams.get("limit") ?? values.length);
    const pageSize = Math.min(requested, this.options.pageSize ?? requested);
    const start = after === null ? 0 : Math.max(0, values.findIndex((v) => v.id === after) + 1);
    const data = values.slice(start, start + pageSize);
    const hasMore = start + data.length < values.length;
    const actualLast = data.at(-1)?.id ?? null;
    return {
      data: clone(data),
      first_id: data[0]?.id ?? null,
      has_more: hasMore,
      last_id:
        hasMore && this.options.stagnantPagination && after !== null
          ? after
          : actualLast,
    };
  }

  private async handleRequest(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    const method = request.method ?? "GET";
    const rawUrl = request.url ?? "/";
    const url = new URL(rawUrl, "http://fake.omnigent.local");
    const path = url.pathname;
    const body = method === "GET" ? undefined : await readBody(request);
    this.requestLog.push({ body, method, path, url: rawUrl });

    if (method === "GET" && path === "/v1/harnesses") {
      writeJson(response, 200, harnessCatalog());
      return;
    }

    if (method === "POST" && path === "/v1/sessions") {
      const payload = (body ?? {}) as Record<string, unknown>;
      if (typeof payload.agent_id !== "string" || !Array.isArray(payload.initial_items)) {
        writeJson(response, 422, { error: "agent_id and initial_items are required" });
        return;
      }
      const sessionId = `session-${this.nextSession++}`;
      const title = typeof payload.title === "string" ? payload.title : null;
      const items = (payload.initial_items as Array<Record<string, unknown>>).map(
        (initial, index): OmnigentConversationItem => ({
          created_at: timestamp(index),
          data: (initial.data ?? {}) as OmnigentConversationItem["data"],
          id: `${sessionId}-initial-${index + 1}`,
          response_id: `${sessionId}-initial-response`,
          status: "completed",
          type: "message",
        }),
      );
      const snapshot: OmnigentWireSessionResponse = {
        active_response_id: this.options.activeResponseId ?? null,
        agent_id: payload.agent_id,
        background_task_count: 0,
        created_at: timestamp(),
        id: sessionId,
        items: clone(items),
        kind: "agent",
        mcp_startup: null,
        metadata: {
          agent_id: payload.agent_id,
          workspace: payload.workspace,
        },
        parent_session_id: null,
        project_id: null,
        status: this.options.activeResponseId ? "running" : "idle",
        subagent_routing_override: null,
        title,
        updated_at: timestamp(),
        viewer_last_seen: null,
        viewer_unread: false,
      };
      this.sessions.set(sessionId, { items, snapshot, stream: [] });
      writeJson(response, 200, clone(snapshot));
      return;
    }

    if (method === "GET" && path === "/v1/sessions") {
      writeJson(
        response,
        200,
        this.page(
          Array.from(this.sessions.values()).map((record) => listItem(record.snapshot)),
          url,
        ),
      );
      return;
    }

    const forkMatch = /^\/v1\/sessions\/([^/]+)\/fork$/.exec(path);
    if (method === "POST" && forkMatch) {
      const sourceId = decodeURIComponent(forkMatch[1] ?? "");
      const source = this.sessions.get(sourceId);
      if (!source) {
        writeJson(response, 404, { error: "source session not found" });
        return;
      }
      const id = `${sourceId}-fork`;
      const snapshot = { ...clone(source.snapshot), id, title: `${source.snapshot.title ?? "Session"} fork` };
      this.sessions.set(id, { items: clone(source.items), snapshot, stream: clone(source.stream) });
      writeJson(response, 200, snapshot);
      return;
    }

    const match =
      /^\/v1\/sessions\/([^/]+)(?:\/(items|stream|child_sessions|events|switch-agent|read-state))?$/.exec(path);
    if (!match) {
      writeJson(response, 404, { error: "route not found" });
      return;
    }

    const sessionId = decodeURIComponent(match[1] ?? "");
    const action = match[2] ?? "";
    const record = this.sessions.get(sessionId);
    if (!record) {
      writeJson(response, 404, { error: "session not found" });
      return;
    }

    if (method === "GET" && action === "") {
      const snapshot = {
        ...clone(record.snapshot),
        items:
          url.searchParams.get("include_items") === "false"
            ? []
            : clone(record.items),
      };
      writeJson(response, 200, snapshot);
      return;
    }

    if (method === "PATCH" && action === "") {
      const changes = (body ?? {}) as Record<string, unknown>;
      record.snapshot = {
        ...record.snapshot,
        ...changes,
        id: record.snapshot.id,
        items: clone(record.items),
        updated_at: timestamp(1),
      };
      writeJson(response, 200, clone(record.snapshot));
      return;
    }

    if (method === "DELETE" && action === "") {
      this.sessions.delete(sessionId);
      response.statusCode = 204;
      response.end();
      return;
    }

    if (method === "GET" && action === "items") {
      writeJson(response, 200, this.page(record.items, url));
      return;
    }

    if (method === "GET" && action === "child_sessions") {
      const children: OmnigentChildSessionSummary[] = [];
      writeJson(response, 200, this.page(children, url));
      return;
    }

    if (method === "PUT" && action === "read-state") {
      const payload = (body ?? {}) as Record<string, unknown>;
      record.snapshot = {
        ...record.snapshot,
        updated_at: timestamp(2),
        viewer_last_seen: Number(payload.last_seen),
        viewer_unread: Boolean(payload.unread),
      };
      response.statusCode = 204;
      response.end();
      return;
    }

    if (method === "POST" && action === "switch-agent") {
      writeJson(response, 200, { switched: true });
      return;
    }

    if (method === "POST" && action === "events") {
      await this.handleEvent(record, sessionId, body, response);
      return;
    }

    if (method === "GET" && action === "stream") {
      this.writeStream(record, response);
      return;
    }

    writeJson(response, 404, { error: "route not found" });
  }

  private async handleEvent(
    record: FakeSessionRecord,
    sessionId: string,
    body: unknown,
    response: ServerResponse,
  ): Promise<void> {
    const event = (body ?? {}) as OmnigentSendEventInput;
    if (event.type === "message" && this.rejectNextTurnWith) {
      const rejection = this.rejectNextTurnWith;
      this.rejectNextTurnWith = undefined;
      if (rejection === "rate_limit") {
        response.setHeader("retry-after", "60");
        writeJson(response, 429, { error: "usage cap reached" });
      } else if (rejection === "billing") {
        writeJson(response, 403, { error: "billing issue" });
      } else if (rejection === "policy") {
        writeJson(response, 202, {
          denied: true,
          queued: false,
          reason: "policy blocked",
        });
      } else {
        writeJson(response, 403, { error: "auth required" });
      }
      return;
    }

    if (event.type === "message") {
      const ordinal = this.nextTurn++;
      const responseId = `response-${ordinal}`;
      const userItemId = `message-user-${ordinal}`;
      const message = textFromMessage(event);
      record.items.push({
        created_at: timestamp(ordinal * 10),
        data: event.data as OmnigentConversationItem["data"],
        id: userItemId,
        response_id: responseId,
        status: "completed",
        type: "message",
      });
      record.stream.push(
        {
          response: {
            created_at: timestamp(ordinal * 10),
            id: responseId,
            status: "in_progress",
          },
          type: "response.created",
        },
        { delta: `Echo: ${message}`, type: "response.output_text.delta" },
        {
          item: {
            arguments: "{}",
            call_id: `call-${ordinal}`,
            id: `function-call-${ordinal}`,
            name: "metadata_tool",
            type: "function_call",
          },
          type: "response.output_item.done",
        },
        {
          action: "snapshot",
          action_id: "baction_metadata_only",
          type: "browser.action_request",
        },
        {
          call_id: "call_metadata_only",
          delta: "metadata-only tool output",
          type: "response.function_call_output.delta",
        },
        {
          response: {
            completed_at: timestamp(ordinal * 10 + 2),
            id: responseId,
            status: "completed",
          },
          type: "response.completed",
        },
        {
          conversation_id: sessionId,
          response_id: null,
          status: "idle",
          type: "session.status",
        },
      );
      record.snapshot = {
        ...record.snapshot,
        active_response_id: null,
        items: clone(record.items),
        status: "idle",
        updated_at: timestamp(ordinal * 10 + 2),
      };
      writeJson(response, 202, { item_id: userItemId, queued: true });
      return;
    }

    if (event.type === "interrupt") {
      const responseId = record.snapshot.active_response_id ?? `response-${this.nextTurn}`;
      record.stream.push({
        response: {
          completed_at: timestamp(100),
          id: responseId,
          incomplete_details: { reason: "interrupted" },
          status: "cancelled",
        },
        type: "response.cancelled",
      });
      writeJson(response, 202, { queued: true });
      return;
    }

    if (event.type === "stop_session") {
      writeJson(response, 202, { queued: true });
      return;
    }

    writeJson(response, 400, { error: "unsupported event type" });
  }

  private writeStream(record: FakeSessionRecord, response: ServerResponse): void {
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
    for (const event of record.stream) {
      response.write(`data: ${JSON.stringify(event)}\n\n`);
    }
    response.write("data: [DONE]\n\n");
    response.end();
  }
}
