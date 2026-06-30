import type {
  LimitClassification,
  LimitType,
} from "@omniagent-plus/core-contracts";

type RoutingAction = LimitClassification["routingAction"];

export interface RoutingActionOverrides extends Partial<RoutingAction> {
  readonly sameProviderAccountSwitch?: RoutingAction["sameProviderAccountSwitch"];
}

const routingActionMatrix: Record<LimitType, RoutingAction> = {
  none: {
    migrateExistingPortableWork: false,
    reduceConcurrency: false,
    requireManualReview: false,
    retrySameSession: false,
    routeNewWorkElsewhere: false,
    sameProviderAccountSwitch: "forbidden",
  },
  burst_rate_limit: {
    migrateExistingPortableWork: false,
    reduceConcurrency: true,
    requireManualReview: false,
    retrySameSession: true,
    routeNewWorkElsewhere: true,
    sameProviderAccountSwitch: "forbidden",
  },
  token_rate_limit: {
    migrateExistingPortableWork: true,
    reduceConcurrency: true,
    requireManualReview: false,
    retrySameSession: true,
    routeNewWorkElsewhere: true,
    sameProviderAccountSwitch: "forbidden",
  },
  concurrency_limit: {
    migrateExistingPortableWork: false,
    reduceConcurrency: true,
    requireManualReview: false,
    retrySameSession: true,
    routeNewWorkElsewhere: false,
    sameProviderAccountSwitch: "forbidden",
  },
  fixed_window_usage_cap: {
    migrateExistingPortableWork: true,
    reduceConcurrency: false,
    requireManualReview: false,
    retrySameSession: false,
    routeNewWorkElsewhere: true,
    sameProviderAccountSwitch: "manual_confirmation_required",
  },
  monthly_spend_or_quota_cap: {
    migrateExistingPortableWork: true,
    reduceConcurrency: false,
    requireManualReview: true,
    retrySameSession: false,
    routeNewWorkElsewhere: true,
    sameProviderAccountSwitch: "manual_confirmation_required",
  },
  acceleration_limit: {
    migrateExistingPortableWork: false,
    reduceConcurrency: true,
    requireManualReview: false,
    retrySameSession: true,
    routeNewWorkElsewhere: true,
    sameProviderAccountSwitch: "forbidden",
  },
  overload_or_transient: {
    migrateExistingPortableWork: false,
    reduceConcurrency: true,
    requireManualReview: false,
    retrySameSession: true,
    routeNewWorkElsewhere: true,
    sameProviderAccountSwitch: "forbidden",
  },
  auth_or_billing_problem: {
    migrateExistingPortableWork: true,
    reduceConcurrency: false,
    requireManualReview: true,
    retrySameSession: false,
    routeNewWorkElsewhere: true,
    sameProviderAccountSwitch: "forbidden",
  },
  abuse_or_policy_block: {
    migrateExistingPortableWork: false,
    reduceConcurrency: false,
    requireManualReview: true,
    retrySameSession: false,
    routeNewWorkElsewhere: true,
    sameProviderAccountSwitch: "forbidden",
  },
  unknown_limit: {
    migrateExistingPortableWork: false,
    reduceConcurrency: false,
    requireManualReview: true,
    retrySameSession: false,
    routeNewWorkElsewhere: false,
    sameProviderAccountSwitch: "manual_confirmation_required",
  },
};

export function createRoutingActionForLimitType(
  type: LimitType,
  overrides: RoutingActionOverrides = {},
): RoutingAction {
  return {
    ...routingActionMatrix[type],
    ...overrides,
  };
}
