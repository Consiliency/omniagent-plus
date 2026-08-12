/// <reference types="node" preserve="true" />

import type {
  AgentSessionState,
  CreateSessionRequest,
  ProviderHealth,
  RuntimeFailureCategory,
  SendTurnRequest,
  TurnHandle,
  OmnigentAgentSpecRef,
} from "@consiliency/runtime-provider";
import type { ChildProcess } from "node:child_process";

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

export const omnigentMcpServerStartupStatuses = [
  "starting",
  "ready",
  "failed",
  "cancelled",
] as const;
export type OmnigentMcpServerStartupStatus =
  (typeof omnigentMcpServerStartupStatuses)[number];

export interface OmnigentMcpServerStartup {
  readonly status: OmnigentMcpServerStartupStatus;
  readonly error?: string | null;
}

export const omnigentStreamEventTypes = [
  "browser.action_request",
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
  "session.mcp_startup",
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
  "response.policy_denied",
  "response.function_call_output.delta",
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
  readonly now?: () => string;
  readonly resolveAgentId?: (
    agentSpec: OmnigentAgentSpecRef,
  ) => Promise<string> | string;
}

export interface OmnigentCommandOptions {
  readonly cwd?: string;
  readonly env?: Record<string, string | undefined>;
  readonly input?: string;
  readonly timeoutMs?: number;
}

export type OmnigentProcessSignal = NonNullable<ChildProcess["signalCode"]>;

export interface OmnigentCliCommandResult {
  readonly command: readonly string[];
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly signal?: OmnigentProcessSignal | null;
}

export type OmnigentCliCommandRunner = (
  command: readonly string[],
  options?: OmnigentCommandOptions,
) => Promise<OmnigentCliCommandResult>;

export interface OmnigentNativeReasoningEffortOption {
  readonly [key: string]: unknown;
  readonly description?: string | null;
  readonly reasoningEffort: string;
}

export interface OmnigentNativeModelOption {
  readonly [key: string]: unknown;
  readonly defaultReasoningEffort?: string | null;
  readonly displayName?: string | null;
  readonly id: string;
  readonly isDefault?: boolean | null;
  readonly model?: string | null;
  readonly supportedReasoningEfforts?: readonly OmnigentNativeReasoningEffortOption[];
}

export interface OmnigentSessionSnapshot {
  readonly id: string;
  readonly title: string;
  readonly status: OmnigentSessionStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly backend: `omnigent-${OmnigentProviderMode}`;
  readonly items: OmnigentConversationItem[];
  readonly activeTurnId?: string;
  readonly activeResponseId?: string | null;
  readonly backgroundTaskCount?: number | null;
  readonly kind?: string;
  readonly metadata?: Record<string, unknown>;
  readonly mcpStartup?:
    | Readonly<Record<string, OmnigentMcpServerStartup>>
    | null;
  readonly parentSessionId?: string | null;
  readonly projectId?: string | null;
  readonly modelOptions?: readonly OmnigentNativeModelOption[];
  readonly subagentRoutingOverride?: string | null;
  readonly viewerLastSeen?: number | null;
  readonly viewerUnread?: boolean;
}

export interface OmnigentWirePage<T> {
  readonly data: T[];
  readonly first_id: string | null;
  readonly has_more: boolean;
  readonly last_id: string | null;
}

export interface OmnigentWireSessionResponse {
  readonly [key: string]: unknown;
  readonly active_response_id?: string | null;
  readonly background_task_count?: number | null;
  readonly created_at: number;
  readonly id: string;
  readonly items: OmnigentConversationItem[];
  readonly kind?: string;
  readonly mcp_startup?: Readonly<Record<string, OmnigentMcpServerStartup>> | null;
  readonly model_options?: readonly OmnigentNativeModelOption[];
  readonly parent_session_id?: string | null;
  readonly project_id?: string | null;
  readonly status: OmnigentSessionStatus;
  readonly subagent_routing_override?: string | null;
  readonly title: string | null;
  readonly updated_at?: number | null;
  readonly viewer_last_seen?: number | null;
  readonly viewer_unread?: boolean;
}

