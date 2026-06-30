import type {
  AgentRuntimeProvider,
  CreateSessionRequest,
  HandoffPacket,
  HarnessId,
  IdentityProfile,
  IdentityProfileStatus,
  LimitClassification,
  ProviderFamilyCooldown,
  ProviderFamilyId,
  RouteDecision,
  RouteDecisionCooldownState,
  RuntimeEvidenceRef,
  RuntimeFailure,
  SendTurnRequest,
  WorktreeLease,
} from "@omniagent-plus/core-contracts";

export const coordinatorInterfaceFreezeGate = "IF-0-COORDINATOR-9";

export type LaunchGateAction =
  | "allowed"
  | "wait_for_reset"
  | "manual_confirmation_required"
  | "blocked";

export interface ActiveTurnSnapshot {
  readonly totalActiveTurns: number;
  readonly byProfileId: Readonly<Record<string, number>>;
  readonly byProvider: Readonly<Partial<Record<ProviderFamilyId, number>>>;
  readonly bySessionId: Readonly<Record<string, number>>;
}

export interface AdaptiveConcurrencyInput {
  readonly baseTarget: number;
  readonly maxActiveTurns: number;
  readonly activeTurns: number;
  readonly classification?: LimitClassification;
  readonly providerHealth?: number;
}

export interface AdaptiveConcurrencyDecision {
  readonly targetActiveTurns: number;
  readonly availableTurnSlots: number;
  readonly currentCapacity: number;
  readonly reduced: boolean;
  readonly reasons: readonly string[];
}

export interface CooldownEvaluation extends RouteDecisionCooldownState {
  readonly blocked: boolean;
}

export interface IdentityPoolMember {
  readonly profile: IdentityProfile;
  readonly status?: IdentityProfileStatus;
  readonly providerCooldown?: ProviderFamilyCooldown;
  readonly cooldownState: CooldownEvaluation;
  readonly activeSessions: number;
  readonly activeTurns: number;
  readonly targetActiveTurns: number;
  readonly availableTurnSlots: number;
  readonly currentCapacity: number;
  readonly providerHealth: number;
  readonly capabilityFit: number;
  readonly available: boolean;
  readonly reasons: readonly string[];
}

export interface IdentityPoolSnapshot {
  readonly evaluatedAt: string;
  readonly candidates: readonly IdentityPoolMember[];
}

export interface BuildIdentityPoolInput {
  readonly profiles: readonly IdentityProfile[];
  readonly statuses?: readonly IdentityProfileStatus[];
  readonly providerCooldowns?: readonly ProviderFamilyCooldown[];
  readonly activeTurns?: ActiveTurnSnapshot;
  readonly classificationByProvider?: Partial<
    Record<ProviderFamilyId, LimitClassification>
  >;
  readonly capabilityFitByProfileId?: Readonly<Record<string, number>>;
  readonly providerHealth?: Readonly<Partial<Record<ProviderFamilyId, number>>>;
  readonly now?: string;
}

export interface PortabilityInput {
  readonly sessionContinuation?: boolean;
  readonly handoffEvidence?: boolean;
  readonly worktreeLease?: WorktreeLease;
  readonly rawHistoryAttached?: boolean;
  readonly localFilesystemDependency?: boolean;
  readonly allowCrossProviderMigration?: boolean;
}

export interface PortabilityScore {
  readonly score: number;
  readonly level: RouteDecision["contextPortability"];
  readonly migrateAcrossProviders: boolean;
  readonly reasons: readonly string[];
}

export interface RoutePlannerInput {
  readonly taskId: string;
  readonly identityPool: IdentityPoolSnapshot;
  readonly portability?: PortabilityScore;
  readonly portabilityInput?: PortabilityInput;
  readonly preferredProvider?: ProviderFamilyId;
  readonly preferredHarness?: HarnessId;
  readonly preferredIdentityProfileId?: string;
  readonly latestClassification?: LimitClassification;
  readonly providerHealth?: Readonly<Partial<Record<ProviderFamilyId, number>>>;
  readonly capabilityFitByProfileId?: Readonly<Record<string, number>>;
  readonly evidenceRefs?: readonly RuntimeEvidenceRef[];
  readonly manualConfirmationProvided?: boolean;
  readonly worktreeLease?: WorktreeLease;
  readonly handoffPacket?: HandoffPacket;
}

export interface PlannedRoute {
  readonly candidate: IdentityPoolMember;
  readonly portability: PortabilityScore;
  readonly decision: RouteDecision;
}

export interface RetryGuardrailInput {
  readonly failure: RuntimeFailure;
  readonly classification?: LimitClassification;
  readonly repeatedFailures: number;
  readonly maxRepeatedFailures?: number;
}

export type RetryGuardrailAction =
  | "retry_same_session"
  | "route_new_work_elsewhere"
  | "wait_for_reset"
  | "manual_review";

export interface RetryGuardrailDecision {
  readonly allowRetry: boolean;
  readonly action: RetryGuardrailAction;
  readonly reason: string;
  readonly retryAfterSeconds?: number;
  readonly sameProviderAccountSwitch?: LimitClassification["routingAction"]["sameProviderAccountSwitch"];
}

export interface FailurePolicyInput extends RetryGuardrailInput {
  readonly observedAt: string;
}

export type FailurePolicyAction =
  | RetryGuardrailAction
  | "pause_provider_family";

export interface FailurePolicyDecision {
  readonly allowRetry: boolean;
  readonly action: FailurePolicyAction;
  readonly reason: string;
  readonly retryAfterSeconds?: number;
  readonly providerCooldown?: ProviderFamilyCooldown;
  readonly sameProviderAccountSwitch?: LimitClassification["routingAction"]["sameProviderAccountSwitch"];
}

export interface RouteReplayEntry {
  readonly taskId: string;
  readonly selectedProvider: string;
  readonly selectedHarness: string;
  readonly selectedIdentityProfileId?: string;
  readonly preferredTarget?: string;
  readonly fallbackReason?: string;
  readonly portabilityScore?: number;
  readonly activeTurnTarget?: number;
  readonly cooldownState?: RouteDecisionCooldownState;
  readonly evidenceRefs: readonly RuntimeEvidenceRef[];
  readonly explanation: string;
}

export interface RouteStoreWriter {
  appendRouteDecision(decision: RouteDecision): Promise<unknown>;
}

export interface RouteStoreReader {
  listTaskRecords(taskId: string): Promise<ReadonlyArray<{ kind: string; payload: unknown }>>;
}

export type GuardedRequest = CreateSessionRequest | SendTurnRequest;

export interface LaunchGateInput<TRequest extends GuardedRequest> {
  readonly provider: AgentRuntimeProvider;
  readonly routeStore: RouteStoreWriter;
  readonly decision: RouteDecision;
  readonly request: TRequest;
}
