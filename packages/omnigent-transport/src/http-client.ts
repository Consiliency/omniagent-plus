import {
  createRuntimeFailure,
  type CreateSessionRequest,
  type SendTurnRequest,
} from "@consiliency/runtime-provider";

import {
  OmnigentSseNormalizer,
  parseOmnigentSseStream,
  type OmnigentSseSkip,
} from "./sse-stream.js";
import { omnigentSessionStatuses } from "./types.js";
import type {
  OmnigentChildSessionSummary,
  OmnigentConversationItem,
  OmnigentEventAck,
  OmnigentHarnessCatalogResponse,
  OmnigentHttpClientOptions,
  OmnigentOpenStream,
  OmnigentRawEvent,
  OmnigentReadStateInput,
  OmnigentSendEventInput,
  OmnigentSessionListItem,
  OmnigentSessionSnapshot,
  OmnigentSessionStatus,
  OmnigentWirePage,
  OmnigentWireSessionResponse,
} from "./types.js";

const PAGE_LIMIT = 1000;

export class OmnigentHttpError extends Error {
  readonly body: unknown;
  readonly headers: Record<string, string>;
  readonly method: string;
  readonly path: string;
  readonly statusCode: number;

  constructor(args: {
    body: unknown;
    headers: Record<string, string>;
    method: string;
    path: string;
    statusCode: number;
  }) {
    super(`${args.method} ${args.path} failed with ${args.statusCode}`);
    this.name = "OmnigentHttpError";
    this.body = args.body;
    this.headers = args.headers;
    this.method = args.method;
    this.path = args.path;
    this.statusCode = args.statusCode;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(
  record: Record<string, unknown>,
  field: string,
): string {
  const value = record[field];
  if (typeof value !== "string" || value.length === 0) {
    throw createRuntimeFailure({
      actor: "provider",
      category: "malformed_response",
      message: `Omnigent response field ${field} must be a non-empty string.`,
      retryable: false,
      scope: "session",
    });
  }
  return value;
}

function epochToIso(value: unknown, field: string): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw createRuntimeFailure({
      actor: "provider",
      category: "malformed_response",
      message: `Omnigent response field ${field} must be a Unix epoch.`,
      retryable: false,
      scope: "session",
    });
  }
  return new Date(value * 1000).toISOString();
}

function sessionStatus(value: unknown): OmnigentSessionStatus {
  if (
    typeof value !== "string" ||
    !(omnigentSessionStatuses as readonly string[]).includes(value)
  ) {
    throw createRuntimeFailure({
      actor: "provider",
      category: "malformed_response",
      message: `Omnigent response field status has unsupported value ${String(value)}.`,
      retryable: false,
      scope: "session",
    });
  }
  return value as OmnigentSessionStatus;
}

function normalizeSessionListItem(value: unknown): OmnigentSessionListItem {
  if (!isRecord(value)) {
    throw createRuntimeFailure({
      actor: "provider",
      category: "malformed_response",
      message: "Omnigent session page row must be an object.",
      retryable: false,
      scope: "session",
    });
  }
  requiredString(value, "id");
  requiredString(value, "agent_id");
  sessionStatus(value.status);
  epochToIso(value.created_at, "created_at");
  epochToIso(value.updated_at, "updated_at");
  if (value.title != null && typeof value.title !== "string") {
    throw createRuntimeFailure({
      actor: "provider",
      category: "malformed_response",
      message: "Omnigent session page row field title must be a string or null.",
      retryable: false,
      scope: "session",
    });
  }
  return value as unknown as OmnigentSessionListItem;
}

