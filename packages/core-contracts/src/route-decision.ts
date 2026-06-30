import { z } from "zod";

import { runtimeEvidenceRefSchema } from "./redaction.js";

export const routeDecisionLaunchGateActions = [
  "allowed",
  "wait_for_reset",
  "manual_confirmation_required",
  "blocked",
] as const;
export type RouteDecisionLaunchGateAction =
  (typeof routeDecisionLaunchGateActions)[number];

export interface RouteDecisionPreferredTarget {
  readonly provider?: string;
  readonly harness?: string;
  readonly identityProfileId?: string;
}

export interface RouteDecisionCooldownState {
  readonly providerFamilyBlocked: boolean;
  readonly identityBlocked: boolean;
  readonly reason?: string;
  readonly resetAt?: string;
  readonly sameProviderAccountSwitch:
    | "forbidden"
    | "manual_confirmation_required"
    | "allowed_by_policy";
}

export interface RouteDecisionLaunchGate {
  readonly action: RouteDecisionLaunchGateAction;
  readonly reason: string;
  readonly routeDecisionPersisted: boolean;
  readonly labelsMatch: boolean;
  readonly manualConfirmationProvided: boolean;
}

export interface RouteDecision {
  readonly schema: "route_decision.v0.1";
  readonly taskId: string;
  readonly selectedProvider: string;
  readonly selectedHarness: string;
  readonly selectedIdentityProfileId?: string;
  readonly preferredProvider?: string;
  readonly preferredHarness?: string;
  readonly fallbackUsed: boolean;
  readonly fallbackReason?: string;
  readonly capabilityFit: number;
  readonly providerHealth: number;
  readonly currentCapacity: number;
  readonly preferredTarget?: RouteDecisionPreferredTarget;
  readonly contextPortability: "low" | "medium" | "high";
  readonly portabilityScore?: number;
  readonly activeTurnTarget?: number;
  readonly cooldownState?: RouteDecisionCooldownState;
  readonly launchGate?: RouteDecisionLaunchGate;
  readonly routeReason:
    | "explicit_override"
    | "capability_fit"
    | "load_balance"
    | "provider_cooldown"
    | "usage_cap"
    | "transient_failure"
    | "manual";
  readonly silentDowngrade: false;
  readonly evidenceRefs?: Array<z.infer<typeof runtimeEvidenceRefSchema>>;
}

export const routeDecisionPreferredTargetSchema = z.object({
  provider: z.string().min(1).optional(),
  harness: z.string().min(1).optional(),
  identityProfileId: z.string().min(1).optional(),
});

export const routeDecisionCooldownStateSchema = z.object({
  providerFamilyBlocked: z.boolean(),
  identityBlocked: z.boolean(),
  reason: z.string().min(1).optional(),
  resetAt: z.string().datetime({ offset: true }).optional(),
  sameProviderAccountSwitch: z.enum([
    "forbidden",
    "manual_confirmation_required",
    "allowed_by_policy",
  ]),
});

export const routeDecisionLaunchGateSchema = z.object({
  action: z.enum(routeDecisionLaunchGateActions),
  reason: z.string().min(1),
  routeDecisionPersisted: z.boolean(),
  labelsMatch: z.boolean(),
  manualConfirmationProvided: z.boolean(),
});

export const routeDecisionSchema = z.object({
  schema: z.literal("route_decision.v0.1"),
  taskId: z.string().min(1),
  selectedProvider: z.string().min(1),
  selectedHarness: z.string().min(1),
  selectedIdentityProfileId: z.string().min(1).optional(),
  preferredProvider: z.string().min(1).optional(),
  preferredHarness: z.string().min(1).optional(),
  fallbackUsed: z.boolean(),
  fallbackReason: z.string().min(1).optional(),
  capabilityFit: z.number().min(0).max(1),
  providerHealth: z.number().min(0).max(1),
  currentCapacity: z.number().min(0).max(1),
  preferredTarget: routeDecisionPreferredTargetSchema.optional(),
  contextPortability: z.enum(["low", "medium", "high"]),
  portabilityScore: z.number().min(0).max(1).optional(),
  activeTurnTarget: z.number().int().nonnegative().optional(),
  cooldownState: routeDecisionCooldownStateSchema.optional(),
  launchGate: routeDecisionLaunchGateSchema.optional(),
  routeReason: z.enum([
    "explicit_override",
    "capability_fit",
    "load_balance",
    "provider_cooldown",
    "usage_cap",
    "transient_failure",
    "manual",
  ]),
  silentDowngrade: z.literal(false),
  evidenceRefs: z.array(runtimeEvidenceRefSchema).optional(),
});
