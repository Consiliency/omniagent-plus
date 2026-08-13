import {
  omnigentResponseStatuses,
  omnigentSessionEventStatuses,
  omnigentStreamEventTypes,
  type OmnigentRawEvent,
  type OmnigentTaggedSseEvent,
} from "./types.js";

export type OmnigentSseSkipReason =
  | "invalid_json"
  | "non_object_payload"
  | "unknown_event_type";

export interface OmnigentSseSkip {
  readonly payload: string;
  readonly reason: OmnigentSseSkipReason;
}

export interface OmnigentSseNormalizationOptions {
  readonly now?: () => string;
  readonly sessionId: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isKnownOmnigentEventType(
  value: unknown,
): value is OmnigentTaggedSseEvent["type"] {
  return (
    typeof value === "string" &&
    (omnigentStreamEventTypes as readonly string[]).includes(value)
  );
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function statusValue(value: unknown): OmnigentRawEvent["status"] {
  return typeof value === "string" &&
    [
      ...omnigentSessionEventStatuses,
      ...omnigentResponseStatuses,
    ].includes(value as never)
    ? (value as OmnigentRawEvent["status"])
    : undefined;
}

function epochToIso(value: unknown): string | undefined {
  const epoch = numberValue(value);
  return epoch === undefined ? undefined : new Date(epoch * 1000).toISOString();
}

function errorMessage(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  return isRecord(value) ? stringValue(value.message) : undefined;
}

function parseFramePayload(
  payload: string,
  onSkip?: (skip: OmnigentSseSkip) => void,
): OmnigentTaggedSseEvent | null {
  if (payload === "[DONE]") {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    onSkip?.({ payload, reason: "invalid_json" });
    return null;
  }

  if (!isRecord(parsed)) {
    onSkip?.({ payload, reason: "non_object_payload" });
    return null;
  }

  if (!isKnownOmnigentEventType(parsed.type)) {
    onSkip?.({ payload, reason: "unknown_event_type" });
    return null;
  }

  return parsed as OmnigentTaggedSseEvent;
}

export class OmnigentSseNormalizer {
  private currentResponseId: string | undefined;
  private fallbackTurnId: string | undefined;
  private readonly knownResponseIds = new Set<string>();
  private readonly pendingTerminalTurnIds: string[] = [];
  private readonly responseAliases = new Map<string, string>();
  private readonly unboundTurnIds: string[] = [];
  private frameOrdinal = 0;
  private readonly now: () => string;

  constructor(private readonly options: OmnigentSseNormalizationOptions) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  setActiveResponseId(responseId: string | null | undefined): void {
    this.currentResponseId = responseId ?? undefined;
    if (this.currentResponseId) {
      this.knownResponseIds.add(this.currentResponseId);
      if (this.fallbackTurnId) {
        this.bindResponseAlias(this.currentResponseId, this.fallbackTurnId);
      }
    }
  }

  setFallbackTurnId(turnId: string | undefined): void {
    this.fallbackTurnId = turnId;
    if (
      turnId !== undefined &&
      !this.unboundTurnIds.includes(turnId) &&
      !this.pendingTerminalTurnIds.includes(turnId) &&
      ![...this.responseAliases.values()].includes(turnId)
    ) {
      this.unboundTurnIds.push(turnId);
    }
  }

  normalize(tagged: OmnigentTaggedSseEvent): OmnigentRawEvent {
    this.frameOrdinal += 1;
    const raw = tagged as Record<string, unknown>;
    const response = isRecord(raw.response) ? raw.response : undefined;
    const data = isRecord(raw.data) ? raw.data : undefined;
    const item = isRecord(raw.item) ? raw.item : undefined;
    const nestedResponseId = stringValue(response?.id);
    const explicitResponseId =
      stringValue(raw.response_id) ?? stringValue(data?.response_id);
    const previousResponseId = this.currentResponseId;
    const officialTurnId = nestedResponseId ?? explicitResponseId;
    const status = statusValue(raw.status) ?? statusValue(response?.status);
    const terminal =
      tagged.type === "response.completed" ||
      tagged.type === "response.failed" ||
      tagged.type === "response.incomplete" ||
      tagged.type === "response.cancelled" ||
      (explicitResponseId !== undefined &&
        (tagged.type === "turn.completed" ||
          tagged.type === "turn.failed" ||
          tagged.type === "turn.cancelled")) ||
      (tagged.type === "session.status" &&
        (status === "failed" ||
          (status === "idle" && explicitResponseId !== undefined)));
    const isBareTurn = tagged.type.startsWith("turn.");
    const turnId = isBareTurn
      ? explicitResponseId
      : officialTurnId ?? previousResponseId ?? this.fallbackTurnId;
    let turnAliasId = officialTurnId
      ? this.responseAliases.get(officialTurnId)
      : previousResponseId
        ? this.responseAliases.get(previousResponseId)
        : undefined;
    if (
      officialTurnId !== undefined &&
      turnAliasId === undefined &&
      !this.knownResponseIds.has(officialTurnId)
    ) {
      turnAliasId = terminal
        ? this.pendingTerminalTurnIds.shift() ?? this.unboundTurnIds.shift()
        : this.unboundTurnIds.shift();
      if (turnAliasId !== undefined) {
        this.bindResponseAlias(officialTurnId, turnAliasId);
      }
    }
    if (officialTurnId !== undefined) {
      this.knownResponseIds.add(officialTurnId);
    }
    const sessionId =
      stringValue(raw.conversation_id) ??
      stringValue(raw.session_id) ??
      this.options.sessionId;
    const sequence = numberValue(raw.sequence_number);
    const messageId = stringValue(raw.message_id);
    const itemId =
      stringValue(item?.id) ??
      stringValue(raw.call_id) ??
      stringValue(raw.action_id) ??
      stringValue(raw.elicitation_id) ??
      stringValue(raw.file_id);
    const messageIndex = numberValue(raw.index);
    const eventId =
      itemId ??
      (messageId
        ? `${messageId}:${messageIndex ?? this.frameOrdinal}`
        : undefined) ??
      (nestedResponseId ? `${nestedResponseId}:${tagged.type}` : undefined) ??
      `${sessionId}:${tagged.type}:${sequence ?? this.frameOrdinal}`;
    const occurredAt =
      epochToIso(response?.completed_at) ??
      epochToIso(response?.created_at) ??
      epochToIso(data?.requested_at) ??
      this.now();
    const failureMessage = errorMessage(response?.error) ?? errorMessage(raw.error);
    const incompleteDetails = isRecord(response?.incomplete_details)
      ? response.incomplete_details
      : undefined;
    const normalized: OmnigentRawEvent = {
      action: stringValue(raw.action),
      action_id: stringValue(raw.action_id),
      agent_id: raw.agent_id === null ? null : stringValue(raw.agent_id),
      args: isRecord(raw.args) ? raw.args : undefined,
      attempt: numberValue(raw.attempt),
      background_task_count:
        numberValue(raw.background_task_count) ?? undefined,
      blocked_on:
        raw.blocked_on === null ? null : stringValue(raw.blocked_on),
      call_id: stringValue(raw.call_id) ?? stringValue(item?.call_id),
      child_session_id: stringValue(raw.child_session_id),
      conversation_id: stringValue(raw.conversation_id),
      delay_seconds: numberValue(raw.delay_seconds),
      delta: stringValue(raw.delta),
      elicitation_id: stringValue(raw.elicitation_id),
      error: raw.error ?? response?.error,
      failure:
        failureMessage === undefined
          ? undefined
          : { category: "backend_unavailable", message: failureMessage },
      id: eventId,
      item,
      itemId,
      final: typeof raw.final === "boolean" ? raw.final : undefined,
      index: messageIndex,
      message_id: messageId,
      message: failureMessage,
      model: stringValue(raw.model),
      occurredAt,
      outputText: undefined,
      parent_session_id:
        raw.parent_session_id === null
          ? null
          : stringValue(raw.parent_session_id),
      params: isRecord(raw.params) ? raw.params : undefined,
      phase: stringValue(raw.phase),
      reason:
        stringValue(raw.reason) ??
        stringValue(incompleteDetails?.reason) ??
        failureMessage,
      reasoning_effort: stringValue(raw.reasoning_effort),
      response_id: explicitResponseId,
      sequence_number: sequence,
      servers: isRecord(raw.servers)
        ? (raw.servers as OmnigentRawEvent["servers"])
        : undefined,
      sessionId,
      source: stringValue(raw.source),
      status,
      terminal,
      tool_name: stringValue(raw.tool_name),
      total_cost_usd: numberValue(raw.total_cost_usd),
      turnId,
      turnAliasId,
      type: tagged.type,
      usage_by_model: isRecord(raw.usage_by_model)
        ? raw.usage_by_model
        : undefined,
    };
    if (normalized.terminal) {
      if (
        officialTurnId === undefined &&
        previousResponseId === undefined &&
        turnId !== undefined &&
        turnId === this.fallbackTurnId
      ) {
        this.removeUnboundTurnId(turnId);
        if (!this.pendingTerminalTurnIds.includes(turnId)) {
          this.pendingTerminalTurnIds.push(turnId);
        }
      }
      if (turnAliasId !== undefined) {
        this.removeUnboundTurnId(turnAliasId);
        this.removePendingTerminalTurnId(turnAliasId);
      }
      if (
        officialTurnId === previousResponseId ||
        (officialTurnId === undefined && turnId === previousResponseId)
      ) {
        this.currentResponseId = undefined;
      }
      if (turnId === this.fallbackTurnId || turnAliasId === this.fallbackTurnId) {
        this.fallbackTurnId = undefined;
      }
    } else if (officialTurnId !== undefined) {
      this.currentResponseId = officialTurnId;
    }
    return normalized;
  }

  private bindResponseAlias(responseId: string, turnId: string): void {
    this.responseAliases.set(responseId, turnId);
    this.removeUnboundTurnId(turnId);
    this.removePendingTerminalTurnId(turnId);
  }

  private removePendingTerminalTurnId(turnId: string): void {
    const index = this.pendingTerminalTurnIds.indexOf(turnId);
    if (index >= 0) {
      this.pendingTerminalTurnIds.splice(index, 1);
    }
  }

  private removeUnboundTurnId(turnId: string): void {
    const index = this.unboundTurnIds.indexOf(turnId);
    if (index >= 0) {
      this.unboundTurnIds.splice(index, 1);
    }
  }
}

export async function* parseOmnigentSseStream(
  stream: ReadableStream<Uint8Array>,
  options: OmnigentSseNormalizationOptions,
  onSkip?: (skip: OmnigentSseSkip) => void,
  normalizer = new OmnigentSseNormalizer(options),
): AsyncIterable<OmnigentRawEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const parseFrame = (frame: string): OmnigentRawEvent | null => {
    const dataLines = frame
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim());
    if (dataLines.length === 0) {
      return null;
    }
    const tagged = parseFramePayload(dataLines.join("\n"), onSkip);
    return tagged === null ? null : normalizer.normalize(tagged);
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";

      for (const frame of frames) {
        const event = parseFrame(frame);
        if (event) {
          yield event;
        }
      }

      if (done) {
        break;
      }
    }

    if (buffer.trim().length > 0) {
      const event = parseFrame(buffer);
      if (event) {
        yield event;
      }
    }
  } finally {
    reader.releaseLock();
  }
}
