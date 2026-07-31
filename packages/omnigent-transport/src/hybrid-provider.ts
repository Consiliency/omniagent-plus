import type {
  AgentRuntimeProvider,
  AgentSession,
  AgentSessionInfo,
  CancellationReason,
  CreateSessionRequest,
  HistoryOptions,
  ProviderHealth,
  RuntimeEvent,
  SendTurnRequest,
  SessionHistory,
  StreamOptions,
  TurnHandle,
} from "@consiliency/runtime-provider";

import { OmnigentHttpProvider } from "./http-provider.js";
import type { OmnigentProcessManager } from "./process-manager.js";
import type {
  OmnigentCliSessionTransport,
  OmnigentHttpClientOptions,
} from "./types.js";

export interface OmnigentHybridProviderOptions extends OmnigentHttpClientOptions {
  readonly cliTransport: OmnigentCliSessionTransport;
  readonly processManager: OmnigentProcessManager;
  readonly startCommand?: readonly string[];
  readonly stopServerOnClose?: boolean;
}

export class OmnigentHybridProvider implements AgentRuntimeProvider {
  private readonly httpProvider: OmnigentHttpProvider;
  private readonly startCommand: readonly string[];

  constructor(private readonly options: OmnigentHybridProviderOptions) {
    this.httpProvider = new OmnigentHttpProvider(options);
    this.startCommand = options.startCommand ?? ["omnigent", "server", "--background"];
  }

  async createSession(request: CreateSessionRequest): Promise<AgentSession> {
    await this.ensureReady();
    return this.httpProvider.createSession(request);
  }

  async sendTurn(request: SendTurnRequest): Promise<TurnHandle> {
    await this.ensureReady();
    return this.httpProvider.sendTurn(request);
  }

  async readHistory(
    sessionId: string,
    options?: HistoryOptions,
  ): Promise<SessionHistory> {
    await this.ensureReady();
    return this.httpProvider.readHistory(sessionId, options);
  }

  async *streamEvents(
    sessionId: string,
    options?: StreamOptions,
  ): AsyncIterable<RuntimeEvent> {
    await this.ensureReady();
    yield* this.httpProvider.streamEvents(sessionId, options);
  }

  async cancelTurn(
    handle: TurnHandle,
    reason?: CancellationReason,
  ): Promise<TurnHandle> {
    await this.ensureReady();
    return this.httpProvider.cancelTurn(handle, reason);
  }

  async closeSession(sessionId: string): Promise<void> {
    await this.httpProvider.closeSession(sessionId);
    if (this.options.stopServerOnClose) {
      await this.options.cliTransport.serverStop?.();
      await this.options.processManager.stop();
    }
  }

  async getSessionInfo(sessionId: string): Promise<AgentSessionInfo> {
    await this.ensureReady();
    return this.httpProvider.getSessionInfo(sessionId);
  }

  async health(): Promise<ProviderHealth> {
    const [serverStatus, httpHealth] = await Promise.all([
      this.options.cliTransport.serverStatus?.() ?? Promise.resolve({ running: false }),
      this.httpProvider.health(),
    ]);
    const processStatus = this.options.processManager.status();

    return {
      ...httpHealth,
      backend: "omnigent-hybrid",
      notes: [
        ...(httpHealth.notes ?? []),
        processStatus.running
          ? "hybrid local server process is running"
          : "hybrid local server process is stopped",
        ...(serverStatus.running ? [] : ["CLI server start is required before transport calls"]),
      ],
    };
  }

  private async ensureReady(): Promise<void> {
    const status = await this.options.cliTransport.serverStatus?.();
    if (!status?.running) {
      await this.options.processManager.ensureRunning(this.startCommand);
      await this.options.cliTransport.serverStart?.();
    }
    this.options.processManager.heartbeat();
  }
}

export function createHybridProvider(
  options: OmnigentHybridProviderOptions,
): AgentRuntimeProvider {
  return new OmnigentHybridProvider(options);
}
