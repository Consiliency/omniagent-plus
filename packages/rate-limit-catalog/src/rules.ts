import type {
  LimitClassification,
  LimitScope,
  LimitType,
} from "@omniagent-plus/core-contracts";

import { createRoutingActionForLimitType } from "./routing-action.js";
import type { ClassifierInput } from "./types.js";

export interface NormalizedSignal {
  readonly provider?: string;
  readonly harness?: string;
  readonly statusCode?: number;
  readonly exitCode?: number;
  readonly bodyText?: string;
  readonly stderrText?: string;
  readonly stdoutText?: string;
  readonly combinedText: string;
  readonly headers: Record<string, string>;
  readonly retryAfterSeconds?: number;
  readonly resetAt?: string;
}

export interface ClassificationMatch {
  readonly type: LimitType;
  readonly scope: LimitScope;
  readonly confidence: number;
  readonly notes?: string[];
}

const safeHeaderPattern = /(retry-after|ratelimit|rate-limit|reset)/i;

const policyPatterns = [
  /\bpolicy\b/i,
  /\babuse\b/i,
  /\bsafety\b/i,
  /terms of service/i,
  /trust and safety/i,
  /blocked by review/i,
];

const explicitAuthPatterns = [
  /\bunauthorized\b/i,
  /\binvalid api key\b/i,
  /\bexpired api key\b/i,
  /\bauthentication\b/i,
  /\blogin required\b/i,
];

const billingProblemPatterns = [
  /\bbilling\b/i,
  /\bpayment required\b/i,
  /\bcredit balance\b/i,
  /\binsufficient credits?\b/i,
  /\baccount balance\b/i,
  /\bsubscription\b/i,
  /\breauth\b/i,
];

const monthlyPatterns = [
  /\binsufficient_quota\b/i,
  /\bmonthly\b/i,
  /\bspend(?:ing)? limit\b/i,
  /\bhard limit\b/i,
  /\bbudget exhausted\b/i,
  /\bcredits? exhausted\b/i,
];

const fixedWindowPatterns = [
  /\bquota exceeded\b/i,
  /\bdaily quota\b/i,
  /\bdaily limit\b/i,
  /\bwindow\b/i,
  /\bresets? at\b/i,
  /\buntil reset\b/i,
  /\busage (?:cap|limit)\b/i,
  /resource_exhausted/i,
];

const tokenPatterns = [
  /\btokens? per (?:minute|second|hour)\b/i,
  /\btpm\b/i,
  /\boutput tokens?\b/i,
  /\bprompt tokens?\b/i,
  /\bcontext tokens?\b/i,
];

const concurrencyPatterns = [
  /\bconcurren(?:cy|t)\b/i,
  /\btoo many active\b/i,
  /\balready in progress\b/i,
  /\bparallel requests?\b/i,
  /\bactive sessions?\b/i,
];

const accelerationPatterns = [
  /\bacceleration\b/i,
  /\bramp(?:ing)? too quickly\b/i,
  /\bincreasing too quickly\b/i,
  /\bgradually increase\b/i,
];

const overloadPatterns = [
  /\boverload(?:ed)?\b/i,
  /\bcapacity\b/i,
  /\bserver busy\b/i,
  /\btemporarily unavailable\b/i,
  /\bservice unavailable\b/i,
  /\btry again later\b/i,
  /\bupstream unavailable\b/i,
];

const burstPatterns = [
  /\brate limit\b/i,
  /\btoo many requests\b/i,
  /\brpm\b/i,
  /\brequests? per minute\b/i,
  /\bslow down\b/i,
  /\bretry after\b/i,
];

const nonLimitPatterns = [
  /\bvalidation\b/i,
  /\bschema\b/i,
  /\bmalformed\b/i,
  /\bmissing required\b/i,
  /\bconflict\b/i,
  /\bduplicate\b/i,
  /\bunsupported\b/i,
  /\bpayload\b/i,
];

const limitHintPatterns = [
  /\blimit\b/i,
  /\bquota\b/i,
  /\bretry after\b/i,
  /\btoo many requests\b/i,
  /resource_exhausted/i,
  /\bconcurren(?:cy|t)\b/i,
  /\boverload(?:ed)?\b/i,
];

const baseConfidenceByType: Record<LimitType, number> = {
  none: 0.9,
  burst_rate_limit: 0.74,
  token_rate_limit: 0.78,
  concurrency_limit: 0.76,
  fixed_window_usage_cap: 0.82,
  monthly_spend_or_quota_cap: 0.86,
  acceleration_limit: 0.76,
  overload_or_transient: 0.72,
  auth_or_billing_problem: 0.84,
  abuse_or_policy_block: 0.86,
  unknown_limit: 0.42,
};

function clampConfidence(value: number): number {
  return Number(Math.min(0.99, Math.max(0, value)).toFixed(2));
}

export function boostConfidence(value: number, delta: number): number {
  return clampConfidence(value + delta);
}

export function dedupeNotes(
  notes: Array<string | undefined>,
): string[] | undefined {
  const unique = [...new Set(
    notes.filter((note): note is string => Boolean(note && note.length > 0)),
  )];

  return unique.length === 0 ? undefined : unique;
}

