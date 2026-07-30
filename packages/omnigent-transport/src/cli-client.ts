import {
  createRuntimeFailure,
  type AgentRuntimeProvider,
  type AgentSession,
  type AgentSessionInfo,
  type AgentSessionState,
  type CancellationReason,
  type CreateSessionRequest,
  type HistoryOptions,
  type ProviderHealth,
  type RuntimeEvent,
  type SendTurnRequest,
  type SessionHistory,
  type StreamOptions,
  type TurnHandle,
} from "@consiliency/runtime-provider";

import { OmnigentEventMapper } from "./event-mapper.js";
import { mapOmnigentHistory } from "./history-mapper.js";
import type {
  OmnigentCliCommandResult,
  OmnigentCliCommandRunner,
  OmnigentCliSessionTransport,
  OmnigentHistoryItem,
  OmnigentRawEvent,
  OmnigentServerStatus,
  OmnigentSessionSnapshot,
} from "./types.js";

interface CliSessionEnvelope {
  readonly handle?: TurnHandle;
  readonly history?: OmnigentHistoryItem[];
  readonly rawEvents?: OmnigentRawEvent[];
  readonly server?: OmnigentServerStatus;
  readonly session?: OmnigentSessionSnapshot;
  readonly state?: AgentSessionState;
}

interface CliServerStatusOutput {
  readonly daemon_attached?: boolean;
  readonly live_sessions?: number | null;
  readonly log_path?: string | null;
  readonly pid?: number | null;
  readonly port?: number | null;
  readonly running: boolean;
  readonly url?: string | null;
}

export interface OmnigentCliProviderOptions {
  readonly commandRunner?: OmnigentCliCommandRunner;
  readonly transport?: OmnigentCliSessionTransport;
}

function commandFailure(result: OmnigentCliCommandResult): never {
  throw createRuntimeFailure({
    actor: "omnigent",
    category: "backend_unavailable",
    message: result.stderr || `Command ${result.command.join(" ")} failed.`,
    retryable: false,
    safeDiagnostics: {
      command: result.command.join(" "),
      exitCode: result.exitCode,
    },
    scope: "system",
  });
}

function parseJsonResult<T>(result: OmnigentCliCommandResult): T {
  if (result.exitCode !== 0) {
    commandFailure(result);
  }

  return JSON.parse(result.stdout) as T;
}

function mapSessionState(status: OmnigentSessionSnapshot["status"]): AgentSessionState {
  switch (status) {
    case "running":
    case "waiting":
      return "turn_active";
    case "failed":
      return "failed";
    case "idle":
    default:
      return "idle";
  }
}

function toSessionInfo(
  request: Pick<
    CreateSessionRequest,
    | "correlationId"
    | "handoffPacket"
    | "identityProfileId"
    | "repoRoot"
    | "targetHarness"
    | "targetProvider"
    | "title"
    | "worktree"
  >,
  snapshot: OmnigentSessionSnapshot,
  previous?: AgentSessionInfo,
): AgentSessionInfo {
  return {
    activeTurnId: snapshot.activeTurnId,
    correlationId: request.correlationId,
    createdAt: snapshot.createdAt,
    eventCursor: previous?.eventCursor ?? 0,
    handoffPacket: request.handoffPacket,
    id: snapshot.id,
    identityProfileId: request.identityProfileId,
    lastError: previous?.lastError,
    metadata: snapshot.metadata,
    repoRoot: request.repoRoot,
    rootSessionId: snapshot.id,
    runtime: "omnigent",
    state: mapSessionState(snapshot.status),
    targetHarness: request.targetHarness,
    targetProvider: request.targetProvider,
    title: snapshot.title,
    updatedAt: snapshot.updatedAt,
    worktree: request.worktree,
  };
}

export function createCommandBackedCliTransport(
  commandRunner: OmnigentCliCommandRunner,
): OmnigentCliSessionTransport {
  const readServerStatus = async (): Promise<OmnigentServerStatus> => {
    const result = await commandRunner([
      "omnigent",
      "server",
      "status",
      "--json",
    ]);
    const status = parseJsonResult<CliServerStatusOutput>(result);
    return {
      baseUrl: status.url ?? undefined,
      pid: status.pid ?? undefined,
      running: status.running,
    };
  };

  return {
    async createSession(request) {
      const agentArg =
        request.agentSpec?.kind === "named_agent"
          ? request.agentSpec.value
          : "default-agent";
      const result = await commandRunner(["omnigent", "run", agentArg], {
        input: JSON.stringify(request),
      });
      const envelope = parseJsonResult<CliSessionEnvelope>(result);
      if (!envelope.session) {
        throw createRuntimeFailure({
          actor: "provider",
          category: "malformed_response",
          message: "CLI run output did not include a session snapshot.",
          retryable: false,
          scope: "session",
        });
      }
      return envelope.session;
    },
    async sendTurn(request, _session) {
      const result = await commandRunner(
        ["omnigent", "attach", request.sessionId],
        { input: request.message },
      );
      const envelope = parseJsonResult<CliSessionEnvelope>(result);
      if (!envelope.handle) {
        throw createRuntimeFailure({
          actor: "provider",
          category: "malformed_response",
          message: "CLI attach output did not include a turn handle.",
          retryable: false,
          scope: "turn",
        });
      }
      return {
        handle: envelope.handle,
        rawEvents: envelope.rawEvents,
      };
    },
    async readHistory(sessionId) {
      const result = await commandRunner(["omnigent", "resume", sessionId]);
      return parseJsonResult<CliSessionEnvelope>(result).history ?? [];
    },
    async streamEvents(sessionId) {
      const result = await commandRunner(["omnigent", "attach", sessionId]);
      return parseJsonResult<CliSessionEnvelope>(result).rawEvents ?? [];
    },
    async cancelTurn(handle) {
      throw createRuntimeFailure({
        actor: "omnigent",
        category: "backend_capability_missing",
        message: `CLI fallback does not publish a stable cancel command for ${handle.turnId}.`,
        retryable: false,
        scope: "turn",
      });
    },
    async closeSession(_sessionId) {
      return;
    },
    async getSessionInfo(sessionId) {
      const result = await commandRunner(["omnigent", "resume", sessionId]);
      const envelope = parseJsonResult<CliSessionEnvelope>(result);
      if (!envelope.session) {
        throw createRuntimeFailure({
          actor: "provider",
          category: "malformed_response",
          message: "CLI resume output did not include a session snapshot.",
          retryable: false,
          scope: "session",
        });
      }
      return {
        session: envelope.session,
        state: envelope.state ?? mapSessionState(envelope.session.status),
      };
    },
    async health() {
      const server = await readServerStatus();
      return {
        activeSessions: 0,
        available: server.running,
        backend: "omnigent-cli",
        notes: server.notes,
        runtime: "omnigent",
        sessionStateDrift: [],
      };
    },
    async serverStatus() {
      return readServerStatus();
    },
    async serverStart() {
      const result = await commandRunner(["omnigent", "server", "--background"]);
      if (result.exitCode !== 0) {
        commandFailure(result);
      }
      return readServerStatus();
    },
    async serverStop() {
      await commandRunner(["omnigent", "server", "stop"]);
    },
  };
}

