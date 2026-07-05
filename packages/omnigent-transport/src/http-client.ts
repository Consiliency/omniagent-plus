import type { CreateSessionRequest, SendTurnRequest } from "@omniagent-plus/core-contracts";

import { parseOmnigentSseStream, type OmnigentSseSkip } from "./sse-stream.js";
import type {
  OmnigentEventAck,
  OmnigentHarnessCatalogResponse,
  OmnigentHistoryItem,
  OmnigentHttpClientOptions,
  OmnigentRawEvent,
  OmnigentReadStateInput,
  OmnigentSendEventInput,
  OmnigentSessionSnapshot,
} from "./types.js";

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

export class OmnigentHttpClient {
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly headers: Record<string, string>;

  constructor(private readonly options: OmnigentHttpClientOptions) {
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.headers = options.headers ?? {};
  }

  async createSession(
    request: CreateSessionRequest,
  ): Promise<OmnigentSessionSnapshot> {
    return this.requestJson("POST", "/v1/sessions", {
      agentSpec: request.agentSpec,
      correlationId: request.correlationId,
      idempotencyKey: request.idempotencyKey,
      identityProfileId: request.identityProfileId,
      initialMessage: request.initialMessage,
      repoRoot: request.repoRoot,
      targetHarness: request.targetHarness,
      targetProvider: request.targetProvider,
      title: request.title,
    });
  }

  async listSessions(): Promise<OmnigentSessionSnapshot[]> {
    return this.requestJson("GET", "/v1/sessions");
  }

  async listHarnesses(): Promise<OmnigentHarnessCatalogResponse> {
    return this.requestJson("GET", "/v1/harnesses");
  }

  async getSession(sessionId: string): Promise<OmnigentSessionSnapshot> {
    return this.requestJson("GET", `/v1/sessions/${encodeURIComponent(sessionId)}`);
  }

  async patchSession(
    sessionId: string,
    changes: Record<string, unknown>,
  ): Promise<OmnigentSessionSnapshot> {
    return this.requestJson(
      "PATCH",
      `/v1/sessions/${encodeURIComponent(sessionId)}`,
      changes,
    );
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.requestJson(
      "DELETE",
      `/v1/sessions/${encodeURIComponent(sessionId)}`,
    );
  }

  async getHistory(sessionId: string): Promise<OmnigentHistoryItem[]> {
    return this.requestJson(
      "GET",
      `/v1/sessions/${encodeURIComponent(sessionId)}/items`,
    );
  }

  async listChildSessions(sessionId: string): Promise<OmnigentSessionSnapshot[]> {
    return this.requestJson(
      "GET",
      `/v1/sessions/${encodeURIComponent(sessionId)}/child_sessions`,
    );
  }

  async setReadState(
    sessionId: string,
    readState: OmnigentReadStateInput,
  ): Promise<void> {
    await this.requestJson(
      "PUT",
      `/v1/sessions/${encodeURIComponent(sessionId)}/read-state`,
      {
        last_seen: readState.lastSeen,
        unread: readState.unread,
      },
    );
  }

  async sendTurn(
    request: SendTurnRequest,
  ): Promise<OmnigentEventAck> {
    return this.sendEvent(request.sessionId, {
      data: {
        message: request.message,
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

  async *streamSession(
    sessionId: string,
    onSkip?: (skip: OmnigentSseSkip) => void,
  ): AsyncIterable<OmnigentRawEvent> {
    const response = await this.fetchImpl(
      this.url(`/v1/sessions/${encodeURIComponent(sessionId)}/stream`),
      {
        headers: this.headers,
        method: "GET",
      },
    );

    if (!response.ok) {
      throw await this.toHttpError(response, "GET", `/v1/sessions/${sessionId}/stream`);
    }

    if (!response.body) {
      throw new Error("Omnigent stream response did not include a body.");
    }

    yield* parseOmnigentSseStream(response.body, onSkip);
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