export interface OmnigentSessionListItem {
  readonly [key: string]: unknown;
  readonly created_at: number;
  readonly id: string;
  readonly kind?: string;
  readonly parent_session_id?: string | null;
  readonly project_id?: string | null;
  readonly status: OmnigentSessionStatus;
  readonly title: string | null;
  readonly updated_at?: number | null;
}

export interface OmnigentChildSessionSummary {
  readonly [key: string]: unknown;
  readonly agent_id?: string | null;
  readonly created_at: number;
  readonly id: string;
  readonly routed_model?: string | null;
  readonly routing_decision_id?: string | null;
  readonly status: OmnigentSessionStatus;
  readonly title: string | null;
  readonly updated_at?: number | null;
}

export interface OmnigentMessageData {
  readonly content: ReadonlyArray<Readonly<Record<string, unknown>>>;
  readonly interrupted?: boolean;
  readonly is_meta?: boolean;
  readonly model?: string | null;
  readonly role: "assistant" | "user";
}

export interface OmnigentFunctionCallData {
  readonly arguments: string;
  readonly call_id: string;
  readonly model: string;
  readonly name: string;
}

export interface OmnigentFunctionCallOutputData {
  readonly call_id: string;
  readonly output: string;
}

export interface OmnigentPersistedErrorData {
  readonly code: string;
  readonly message: string;
  readonly source: "execution" | "llm" | "tool";
}

export interface OmnigentNativeToolData {
  readonly item: Readonly<Record<string, unknown>>;
}

export interface OmnigentRoutingDecisionData {
  readonly [key: string]: unknown;
  readonly requested_model?: string | null;
  readonly routed_model?: string | null;
}

export type OmnigentConversationItemType =
  | "compaction"
  | "error"
  | "function_call"
  | "function_call_output"
  | "message"
  | "native_tool"
  | "reasoning"
  | "resource_event"
  | "routing_decision"
  | "slash_command"
  | "terminal_command";

export type OmnigentConversationItemData =
  | OmnigentFunctionCallData
  | OmnigentFunctionCallOutputData
  | OmnigentMessageData
  | OmnigentNativeToolData
  | OmnigentPersistedErrorData
  | OmnigentRoutingDecisionData
  | Readonly<Record<string, unknown>>;

export interface OmnigentConversationItem {
  readonly created_at: number;
  readonly created_by?: string | null;
  readonly data: OmnigentConversationItemData;
  readonly id: string;
  readonly response_id: string;
  readonly status: string;
  readonly type: OmnigentConversationItemType;
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
  readonly blocked_on?: string | null;
  readonly sequence_number?: number | null;
  readonly conversation_id?: string;
  readonly response_id?: string;
  readonly itemId?: string;
  readonly terminal?: boolean;
  readonly status?: OmnigentSessionStatus | OmnigentResponseStatus;
  readonly reason?: string;
  readonly phase?: string;
  readonly servers?: Readonly<Record<string, OmnigentMcpServerStartup>>;
  readonly actionId?: string;
  readonly action_id?: string;
  readonly action?: string;
  readonly args?: Readonly<Record<string, unknown>>;
  readonly callId?: string;
  readonly call_id?: string;
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
  readonly item?: Readonly<Record<string, unknown>>;
}

export interface OmnigentTaggedSseEvent {
  readonly [key: string]: unknown;
  readonly sequence_number?: number | null;
  readonly type: OmnigentStreamEventType;
}

export interface OmnigentOpenStream {
  readonly events: AsyncIterable<OmnigentRawEvent>;
  close(): Promise<void>;
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

export interface OmnigentAcceptedEventAck {
  readonly denied?: false;
  readonly item_id?: string;
  readonly pending_id?: string;
  readonly queued: boolean;
}

export interface OmnigentDeniedEventAck {
  readonly denied: true;
  readonly queued: false;
  readonly reason: string;
}

export type OmnigentEventAck =
  | OmnigentAcceptedEventAck
  | OmnigentDeniedEventAck;

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
