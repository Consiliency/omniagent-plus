import { z } from "zod";

import {
  runtimeEventSchema,
  type RuntimeEvent,
} from "./events.js";
import { runtimeFailureSchema } from "./errors.js";
import { handoffPacketSchema } from "./handoff-packet.js";
import { identityProfileSchema } from "./identity-profile.js";
import { limitClassificationSchema } from "./rate-limit.js";
import type { AgentRuntimeProvider } from "./provider.js";
import { routeDecisionSchema } from "./route-decision.js";
import { metadataSchemaCheck } from "./redaction.js";
import { agentSessionStates, turnStates } from "./state-machines.js";
import {
  backendIds,
  cancellationReasons,
  harnessIds,
  providerFamilyIds,
  runtimeIds,
} from "./types.js";
import {
  worktreeLeaseRefSchema,
  worktreeLeaseSchema,
  worktreeLeaseRequestSchema,
} from "./worktree.js";

export const runtimeIdSchema = z.enum(runtimeIds);
export const harnessIdSchema = z.enum(harnessIds);
export const providerFamilyIdSchema = z.enum(providerFamilyIds);
export const backendIdSchema = z.enum(backendIds);
export const cancellationReasonSchema = z.enum(cancellationReasons);
export const agentSessionStateSchema = z.enum(agentSessionStates);
export const turnStateSchema = z.enum(turnStates);

export const runtimeFileRefSchema = z.object({
  path: z.string().min(1),
  description: z.string().min(1).optional(),
  redaction: z.enum([
    "metadata_only",
    "content_allowed",
    "content_redacted",
  ]),
});

export const runtimeRetryPolicySchema = z.object({
  maxAttempts: z.number().int().positive(),
  backoffMs: z.number().int().nonnegative(),
  retryOn: z.array(z.string().min(1)).min(1),
});

export const historyOptionsSchema = z.object({
  afterSequence: z.number().int().nonnegative().optional(),
  limit: z.number().int().positive().optional(),
});

export const streamOptionsSchema = z.object({
  afterSequence: z.number().int().nonnegative().optional(),
  includeHeartbeats: z.boolean().optional(),
});

export const omnigentAgentSpecRefSchema = z.object({
  kind: z.enum(["bundle_path", "named_agent", "inline_spec"]),
  value: z.string().min(1),
  version: z.string().min(1).optional(),
});

export const turnHandleSchema = z.object({
  sessionId: z.string().min(1),
  turnId: z.string().min(1),
  idempotencyKey: z.string().min(1),
  state: turnStateSchema,
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  eventCursor: z.number().int().nonnegative().optional(),
});

export const createSessionRequestSchema = z.object({
  runtime: runtimeIdSchema,
  targetHarness: harnessIdSchema,
  idempotencyKey: z.string().min(1),
  correlationId: z.string().min(1).optional(),
  targetProvider: providerFamilyIdSchema.optional(),
  identityProfileId: z.string().min(1).optional(),
  title: z.string().min(1),
  repoRoot: z.string().min(1).optional(),
  worktree: worktreeLeaseRefSchema.optional(),
  agentSpec: omnigentAgentSpecRefSchema.optional(),
  initialMessage: z.string().min(1).optional(),
  handoffPacket: handoffPacketSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).superRefine(metadataSchemaCheck).optional(),
});

export const sendTurnRequestSchema = z.object({
  sessionId: z.string().min(1),
  turnId: z.string().min(1).optional(),
  idempotencyKey: z.string().min(1),
  correlationId: z.string().min(1).optional(),
  message: z.string(),
  handoffPacket: handoffPacketSchema.optional(),
  files: z.array(runtimeFileRefSchema).optional(),
  timeoutMs: z.number().int().positive().optional(),
  retryPolicy: runtimeRetryPolicySchema.optional(),
  metadata: z.record(z.string(), z.unknown()).superRefine(metadataSchemaCheck).optional(),
});

export const agentSessionSchema = z.object({
  id: z.string().min(1),
  runtime: runtimeIdSchema,
  targetHarness: harnessIdSchema,
  targetProvider: providerFamilyIdSchema.optional(),
  identityProfileId: z.string().min(1).optional(),
  title: z.string().min(1),
  state: agentSessionStateSchema,
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  correlationId: z.string().min(1).optional(),
  repoRoot: z.string().min(1).optional(),
  parentSessionId: z.string().min(1).optional(),
  rootSessionId: z.string().min(1).optional(),
  worktree: worktreeLeaseRefSchema.optional(),
  handoffPacket: handoffPacketSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).superRefine(metadataSchemaCheck).optional(),
});

export const agentSessionInfoSchema = agentSessionSchema.extend({
  activeTurnId: z.string().min(1).optional(),
  eventCursor: z.number().int().nonnegative(),
  lastError: runtimeFailureSchema.optional(),
});

export const sessionHistorySchema = z.object({
  sessionId: z.string().min(1),
  events: z.array(runtimeEventSchema) as z.ZodType<RuntimeEvent[]>,
  nextCursor: z.number().int().nonnegative().optional(),
});

export const providerHealthSchema = z.object({
  runtime: runtimeIdSchema,
  backend: backendIdSchema,
  available: z.boolean(),
  activeSessions: z.number().int().nonnegative(),
  sessionStateDrift: z.array(z.string().min(1)),
  notes: z.array(z.string().min(1)).optional(),
});

const agentRuntimeProviderMethodNames = [
  "createSession",
  "sendTurn",
  "readHistory",
  "streamEvents",
  "cancelTurn",
  "closeSession",
  "getSessionInfo",
  "health",
] as const;

export const agentRuntimeProviderSchema: z.ZodType<AgentRuntimeProvider> = z.custom(
  (value) => {
    if (typeof value !== "object" || value === null) {
      return false;
    }

    return agentRuntimeProviderMethodNames.every(
      (methodName) =>
        typeof (value as Record<string, unknown>)[methodName] === "function",
    );
  },
  {
    message: "AgentRuntimeProvider must expose the required public methods.",
  },
);

export {
  handoffPacketSchema,
  identityProfileSchema,
  limitClassificationSchema,
  routeDecisionSchema,
  runtimeEventSchema,
  runtimeFailureSchema,
  worktreeLeaseRequestSchema,
  worktreeLeaseRefSchema,
  worktreeLeaseSchema,
};