export class OmnigentCliProvider implements AgentRuntimeProvider {
  private readonly sessions = new Map<string, AgentSessionInfo>();

  constructor(private readonly transport: OmnigentCliSessionTransport) {}

  async createSession(request: CreateSessionRequest): Promise<AgentSession> {
    const snapshot = await this.transport.createSession(request);
    const session = toSessionInfo(request, snapshot);
    this.sessions.set(session.id, session);
    return session;
  }

  async sendTurn(request: SendTurnRequest): Promise<TurnHandle> {
    const session = this.sessions.get(request.sessionId);
    if (!session) {
      throw createRuntimeFailure({
        actor: "provider",
        category: "validation",
        message: `Session ${request.sessionId} is not tracked locally.`,
        retryable: false,
        scope: "session",
      });
    }

    const result = await this.transport.sendTurn(request, {
      activeTurnId: session.activeTurnId,
      backend: "omnigent-cli",
      createdAt: session.createdAt,
      id: session.id,
      items: [],
      metadata: session.metadata,
      status: "idle",
      title: session.title,
      updatedAt: session.updatedAt,
    });
    this.sessions.set(request.sessionId, {
      ...session,
      activeTurnId: result.handle.turnId,
      state: "turn_active",
      updatedAt: result.handle.updatedAt,
    });
    return result.handle;
  }

  async readHistory(
    sessionId: string,
    options?: HistoryOptions,
  ): Promise<SessionHistory> {
    const items = await this.transport.readHistory(sessionId);
    const mapped = mapOmnigentHistory(sessionId, items, {
      afterSequence: options?.afterSequence,
    });
    return {
      events:
        options?.limit === undefined
          ? mapped.history.events
          : mapped.history.events.slice(0, options.limit),
      nextCursor: mapped.history.nextCursor,
      sessionId,
    };
  }

  async *streamEvents(
    sessionId: string,
    options?: StreamOptions,
  ): AsyncIterable<RuntimeEvent> {
    const rawEvents = await this.transport.streamEvents(sessionId);
    const mapper = new OmnigentEventMapper(sessionId, {
      startingSequence: (options?.afterSequence ?? 0) + 1,
    });
    for (const rawEvent of rawEvents) {
      for (const event of mapper.map(rawEvent)) {
        if (
          options?.afterSequence === undefined ||
          event.sequence > options.afterSequence
        ) {
          yield event;
        }
      }
    }
  }

  async cancelTurn(
    handle: TurnHandle,
    _reason?: CancellationReason,
  ): Promise<TurnHandle> {
    return this.transport.cancelTurn(handle);
  }

  async closeSession(sessionId: string): Promise<void> {
    await this.transport.closeSession(sessionId);
    const session = this.sessions.get(sessionId);
    if (session) {
      this.sessions.set(sessionId, {
        ...session,
        activeTurnId: undefined,
        state: "closed",
        updatedAt: new Date().toISOString(),
      });
    }
  }

  async getSessionInfo(sessionId: string): Promise<AgentSessionInfo> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw createRuntimeFailure({
        actor: "provider",
        category: "validation",
        message: `Session ${sessionId} is not tracked locally.`,
        retryable: false,
        scope: "session",
      });
    }

    const resolved = await this.transport.getSessionInfo(sessionId);
    const next = {
      ...session,
      activeTurnId: resolved.session.activeTurnId,
      metadata: resolved.session.metadata,
      state: session.state === "closed" ? "closed" : resolved.state,
      updatedAt: resolved.session.updatedAt,
    };
    this.sessions.set(sessionId, next);
    return next;
  }

  async health(): Promise<ProviderHealth> {
    return this.transport.health();
  }
}

export function createCliProvider(
  options: OmnigentCliProviderOptions,
): AgentRuntimeProvider {
  if (options.transport) {
    return new OmnigentCliProvider(options.transport);
  }

  if (options.commandRunner) {
    return new OmnigentCliProvider(
      createCommandBackedCliTransport(options.commandRunner),
    );
  }

  throw new Error("CLI provider requires either a transport or commandRunner.");
}
