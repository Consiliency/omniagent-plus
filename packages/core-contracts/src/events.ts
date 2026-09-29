import { z } from "zod";

import { runtimeFailureSchema, type RuntimeFailure } from "./errors.js";
import { limitClassificationSchema, type LimitClassification } from "./rate-limit.js";
import {
  redactionStatusSchema,
  runtimeEvidenceRefSchema,
  type RedactionStatus,
  type RuntimeEvidenceRef,
} from "./redaction.js";
import { turnStates, type TurnState } from "./state-machines.js";

export interface RuntimeToolCall {
  readonly toolCallId: string;
  readonly sessionId: string;
  readonly turnId: string;
  readonly toolName: string;
  readonly argumentsRedacted: unknown;
  readonly approvalRequired: boolean;
  readonly evidenceRefs?: RuntimeEvidenceRef[];
}

export interface RuntimeApprovalRequest {
  readonly approvalRequestId: string;
  readonly toolCallId?: string;
  readonly sessionId: string;
  readonly turnId: string;
  readonly requestedAction: string;
  readonly risk: "low" | "medium" | "high";
  readonly allowedApprovers: string[];
  readonly expiresAt?: string;
}

export interface RuntimeApprovalResponse {
  readonly approvalRequestId: string;
  readonly decision: "approved" | "denied" | "timed_out" | "cancelled";
  readonly decidedBy?: string;
  readonly decidedAt: string;
  readonly reason?: string;
}

export interface RuntimeEventEnvelope<TType extends string, TPayload> {
  readonly schema: "runtime_event.v0.1";
  readonly eventId: string;
  readonly sequence: number;
  readonly sessionId: string;
  readonly turnId?: string;
  readonly correlationId?: string;
  readonly type: TType;
  readonly occurredAt: string;
  readonly payload: TPayload;
  readonly redaction: RedactionStatus;
  readonly terminal: boolean;
  readonly evidenceRefs?: RuntimeEvidenceRef[];
}

export type RuntimeSessionCreatedEvent = RuntimeEventEnvelope<
  "runtime.session.created",
  { state: "created" | "starting" | "idle" | "failed"; title: string }
>;
export type RuntimeTurnStartedEvent = RuntimeEventEnvelope<
  "runtime.turn.started",
  { message: string; state: TurnState }
>;
export type RuntimeTextDeltaEvent = RuntimeEventEnvelope<
  "runtime.text.delta",
  { delta: string }
>;
export type RuntimeToolCallEvent = RuntimeEventEnvelope<
  "runtime.tool.call",
  { toolCall: RuntimeToolCall }
>;
export type RuntimeToolResultEvent = RuntimeEventEnvelope<
  "runtime.tool.result",
  { toolCallId: string; outputRedacted: unknown }
>;
export type RuntimeApprovalRequestEvent = RuntimeEventEnvelope<
  "runtime.approval.request",
  { request: RuntimeApprovalRequest }
>;
export type RuntimeLimitEvent = RuntimeEventEnvelope<
  "runtime.limit",
  { classification: LimitClassification }
>;
export type RuntimeTurnCompletedEvent = RuntimeEventEnvelope<
  "runtime.turn.completed",
  { outcome: "completed"; outputSummary?: string }
>;
export type RuntimeTurnFailedEvent = RuntimeEventEnvelope<
  "runtime.turn.failed",
  { outcome: "failed"; failure: RuntimeFailure }
>;
export type RuntimeTurnCancelledEvent = RuntimeEventEnvelope<
  "runtime.turn.cancelled",
  { outcome: "cancelled"; reason?: string }
>;
export type RuntimeTurnTimedOutEvent = RuntimeEventEnvelope<
  "runtime.turn.timed_out",
  { outcome: "timed_out"; timeoutMs?: number }
>;
export type RuntimeSessionClosedEvent = RuntimeEventEnvelope<
  "runtime.session.closed",
  { reason: "logical_close" | "deleted" | "failed" }
>;
export type RuntimeHeartbeatEvent = RuntimeEventEnvelope<
  "runtime.heartbeat",
  { cursor: number }
>;

export type RuntimeEvent =
  | RuntimeSessionCreatedEvent
  | RuntimeTurnStartedEvent
  | RuntimeTextDeltaEvent
  | RuntimeToolCallEvent
  | RuntimeToolResultEvent
  | RuntimeApprovalRequestEvent
  | RuntimeLimitEvent
  | RuntimeTurnCompletedEvent
  | RuntimeTurnFailedEvent
  | RuntimeTurnCancelledEvent
  | RuntimeTurnTimedOutEvent
  | RuntimeSessionClosedEvent
  | RuntimeHeartbeatEvent;

