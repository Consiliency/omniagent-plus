import type {
  LimitClassification,
  LimitScope,
  LimitType,
} from "@omniagent-plus/core-contracts";

export interface ClassifierInput {
  readonly provider?: string;
  readonly harness?: string;
  readonly statusCode?: number;
  readonly exitCode?: number;
  readonly bodyText?: string;
  readonly stderrText?: string;
  readonly stdoutText?: string;
  readonly headers?: Record<string, string | number>;
}

export type FixtureCategory =
  | "providers"
  | "harnesses"
  | "negative"
  | "unknown";

export interface FixtureExpectation {
  readonly type: LimitType;
  readonly scope: LimitScope;
  readonly confidenceMin?: number;
  readonly retryAfterSeconds?: number;
  readonly resetAt?: string;
  readonly sameProviderAccountSwitch?: LimitClassification["routingAction"]["sameProviderAccountSwitch"];
}

export interface RateLimitFixture {
  readonly id: string;
  readonly note?: string;
  readonly signal: ClassifierInput;
  readonly expected: FixtureExpectation;
}

export interface RateLimitFixtureCatalog {
  readonly family: string;
  readonly fixtures: RateLimitFixture[];
}

export type RetryGuardrailReason =
  | "retry_allowed"
  | "hard_cap"
  | "wait_for_reset"
  | "classification_blocks_retry"
  | "retry_storm_guardrail";

export interface RetryGuardrailInput {
  readonly classification: LimitClassification;
  readonly repeatedAttempts: number;
  readonly maxRepeatedAttempts?: number;
}

export interface RetryGuardrailDecision {
  readonly classification: LimitClassification;
  readonly allowRetry: boolean;
  readonly nextDelaySeconds?: number;
  readonly reason: RetryGuardrailReason;
}