function normalizeChildSessionSummary(value: unknown): OmnigentChildSessionSummary {
  if (!isRecord(value)) {
    throw createRuntimeFailure({
      actor: "provider",
      category: "malformed_response",
      message: "Omnigent child session page row must be an object.",
      retryable: false,
      scope: "session",
    });
  }
  requiredString(value, "id");
  requiredString(value, "parent_session_id");
  epochToIso(value.created_at, "created_at");
  epochToIso(value.updated_at, "updated_at");
  if (value.title != null && typeof value.title !== "string") {
    throw createRuntimeFailure({
      actor: "provider",
      category: "malformed_response",
      message: "Omnigent child session page row field title must be a string or null.",
      retryable: false,
      scope: "session",
    });
  }
  if (value.busy !== undefined && typeof value.busy !== "boolean") {
    throw createRuntimeFailure({
      actor: "provider",
      category: "malformed_response",
      message: "Omnigent child session page row field busy must be a boolean.",
      retryable: false,
      scope: "session",
    });
  }
  return value as unknown as OmnigentChildSessionSummary;
}

function normalizeConversationItem(value: unknown): OmnigentConversationItem {
  if (!isRecord(value)) {
    throw createRuntimeFailure({
      actor: "provider",
      category: "malformed_response",
      message: "Omnigent conversation item must be an object.",
      retryable: false,
      scope: "session",
    });
  }
  requiredString(value, "id");
  requiredString(value, "response_id");
  requiredString(value, "status");
  requiredString(value, "type");
  epochToIso(value.created_at, "created_at");
  if (!isRecord(value.data)) {
    throw createRuntimeFailure({
      actor: "provider",
      category: "malformed_response",
      message: "Omnigent conversation item field data must be an object.",
      retryable: false,
      scope: "session",
    });
  }
  return value as unknown as OmnigentConversationItem;
}

function normalizeSession(
  value: unknown,
  fallbackTitle?: string,
): OmnigentSessionSnapshot {
  if (!isRecord(value)) {
    throw createRuntimeFailure({
      actor: "provider",
      category: "malformed_response",
      message: "Omnigent session response must be an object.",
      retryable: false,
      scope: "session",
    });
  }
  const wire = value as unknown as OmnigentWireSessionResponse;
  const id = requiredString(value, "id");
  const agentId = requiredString(value, "agent_id");
  const status = sessionStatus(value.status);
  const createdAt = epochToIso(value.created_at, "created_at");
  const updatedAt = epochToIso(
    value.updated_at ?? value.created_at,
    value.updated_at == null ? "created_at" : "updated_at",
  );
  if (value.items !== undefined && !Array.isArray(value.items)) {
    throw createRuntimeFailure({
      actor: "provider",
      category: "malformed_response",
      message: "Omnigent session response field items must be an array.",
      retryable: false,
      scope: "session",
    });
  }
  const title =
    typeof wire.title === "string" && wire.title.length > 0
      ? wire.title
      : fallbackTitle ?? `Omnigent session ${id}`;

  return {
    agentId,
    activeResponseId:
      typeof wire.active_response_id === "string"
        ? wire.active_response_id
        : null,
    backend: "omnigent-http",
    backgroundTaskCount:
      typeof wire.background_task_count === "number"
        ? wire.background_task_count
        : null,
    createdAt,
    id,
    items: wire.items ?? [],
    kind: typeof wire.kind === "string" ? wire.kind : undefined,
    mcpStartup: wire.mcp_startup,
    metadata: isRecord(value.metadata) ? value.metadata : undefined,
    modelOptions: wire.model_options,
    parentSessionId:
      typeof wire.parent_session_id === "string"
        ? wire.parent_session_id
        : null,
    projectId:
      typeof wire.project_id === "string" ? wire.project_id : null,
    status,
    subagentRoutingOverride:
      typeof wire.subagent_routing_override === "string"
        ? wire.subagent_routing_override
        : null,
    title,
    updatedAt,
    viewerLastSeen:
      typeof wire.viewer_last_seen === "number"
        ? wire.viewer_last_seen
        : null,
    viewerUnread:
      typeof wire.viewer_unread === "boolean"
        ? wire.viewer_unread
        : undefined,
  };
}

export class OmnigentHttpClient {
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly headers: Record<string, string>;
  private readonly now: () => string;