function normalizeHeaderValue(value: string | number): string {
  return typeof value === "number" ? String(value) : value.trim();
}

function normalizeHeaders(
  headers: Record<string, string | number> | undefined,
): Record<string, string> {
  if (!headers) {
    return {};
  }

  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    normalized[key.toLowerCase()] = normalizeHeaderValue(value);
  }

  return normalized;
}

function truncateText(value: string | undefined, maxLength = 160): string | undefined {
  if (!value) {
    return undefined;
  }

  const collapsed = value.replace(/\s+/g, " ").trim();
  if (collapsed.length === 0) {
    return undefined;
  }

  return collapsed.length <= maxLength
    ? collapsed
    : `${collapsed.slice(0, maxLength - 3)}...`;
}

export function getSignalText(input: ClassifierInput): string {
  return [input.bodyText, input.stderrText, input.stdoutText]
    .filter((value): value is string => Boolean(value && value.length > 0))
    .join("\n");
}

function parseRetryAfterValue(value: string): number | undefined {
  const seconds = Number.parseInt(value, 10);
  return Number.isNaN(seconds) ? undefined : seconds;
}

function parseRetryAfterFromText(text: string): number | undefined {
  const match = text.match(
    /(?:retry|try again)\s+(?:after|in)\s+(\d+)\s*(?:seconds?|secs?|s)\b/i,
  );

  return match?.[1] ? Number.parseInt(match[1], 10) : undefined;
}