export const runtimeToolCallSchema = z.object({
  toolCallId: z.string().min(1),
  sessionId: z.string().min(1),
  turnId: z.string().min(1),
  toolName: z.string().min(1),
  argumentsRedacted: z.unknown(),
  approvalRequired: z.boolean(),
  evidenceRefs: z.array(runtimeEvidenceRefSchema).optional(),
});

export const runtimeApprovalRequestSchema = z.object({
  approvalRequestId: z.string().min(1),
  toolCallId: z.string().min(1).optional(),
  sessionId: z.string().min(1),
  turnId: z.string().min(1),
  requestedAction: z.string().min(1),
  risk: z.enum(["low", "medium", "high"]),
  allowedApprovers: z.array(z.string().min(1)).min(1),
  expiresAt: z.string().datetime({ offset: true }).optional(),
});

export const runtimeApprovalResponseSchema = z.object({
  approvalRequestId: z.string().min(1),
  decision: z.enum(["approved", "denied", "timed_out", "cancelled"]),
  decidedBy: z.string().min(1).optional(),
  decidedAt: z.string().datetime({ offset: true }),
  reason: z.string().min(1).optional(),
});

const runtimeEventEnvelopeBaseSchema = z.object({
  schema: z.literal("runtime_event.v0.1"),
  eventId: z.string().min(1),
  sequence: z.number().int().positive(),
  sessionId: z.string().min(1),
  turnId: z.string().min(1).optional(),
  correlationId: z.string().min(1).optional(),
  occurredAt: z.string().datetime({ offset: true }),
  redaction: redactionStatusSchema,
  terminal: z.boolean(),
  evidenceRefs: z.array(runtimeEvidenceRefSchema).optional(),
});

function withPayload<TType extends string, TPayload extends z.ZodTypeAny>(
  type: TType,
  payload: TPayload,
) {
  return runtimeEventEnvelopeBaseSchema.extend({
    type: z.literal(type),
    payload,
  });
}

export const runtimeEventSchema = z.discriminatedUnion("type", [
  withPayload(
    "runtime.session.created",
    z.object({
      state: z.enum(["created", "starting", "idle", "failed"]),
      title: z.string().min(1),
    }),
  ),
  withPayload(
    "runtime.turn.started",
    z.object({
      message: z.string(),
      state: z.enum(turnStates),
    }),
  ),
  withPayload(
    "runtime.text.delta",
    z.object({
      delta: z.string(),
    }),
  ),
  withPayload(
    "runtime.tool.call",
    z.object({
      toolCall: runtimeToolCallSchema,
    }),
  ),
  withPayload(
    "runtime.tool.result",
    z.object({
      toolCallId: z.string().min(1),
      outputRedacted: z.unknown(),
    }),
  ),
  withPayload(
    "runtime.approval.request",
    z.object({
      request: runtimeApprovalRequestSchema,
    }),
  ),
  withPayload(
    "runtime.limit",
    z.object({
      classification: limitClassificationSchema,
    }),
  ),
  withPayload(
    "runtime.turn.completed",
    z.object({
      outcome: z.literal("completed"),
      outputSummary: z.string().min(1).optional(),
    }),
  ),
  withPayload(
    "runtime.turn.failed",
    z.object({
      outcome: z.literal("failed"),
      failure: runtimeFailureSchema,
    }),
  ),
  withPayload(
    "runtime.turn.cancelled",
    z.object({
      outcome: z.literal("cancelled"),
      reason: z.string().min(1).optional(),
    }),
  ),
  withPayload(
    "runtime.turn.timed_out",
    z.object({
      outcome: z.literal("timed_out"),
      timeoutMs: z.number().int().positive().optional(),
    }),
  ),
  withPayload(
    "runtime.session.closed",
    z.object({
      reason: z.enum(["logical_close", "deleted", "failed"]),
    }),
  ),
  withPayload(
    "runtime.heartbeat",
    z.object({
      cursor: z.number().int().nonnegative(),
    }),
  ),
]);

export function createRuntimeEvent<TType extends RuntimeEvent["type"]>(
  event: Omit<Extract<RuntimeEvent, { type: TType }>, "schema" | "sequence"> & {
    sequence?: number;
  },
): Extract<RuntimeEvent, { type: TType }> {
  const parsed = runtimeEventSchema.parse({
    ...event,
    schema: "runtime_event.v0.1",
    sequence: event.sequence ?? 1,
  });
  return parsed as Extract<RuntimeEvent, { type: TType }>;
}
