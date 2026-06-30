import { z } from "zod";

import {
  runtimeApprovalRequestSchema,
  runtimeApprovalResponseSchema,
  runtimeEventSchema,
  type RuntimeApprovalRequest,
  type RuntimeApprovalResponse,
  type RuntimeEvent,
} from "./events.js";
import { cooldownStateSchema, type CooldownState } from "./identity-profile.js";
import {
  limitClassificationSchema,
  type LimitClassification,
} from "./rate-limit.js";
import {
  runtimeEvidenceRefSchema,
  type RuntimeEvidenceRef,
} from "./redaction.js";
import { routeDecisionSchema, type RouteDecision } from "./route-decision.js";
import { agentSessionSchema, turnHandleSchema } from "./schemas.js";
import {
  harnessIds,
  providerFamilyIds,
  runtimeIds,
  type AgentSession,
  type HarnessId,
  type ProviderFamilyId,
  type RuntimeId,
  type TurnHandle,
} from "./types.js";
import { worktreeLeaseSchema, type WorktreeLease } from "./worktree.js";

export const stateLedgerRecordKinds = [
  "session",
  "turn",
  "runtime_event",
  "route_decision",
  "limit_classification",
  "identity_profile_status",
  "provider_cooldown",
  "worktree_lease",
  "approval_request",
  "approval_response",
  "capability_snapshot",
  "evidence_ref",
] as const;
export type StateLedgerRecordKind = (typeof stateLedgerRecordKinds)[number];

export interface OmnigentCapabilities {
  readonly canCreateSession: boolean;
  readonly canSendTurn: boolean;
  readonly canReadHistory: boolean;
  readonly canStreamEvents: boolean;
  readonly canCancel: boolean;
  readonly canClose: boolean;
  readonly canListSessions: boolean;
  readonly canSpawnChildSessions: boolean;
  readonly canUseHarnessOverride: boolean;
}

export interface IdentityProfileStatus {
  readonly schema: "identity_profile_status.v0.1";
  readonly profileId: string;
  readonly provider: ProviderFamilyId;
  readonly harness: HarnessId;
  readonly status: "ready" | "cooldown" | "degraded" | "blocked";
  readonly checkedAt: string;
  readonly activeSessions: number;
  readonly activeTurns: number;
  readonly reason?: string;
  readonly cooldown?: CooldownState;
}

export interface ProviderFamilyCooldown {
  readonly schema: "provider_family_cooldown.v0.1";
  readonly provider: ProviderFamilyId;
  readonly scope: "provider_family";
  readonly active: boolean;
  readonly reason: string;
  readonly observedAt: string;
  readonly resetAt?: string;
  readonly source:
    | "limit_classification"
    | "manual"
    | "transport_failure"
    | "replay";
}

export interface OmnigentCapabilitySnapshot {
  readonly schema: "omnigent_capability_snapshot.v0.1";
  readonly runtime: RuntimeId;
  readonly capturedAt: string;
  readonly supportedHarnesses: HarnessId[];
  readonly capabilities: OmnigentCapabilities;
  readonly version?: string;
  readonly gitSha?: string;
  readonly endpoint?: string;
}

export interface StateLedgerRecord<
  TKind extends StateLedgerRecordKind,
  TPayload,
> {
  readonly schema: "state_ledger_record.v0.1";
  readonly recordId: string;
  readonly sequence: number;
  readonly kind: TKind;
  readonly schemaVersion: number;
  readonly recordedAt: string;
  readonly sessionId?: string;
  readonly turnId?: string;
  readonly taskId?: string;
  readonly payload: TPayload;
}

export const omnigentCapabilitiesSchema = z.object({
  canCreateSession: z.boolean(),
  canSendTurn: z.boolean(),
  canReadHistory: z.boolean(),
  canStreamEvents: z.boolean(),
  canCancel: z.boolean(),
  canClose: z.boolean(),
  canListSessions: z.boolean(),
  canSpawnChildSessions: z.boolean(),
  canUseHarnessOverride: z.boolean(),
});

export const identityProfileStatusSchema = z.object({
  schema: z.literal("identity_profile_status.v0.1"),
  profileId: z.string().min(1),
  provider: z.enum(providerFamilyIds),
  harness: z.enum(harnessIds),
  status: z.enum(["ready", "cooldown", "degraded", "blocked"]),
  checkedAt: z.string().datetime({ offset: true }),
  activeSessions: z.number().int().nonnegative(),
  activeTurns: z.number().int().nonnegative(),
  reason: z.string().min(1).optional(),
  cooldown: cooldownStateSchema.optional(),
});