function parseResetValue(value: string): string | undefined {
  if (/^\d+$/.test(value)) {
    const numeric = Number.parseInt(value, 10);
    if (numeric > 1_000_000_000_000) {
      return new Date(numeric).toISOString();
    }

    if (numeric > 1_000_000_000) {
      return new Date(numeric * 1000).toISOString();
    }

    return undefined;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString();
}

function parseResetFromText(text: string): string | undefined {
  const match = text.match(
    /resets?\s+(?:at|on)\s+([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.+-]+Z)/i,
  );

  return match?.[1] ? parseResetValue(match[1]) : undefined;
}

function countPatternHits(text: string, patterns: RegExp[]): number {
  return patterns.reduce(
    (hits, pattern) => hits + (pattern.test(text) ? 1 : 0),
    0,
  );
}

function hasMeaningfulLimitHints(signal: NormalizedSignal): boolean {
  return (
    countPatternHits(signal.combinedText, limitHintPatterns) > 0 ||
    signal.retryAfterSeconds !== undefined ||
    signal.resetAt !== undefined
  );
}

function createMatch(
  type: LimitType,
  scope: LimitScope,
  signal: NormalizedSignal,
  patternHits: number,
  notes: string[],
): ClassificationMatch {
  let confidence = baseConfidenceByType[type];

  if (
    signal.statusCode === 429 &&
    type !== "none" &&
    type !== "auth_or_billing_problem" &&
    type !== "abuse_or_policy_block"
  ) {
    confidence += 0.08;
  }

  if (
    (signal.statusCode === 401 || signal.statusCode === 402 || signal.statusCode === 403) &&
    (type === "auth_or_billing_problem" || type === "abuse_or_policy_block")
  ) {
    confidence += 0.08;
  }

  if (
    (signal.statusCode === 503 || signal.statusCode === 529) &&
    type === "overload_or_transient"
  ) {
    confidence += 0.08;
  }

  if (signal.retryAfterSeconds !== undefined) {
    confidence += 0.08;
    notes.push("Observed retry-after evidence.");
  }

  if (signal.resetAt !== undefined) {
    confidence += 0.08;
    notes.push("Observed reset-time evidence.");
  }

  if (signal.provider || signal.harness) {
    confidence += 0.04;
  }

  confidence += Math.min(0.08, Math.max(0, patternHits - 1) * 0.04);

  return {
    type,
    scope,
    confidence: clampConfidence(confidence),
    notes: dedupeNotes(notes),
  };
}

export function sanitizeSignal(input: ClassifierInput): NormalizedSignal {
  const headers = normalizeHeaders(input.headers);
  const combinedText = getSignalText(input)
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  const retryAfterSeconds =
    headers["retry-after"] !== undefined
      ? parseRetryAfterValue(headers["retry-after"])
      : parseRetryAfterFromText(combinedText);

  let resetAt = parseResetFromText(combinedText);
  if (!resetAt) {
    for (const [key, value] of Object.entries(headers)) {
      if (!safeHeaderPattern.test(key)) {
        continue;
      }

      const parsed = parseResetValue(value);
      if (parsed) {
        resetAt = parsed;
        break;
      }
    }
  }

  return {
    bodyText: input.bodyText,
    combinedText,
    exitCode: input.exitCode,
    harness: input.harness,
    headers,
    provider: input.provider,
    resetAt,
    retryAfterSeconds,
    statusCode: input.statusCode,
    stderrText: input.stderrText,
    stdoutText: input.stdoutText,
  };
}

export function matchBaseClassification(signal: NormalizedSignal): ClassificationMatch {
  const text = signal.combinedText;
  const policyHits = countPatternHits(text, policyPatterns);
  if (policyHits > 0) {
    return createMatch(
      "abuse_or_policy_block",
      "identity_profile",
      signal,
      policyHits,
      ["Matched policy or abuse language."],
    );
  }

  const explicitAuthHits = countPatternHits(text, explicitAuthPatterns);
  const billingProblemHits = countPatternHits(text, billingProblemPatterns);
  if (
    signal.statusCode === 401 ||
    signal.statusCode === 402 ||
    ((signal.statusCode === 403 || signal.statusCode === undefined) &&
      explicitAuthHits + billingProblemHits > 0)
  ) {
    return createMatch(
      "auth_or_billing_problem",
      "identity_profile",
      signal,
      explicitAuthHits + billingProblemHits,
      ["Matched auth or billing failure language."],
    );
  }

  const overloadHits = countPatternHits(text, overloadPatterns);
  if (signal.statusCode === 503 || signal.statusCode === 529 || overloadHits > 0) {
    return createMatch(
      "overload_or_transient",
      "provider_family",
      signal,
      overloadHits || 1,
      ["Matched transient overload language."],
    );
  }

  const concurrencyHits = countPatternHits(text, concurrencyPatterns);
  if (concurrencyHits > 0) {
    return createMatch(
      "concurrency_limit",
      "session",
      signal,
      concurrencyHits,
      ["Matched active-session or concurrency language."],
    );
  }

  const accelerationHits = countPatternHits(text, accelerationPatterns);
  if (accelerationHits > 0) {
    return createMatch(
      "acceleration_limit",
      "provider_family",
      signal,
      accelerationHits,
      ["Matched acceleration or ramp-rate language."],
    );
  }

  const monthlyHits = countPatternHits(text, monthlyPatterns);
  if (monthlyHits > 0) {
    return createMatch(
      "monthly_spend_or_quota_cap",
      "organization",
      signal,
      monthlyHits,
      ["Matched hard spend or monthly quota language."],
    );
  }

  const fixedWindowHits = countPatternHits(text, fixedWindowPatterns);
  const hasQuotaResetEvidence =
    signal.resetAt !== undefined &&
    (text.includes("quota") || text.includes("usage cap") || text.includes("usage limit"));
  if (fixedWindowHits > 0 || hasQuotaResetEvidence) {
    return createMatch(
      "fixed_window_usage_cap",
      "project",
      signal,
      fixedWindowHits || 1,
      ["Matched reset-bound quota language."],
    );
  }

  const tokenHits = countPatternHits(text, tokenPatterns);
  if (tokenHits > 0) {
    return createMatch(
      "token_rate_limit",
      "model",
      signal,
      tokenHits,
      ["Matched token-based limit language."],
    );
  }

  if (signal.statusCode === 403 && billingProblemHits > 0) {
    return createMatch(
      "auth_or_billing_problem",
      "identity_profile",
      signal,
      billingProblemHits,
      ["Matched billing failure language."],
    );
  }

  const burstHits = countPatternHits(text, burstPatterns);
  if (burstHits > 0 || (signal.statusCode === 429 && signal.retryAfterSeconds !== undefined)) {
    return createMatch(
      "burst_rate_limit",
      "provider_family",
      signal,
      burstHits || 1,
      ["Matched retryable request-rate language."],
    );
  }

  const nonLimitHits = countPatternHits(text, nonLimitPatterns);
  if (
    signal.statusCode === 429 &&
    nonLimitHits > 0 &&
    !hasMeaningfulLimitHints(signal)
  ) {
    return createMatch(
      "none",
      "unknown",
      signal,
      nonLimitHits,
      ["Matched non-limit validation language."],
    );
  }

  if (signal.statusCode === 429 || hasMeaningfulLimitHints(signal)) {
    return createMatch(
      "unknown_limit",
      "unknown",
      signal,
      Math.max(1, countPatternHits(text, limitHintPatterns)),
      ["Signal looked limit-like but stayed below a confident class boundary."],
    );
  }

  return createMatch(
    "none",
    "unknown",
    signal,
    Math.max(1, nonLimitHits),
    ["No limit-specific evidence was present."],
  );
}

export function buildClassification(
  input: ClassifierInput,
  signal: NormalizedSignal,
  match: ClassificationMatch,
): LimitClassification {
  const headers = Object.fromEntries(
    Object.entries(signal.headers).filter(([key]) => safeHeaderPattern.test(key)),
  );

  return {
    confidence: match.confidence,
    harness: input.harness,
    provider: input.provider,
    rawSignal: {
      exitCode: input.exitCode,
      headers: Object.keys(headers).length > 0 ? headers : undefined,
      statusCode: input.statusCode,
      stderrExcerpt: truncateText(input.stderrText),
      stdoutExcerpt: truncateText(input.bodyText ?? input.stdoutText),
    },
    resetAt: signal.resetAt,
    retryAfterSeconds: signal.retryAfterSeconds,
    routingAction: createRoutingActionForLimitType(match.type),
    schema: "limit_classification.v0.1",
    scope: match.scope,
    type: match.type,
    notes: match.notes,
  };
}
