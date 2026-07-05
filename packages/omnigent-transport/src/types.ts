import type {
  AgentSessionState,
  CreateSessionRequest,
  ProviderHealth,
  RuntimeFailureCategory,
  SendTurnRequest,
  TurnHandle,
} from "@omniagent-plus/core-contracts";

export const omnigentProviderModes = ["http", "cli", "hybrid"] as const;
export type OmnigentProviderMode = (typeof omnigentProviderModes)[number];

export const omnigentCapabilityStatuses = [
  "supported",
  "emulated",
  "blocked",
] as const;
export type OmnigentCapabilityStatus =
  (typeof omnigentCapabilityStatuses)[number];

export const omnigentSessionStatuses = [
  "idle",
  "launching",
  "running",
  "waiting",
  "failed",
] as const;
export type OmnigentSessionStatus = (typeof omnigentSessionStatuses)[number];

export const omnigentResponseStatuses = [
  "queued",
  "in_progress",
  "completed",
  "failed",
  "incomplete",
  "cancelled",
] as const;
export type OmnigentResponseStatus =
  (typeof omnigentResponseStatuses)[number];

export const omnigentStreamEventTypes = [
  "session.created",
  "session.status",
  "session.input.consumed",
  "session.interrupted",
  "session.child_session.updated",
  "session.usage",
  "session.model",
  "session.model_options",
  "session.reasoning_effort",
  "session.collaboration_mode",
  "session.agent_changed",
  "session.todos",
  "session.terminal_pending",
  "session.sandbox_status",
  "session.skills",
  "session.superseded",
  "session.presence",
  "session.resource.created",
  "session.resource.deleted",
  "session.changed_files.invalidated",
  "session.terminal.activity",
  "session.heartbeat",
  "response.created",
  "response.queued",
  "response.in_progress",
  "response.output_text.delta",
  "response.output_item.done",
  "response.output_file.done",
  "response.reasoning.started",
  "response.reasoning_text.delta",
  "response.reasoning_summary_text.delta",
  "response.retry",
  "response.error",
  "response.compaction.in_progress",
  "response.compaction.completed",
  "response.compaction.failed",
  "response.client_task.cancel",
  "response.heartbeat",
  "response.elicitation_request",
  "response.elicitation_resolved",
  "response.completed",
  "response.failed",
  "response.incomplete",
  "response.cancelled",
  "turn.started",
  "turn.completed",
  "turn.failed",
  "turn.cancelled",
] as const;
export type OmnigentStreamEventType =
  (typeof omnigentStreamEventTypes)[number];

export interface OmnigentHttpClientOptions {
  readonly baseUrl: string;
  readonly headers?: Record<string, string>;
  readonly fetch?: typeof globalThis.fetch;
}

export interface OmnigentCommandOptions {
  readonly cwd?: string;
  readonly env?: Record<string, string | undefined>;
  readonly input?: string;
  readonly timeoutMs?: number;
}

export interface OmnigentCliCommandResult {
  readonly command: readonly string[];
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly signal?: NodeJS.Signals | null;
}

export type OmnigentCliCommandRunner = (
  command: readonly string[],
  options?: OmnigentCommandOptions,
) => Promise<OmnigentCliCommandResult>;

export interface OmnigentSessionSnapshot {
  readonly id: string;
  readonly title: string;
  readonly status: OmnigentSessionStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly backend: `omnigent-${OmnigentProviderMode}`;
  readonly items: OmnigentHistoryItem[];
  readonly activeTurnId?: string;
  readonly activeResponseId?: string | null;
  readonly active_response_id?: string | null;
  readonly backgroundTaskCount?: number | null;
  readonly background_task_count?: number | null;
  readonly metadata?: Record<string, unknown>;
  readonly viewerLastSeen?: number | null;
  readonly viewerUnread?: boolean;
  readonly viewer_last_seen?: number | null;
  readonly viewer_unread?: boolean;
}

export interface OmnigentEventFailure {
  readonly category?: RuntimeFailureCategory;
  readonly message: string;
  readonly statusCode?: number;
  readonly retryAfterSeconds?: number;
  readonly resetAt?: string;
}

export interface OmnigentRawEvent {
  readonly id: string;
  readonly type: OmnigentStreamEventType | "[DONE]";
  readonly sessionId: string;
  readonly turnId?: string;
  readonly occurredAt: string;
  readonly backgroundTaskCount?: number | null;
  readonly background_task_count?: number | null;
  readonly sequence_number?: number | null;
  readonly conversation_id?: string;
  readonly response_id?: string;
  readonly itemId?: string;
  readonly terminal?: boolean;
  readonly status?: OmnigentSessionStatus | OmnigentResponseStatus;
  readonly reason?: string;
  readonly message?: string;
  readonly delta?: string;
  readonly outputText?: string;
  readonly failure?: OmnigentEventFailure;
  readonly model?: string | null;
  readonly reasoning_effort?: string | null;
  readonly mode?: string | null;
  readonly total_cost_usd?: number | null;
  readonly usage_by_model?: Record<string, unknown> | null;
  readonly error?: unknown;
  readonly attempt?: number;
  readonly delay_seconds?: number;
  readonly tool_name?: string;
  readonly source?: string;
  readonly elicitation_id?: string;
  readonly params?: Record<string, unknown>;
}

export interface OmnigentReadStateInput {
  readonly lastSeen: number;
  readonly unread: boolean;
}

export type OmnigentHarnessCatalogEntry = Readonly<Record<string, unknown>>;

export type OmnigentHarnessCatalogResponse = Readonly<
  Record<string, readonly OmnigentHarnessCatalogEntry[]>
>;

export interface OmnigentHistoryItem {
  readonly id: string;
  readonly event: OmnigentRawEvent;
}

export interface OmnigentEventAck {
  readonly queued: boolean;
  readonly sessionId: string;
  readonly turnId: string;
}

export type OmnigentSendEventType =
  | "message"
  | "interrupt"
  | "compact"
  | "stop_session";

export interface OmnigentSendEventInput {
  readonly type: OmnigentSendEventType;
  readonly data: Record<string, unknown>;
}

export interface OmnigentServerStatus {
  readonly running: boolean;
  readonly baseUrl?: string;
  readonly pid?: number;
  readonly notes?: string[];
  readonly version?: string;
}

export interface OmnigentCliSessionTransport {
  createSession(request: CreateSessionRequest): Promise<OmnigentSessionSnapshot>;
  sendTurn(
    request: SendTurnRequest,
    session: OmnigentSessionSnapshot,
  ): Promise<{
    handle: TurnHandle;
    rawEvents?: OmnigentRawEvent[];
  }>;
  readHistory(sessionId: string): Promise<OmnigentHistoryItem[]>;
  streamEvents(sessionId: string): Promise<OmnigentRawEvent[]>;
  cancelTurn(handle: TurnHandle): Promise<TurnHandle>;
  closeSession(sessionId: string): Promise<void>;
  getSessionInfo(
    sessionId: string,
  ): Promise<{
    session: OmnigentSessionSnapshot;
    state: AgentSessionState;
  }>;
  health(): Promise<ProviderHealth>;
  serverStatus?(): Promise<OmnigentServerStatus>;
  serverStart?(): Promise<OmnigentServerStatus>;
  serverStop?(): Promise<void>;
}