export const providerFamilyCooldownSchema = z.object({
  schema: z.literal("provider_family_cooldown.v0.1"),
  provider: z.enum(providerFamilyIds),
  scope: z.literal("provider_family"),
  active: z.boolean(),
  reason: z.string().min(1),
  observedAt: z.string().datetime({ offset: true }),
  resetAt: z.string().datetime({ offset: true }).optional(),
  source: z.enum([
    "limit_classification",
    "manual",
    "transport_failure",
    "replay",
  ]),
});

export const omnigentCapabilitySnapshotSchema = z.object({
  schema: z.literal("omnigent_capability_snapshot.v0.1"),
  runtime: z.enum(runtimeIds),
  capturedAt: z.string().datetime({ offset: true }),
  supportedHarnesses: z.array(z.enum(harnessIds)).min(1),
  capabilities: omnigentCapabilitiesSchema,
  version: z.string().min(1).optional(),
  gitSha: z.string().min(1).optional(),
  endpoint: z.string().min(1).optional(),
});

const stateLedgerRecordBaseSchema = z.object({
  schema: z.literal("state_ledger_record.v0.1"),
  recordId: z.string().min(1),
  sequence: z.number().int().positive(),
  schemaVersion: z.number().int().positive(),
  recordedAt: z.string().datetime({ offset: true }),
  sessionId: z.string().min(1).optional(),
  turnId: z.string().min(1).optional(),
  taskId: z.string().min(1).optional(),
});

function withPayload<TKind extends StateLedgerRecordKind, TPayload extends z.ZodTypeAny>(
  kind: TKind,
  payload: TPayload,
) {
  return stateLedgerRecordBaseSchema.extend({
    kind: z.literal(kind),
    payload,
  });
}

export const stateLedgerRecordSchema = z.discriminatedUnion("kind", [
  withPayload("session", agentSessionSchema),
  withPayload("turn", turnHandleSchema),
  withPayload("runtime_event", runtimeEventSchema),
  withPayload("route_decision", routeDecisionSchema),
  withPayload("limit_classification", limitClassificationSchema),
  withPayload("identity_profile_status", identityProfileStatusSchema),
  withPayload("provider_cooldown", providerFamilyCooldownSchema),
  withPayload("worktree_lease", worktreeLeaseSchema),
  withPayload("approval_request", runtimeApprovalRequestSchema),
  withPayload("approval_response", runtimeApprovalResponseSchema),
  withPayload("capability_snapshot", omnigentCapabilitySnapshotSchema),
  withPayload("evidence_ref", runtimeEvidenceRefSchema),
]);

export const stateLedgerRecordArraySchema = z.array(stateLedgerRecordSchema);

export type SessionLedgerRecord = StateLedgerRecord<"session", AgentSession>;
export type TurnLedgerRecord = StateLedgerRecord<"turn", TurnHandle>;
export type RuntimeEventLedgerRecord = StateLedgerRecord<
  "runtime_event",
  RuntimeEvent
>;
export type RouteDecisionLedgerRecord = StateLedgerRecord<
  "route_decision",
  RouteDecision
>;
export type LimitClassificationLedgerRecord = StateLedgerRecord<
  "limit_classification",
  LimitClassification
>;
export type IdentityProfileStatusLedgerRecord = StateLedgerRecord<
  "identity_profile_status",
  IdentityProfileStatus
>;
export type ProviderCooldownLedgerRecord = StateLedgerRecord<
  "provider_cooldown",
  ProviderFamilyCooldown
>;
export type WorktreeLeaseLedgerRecord = StateLedgerRecord<
  "worktree_lease",
  WorktreeLease
>;
export type ApprovalRequestLedgerRecord = StateLedgerRecord<
  "approval_request",
  RuntimeApprovalRequest
>;
export type ApprovalResponseLedgerRecord = StateLedgerRecord<
  "approval_response",
  RuntimeApprovalResponse
>;
export type CapabilitySnapshotLedgerRecord = StateLedgerRecord<
  "capability_snapshot",
  OmnigentCapabilitySnapshot
>;
export type EvidenceRefLedgerRecord = StateLedgerRecord<
  "evidence_ref",
  RuntimeEvidenceRef
>;

export type StateLedgerEntry =
  | SessionLedgerRecord
  | TurnLedgerRecord
  | RuntimeEventLedgerRecord
  | RouteDecisionLedgerRecord
  | LimitClassificationLedgerRecord
  | IdentityProfileStatusLedgerRecord
  | ProviderCooldownLedgerRecord
  | WorktreeLeaseLedgerRecord
  | ApprovalRequestLedgerRecord
  | ApprovalResponseLedgerRecord
  | CapabilitySnapshotLedgerRecord
  | EvidenceRefLedgerRecord;

export function createStateLedgerRecord(
  record: Omit<StateLedgerEntry, "schema">,
): StateLedgerEntry {
  return stateLedgerRecordSchema.parse({
    ...record,
    schema: "state_ledger_record.v0.1",
  }) as StateLedgerEntry;
}