  constructor(private readonly options: OmnigentHttpClientOptions) {
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.headers = options.headers ?? {};
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async createSession(
    request: CreateSessionRequest,
  ): Promise<OmnigentSessionSnapshot> {
    const agentId = await this.resolveAgentId(request);
    const workspace = request.worktree?.path ?? request.repoRoot;
    const wire = await this.requestJson<unknown>("POST", "/v1/sessions", {
      agent_id: agentId,
      initial_items:
        request.initialMessage === undefined
          ? []
          : [
              {
                data: {
                  content: [
                    { text: request.initialMessage, type: "input_text" },
                  ],
                  role: "user",
                },
                type: "message",
              },
            ],
      title: request.title,
      ...(workspace === undefined ? {} : { workspace }),
    });
    return normalizeSession(wire, request.title);
  }

  async listSessions(): Promise<OmnigentSessionListItem[]> {
    return this.requestAllPages("/v1/sessions", normalizeSessionListItem);
  }

  async listHarnesses(): Promise<OmnigentHarnessCatalogResponse> {
    return this.requestJson("GET", "/v1/harnesses");
  }

  async getSession(sessionId: string): Promise<OmnigentSessionSnapshot> {
    return normalizeSession(
      await this.requestJson(
        "GET",
        `/v1/sessions/${encodeURIComponent(sessionId)}?include_items=false`,
      ),
    );
  }

  async patchSession(
    sessionId: string,
    changes: Record<string, unknown>,
  ): Promise<OmnigentSessionSnapshot> {
    return normalizeSession(
      await this.requestJson(
        "PATCH",
        `/v1/sessions/${encodeURIComponent(sessionId)}`,
        changes,
      ),
    );
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.requestJson(
      "DELETE",
      `/v1/sessions/${encodeURIComponent(sessionId)}`,
    );
  }

  async getHistory(sessionId: string): Promise<OmnigentConversationItem[]> {
    return this.requestAllPages(
      `/v1/sessions/${encodeURIComponent(sessionId)}/items`,
      normalizeConversationItem,
    );
  }

  async listChildSessions(
    sessionId: string,
  ): Promise<OmnigentChildSessionSummary[]> {
    return this.requestAllPages(
      `/v1/sessions/${encodeURIComponent(sessionId)}/child_sessions`,
      normalizeChildSessionSummary,
    );
  }

  async setReadState(
    sessionId: string,
    readState: OmnigentReadStateInput,
  ): Promise<void> {
    await this.requestJson(
      "PUT",
      `/v1/sessions/${encodeURIComponent(sessionId)}/read-state`,
      { last_seen: readState.lastSeen, unread: readState.unread },
    );
  }

  async sendTurn(request: SendTurnRequest): Promise<OmnigentEventAck> {
    return this.sendEvent(request.sessionId, {
      data: {
        content: [{ text: request.message, type: "input_text" }],
        role: "user",
      },
      type: "message",
    });
  }

  async sendEvent(
    sessionId: string,
    event: OmnigentSendEventInput,
  ): Promise<OmnigentEventAck> {
    return this.requestJson(
      "POST",
      `/v1/sessions/${encodeURIComponent(sessionId)}/events`,
      event,
    );
  }

  async openSessionStream(
    sessionId: string,
    onSkip?: (skip: OmnigentSseSkip) => void,
  ): Promise<OmnigentOpenStream> {
    const path = `/v1/sessions/${encodeURIComponent(sessionId)}/stream`;
    const controller = new AbortController();
    const response = await this.fetchImpl(this.url(path), {
      headers: this.headers,
      method: "GET",
      signal: controller.signal,
    });
    if (!response.ok) {
      const error = await this.toHttpError(response, "GET", path);
      controller.abort();
      throw error;
    }
    if (!response.body) {
      controller.abort();
      throw new Error("Omnigent stream response did not include a body.");
    }
    let closed = false;
    const normalizer = new OmnigentSseNormalizer({
      now: this.now,
      sessionId,
    });
    return {
      close: async () => {
        if (!closed) {
          closed = true;
          controller.abort();
        }
      },
      events: parseOmnigentSseStream(
        response.body,
        { now: this.now, sessionId },
        onSkip,
        normalizer,
      ),
      setActiveResponseId: (responseId) => {
        normalizer.setActiveResponseId(responseId);
      },
    };
  }

  async *streamSession(
    sessionId: string,
    onSkip?: (skip: OmnigentSseSkip) => void,
  ): AsyncIterable<OmnigentRawEvent> {
    const stream = await this.openSessionStream(sessionId, onSkip);
    try {
      yield* stream.events;
    } finally {
      await stream.close();
    }
  }

  private async resolveAgentId(request: CreateSessionRequest): Promise<string> {
    const agentSpec = request.agentSpec;
    if (!agentSpec) {
      throw createRuntimeFailure({
        actor: "provider",
        category: "backend_capability_missing",
        message: "Omnigent HTTP create requires an existing named agent.",
        retryable: false,
        scope: "session",
      });
    }
    if (agentSpec.kind !== "named_agent") {
      throw createRuntimeFailure({
        actor: "provider",
        category: "backend_capability_missing",
        message: `Omnigent HTTP create does not support agent spec kind ${agentSpec.kind}.`,
        retryable: false,
        scope: "session",
      });
    }
    const resolved = this.options.resolveAgentId
      ? await this.options.resolveAgentId(agentSpec)
      : agentSpec.value;
    if (typeof resolved !== "string" || resolved.trim().length === 0) {
      throw createRuntimeFailure({
        actor: "provider",
        category: "backend_capability_missing",
        message: `Omnigent HTTP create does not support agent spec kind ${agentSpec.kind}.`,
        retryable: false,
        scope: "session",
      });
    }
    return resolved;
  }

  private async requestAllPages<T>(
    path: string,
    normalizeRow: (value: unknown) => T,
  ): Promise<T[]> {
    const result: T[] = [];
    let after: string | undefined;
    const seenCursors = new Set<string>();
    while (true) {
      const query = new URLSearchParams({
        limit: String(PAGE_LIMIT),
        order: "asc",
        ...(after === undefined ? {} : { after }),
      });
      const page = await this.requestJson<OmnigentWirePage<unknown>>(
        "GET",
        `${path}?${query.toString()}`,
      );
      if (!page || !Array.isArray(page.data) || typeof page.has_more !== "boolean") {
        throw createRuntimeFailure({
          actor: "provider",
          category: "malformed_response",
          message: `Omnigent paginated response for ${path} is malformed.`,
          retryable: false,
          scope: "session",
        });
      }
      result.push(...page.data.map(normalizeRow));
      if (!page.has_more) {
        return result;
      }
      if (
        typeof page.last_id !== "string" ||
        page.last_id.length === 0 ||
        seenCursors.has(page.last_id)
      ) {
        throw createRuntimeFailure({
          actor: "provider",
          category: "malformed_response",
          message: `Omnigent pagination for ${path} did not advance.`,
          retryable: false,
          scope: "session",
        });
      }
      seenCursors.add(page.last_id);
      after = page.last_id;
    }
  }

  private async requestJson<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const response = await this.fetchImpl(this.url(path), {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: {
        ...this.headers,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      method,
    });
    if (!response.ok) {
      throw await this.toHttpError(response, method, path);
    }
    if (response.status === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
  }

  private async toHttpError(
    response: Response,
    method: string,
    path: string,
  ): Promise<OmnigentHttpError> {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = await response.text();
    }
    return new OmnigentHttpError({
      body,
      headers: Object.fromEntries(response.headers.entries()),
      method,
      path,
      statusCode: response.status,
    });
  }

  private url(path: string): string {
    return new URL(path, this.options.baseUrl).toString();
  }
}
