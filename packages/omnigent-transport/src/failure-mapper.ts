import {
  createRuntimeFailure,
  type RuntimeFailure,
  type LimitClassification,
} from "@consiliency/runtime-provider";

import type { OmnigentHttpError } from "./http-client.js";
import type { OmnigentCliCommandResult } from "./types.js";

export interface FailureMappingResult {
  readonly failure: RuntimeFailure;
  readonly limitClassification?: LimitClassification;
}

function truncate(value: string | undefined, maxLength = 160): string | undefined {
  if (!value) {
    return undefined;
  }

  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 3)}...`;
}

function defaultRoutingAction(
  overrides: Partial<LimitClassification["routingAction"]> = {},
): LimitClassification["routingAction"] {
  return {
    migrateExistingPortableWork: false,
    reduceConcurrency: false,
    requireManualReview: false,
    retrySameSession: false,
    routeNewWorkElsewhere: false,
    sameProviderAccountSwitch: "forbidden",
    ...overrides,
  };
}

function createLimitCandidate(
  input: Omit<LimitClassification, "schema">,
): LimitClassification {
  return {
    schema: "limit_classification.v0.1",
    ...input,
  };
}

function classifyHttpBody(body: unknown): string {
  if (typeof body === "string") {
    return body.toLowerCase();
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return "";
  }

  const record = body as Record<string, unknown>;
  const signals = [record.code, record.message, record.error].filter(
    (value): value is string => typeof value === "string",
  );
  if (typeof record.detail === "string") {
    signals.push(record.detail);
  } else if (
    typeof record.detail === "object" &&
    record.detail !== null &&
    !Array.isArray(record.detail)
  ) {
    const detail = record.detail as Record<string, unknown>;
    signals.push(
      ...[detail.code, detail.message, detail.error].filter(
        (value): value is string => typeof value === "string",
      ),
    );
  }

  return signals.join(" ").toLowerCase();
}

export function mapCapabilityGap(
  capability: string,
  note?: string,
): FailureMappingResult {
  return {
    failure: createRuntimeFailure({
      actor: "omnigent",
      category: "backend_capability_missing",
      message: note ?? `Omnigent does not publish a stable ${capability} capability.`,
      retryable: false,
      safeDiagnostics: {
        capability,
      },
      scope: "turn",
    }),
  };
}

export function mapDisconnectedBackend(
  surface: "http" | "cli" | "stream" | "process",
  error?: Error,
): FailureMappingResult {
  return {
    failure: createRuntimeFailure({
      actor: surface === "stream" ? "network" : "omnigent",
      category: surface === "stream" ? "transport" : "backend_unavailable",
      message:
        error?.message ??
        `Omnigent ${surface} surface became unavailable before the operation completed.`,
      retryable: true,
      safeDiagnostics: {
        surface,
      },
      scope: "system",
    }),
  };
}

export function mapProcessFailure(
  message: string,
  processGroupId?: number,
): FailureMappingResult {
  return {
    failure: createRuntimeFailure({
      actor: "omnigent",
      category: "backend_unavailable",
      message,
      retryable: true,
      safeDiagnostics:
        processGroupId === undefined
          ? undefined
          : { processGroupId },
      scope: "system",
    }),
  };
}

export function mapCliFailure(
  result: OmnigentCliCommandResult,
): FailureMappingResult {
  const stderr = result.stderr.toLowerCase();
  if (stderr.includes("billing") || stderr.includes("quota")) {
    return {
      failure: createRuntimeFailure({
        actor: "omnigent",
        category: "billing",
        message: truncate(result.stderr) ?? "CLI reported a billing failure.",
        retryable: false,
        safeDiagnostics: {
          command: result.command.join(" "),
          exitCode: result.exitCode,
        },
        scope: "system",
      }),
      limitClassification: createLimitCandidate({
        confidence: 0.9,
        harness: "omnigent-cli",
        notes: ["CLI output mentioned billing or quota."],
        rawSignal: {
          exitCode: result.exitCode,
          stderrExcerpt: truncate(result.stderr),
        },
        routingAction: defaultRoutingAction({
          requireManualReview: true,
        }),
        scope: "project",
        type: "auth_or_billing_problem",
      }),
    };
  }

  return {
    failure: createRuntimeFailure({
      actor: "omnigent",
      category: "backend_unavailable",
      message: truncate(result.stderr) ?? "CLI transport command failed.",
      retryable: false,
      safeDiagnostics: {
        command: result.command.join(" "),
        exitCode: result.exitCode,
      },
      scope: "system",
    }),
  };
}

export function mapHttpFailure(error: OmnigentHttpError): FailureMappingResult {
  const bodyText = classifyHttpBody(error.body);
  const statusCode = error.statusCode;
  const retryAfterHeader = error.headers["retry-after"];
  const retryAfterSeconds =
    retryAfterHeader === undefined ? undefined : Number.parseInt(retryAfterHeader, 10);

  if (statusCode === 429) {
    const hardCap =
      bodyText.includes("usage cap") ||
      bodyText.includes("quota") ||
      bodyText.includes("monthly");
    return {
      failure: createRuntimeFailure({
        actor: "omnigent",
        category: "rate_limit",
        message:
          truncate(bodyText) ?? "HTTP transport reported a rate-limit-like failure.",
        retryAfterSeconds:
          Number.isNaN(retryAfterSeconds ?? Number.NaN)
            ? undefined
            : retryAfterSeconds,
        retryable: !hardCap,
        safeDiagnostics: {
          path: error.path,
          statusCode,
        },
        scope: "turn",
      }),
      limitClassification: createLimitCandidate({
        confidence: hardCap ? 0.95 : 0.75,
        provider: "omnigent-http",
        rawSignal: {
          headers: retryAfterHeader
            ? {
                "retry-after": retryAfterHeader,
              }
            : undefined,
          statusCode,
          stdoutExcerpt: truncate(bodyText),
        },
        retryAfterSeconds:
          Number.isNaN(retryAfterSeconds ?? Number.NaN)
            ? undefined
            : retryAfterSeconds,
        routingAction: defaultRoutingAction({
          reduceConcurrency: true,
          requireManualReview: hardCap,
          retrySameSession: !hardCap,
          routeNewWorkElsewhere: !hardCap,
        }),
        scope: hardCap ? "project" : "provider_family",
        type: hardCap ? "fixed_window_usage_cap" : "burst_rate_limit",
      }),
    };
  }

  if (statusCode === 403 && (bodyText.includes("billing") || bodyText.includes("auth"))) {
    return {
      failure: createRuntimeFailure({
        actor: "omnigent",
        category: bodyText.includes("billing") ? "billing" : "auth",
        message: truncate(bodyText) ?? "HTTP transport reported an auth/billing failure.",
        retryable: false,
        safeDiagnostics: {
          path: error.path,
          statusCode,
        },
        scope: "identity_profile",
      }),
      limitClassification: createLimitCandidate({
        confidence: 0.9,
        provider: "omnigent-http",
        rawSignal: {
          statusCode,
          stdoutExcerpt: truncate(bodyText),
        },
        routingAction: defaultRoutingAction({
          requireManualReview: true,
        }),
        scope: "identity_profile",
        type: "auth_or_billing_problem",
      }),
    };
  }

  if (statusCode === 403) {
    return {
      failure: createRuntimeFailure({
        actor: "policy",
        category: "policy_denied",
        message: truncate(bodyText) ?? "HTTP transport reported a policy failure.",
        retryable: false,
        safeDiagnostics: {
          path: error.path,
          statusCode,
        },
        scope: "request",
      }),
      limitClassification: createLimitCandidate({
        confidence: 0.85,
        provider: "omnigent-http",
        rawSignal: {
          statusCode,
          stdoutExcerpt: truncate(bodyText),
        },
        routingAction: defaultRoutingAction({
          requireManualReview: true,
          routeNewWorkElsewhere: true,
        }),
        scope: "project",
        type: "abuse_or_policy_block",
      }),
    };
  }

  if (statusCode === 400 || statusCode === 422) {
    return {
      failure: createRuntimeFailure({
        actor: "provider",
        category: statusCode === 400 ? "validation" : "protocol",
        message: truncate(bodyText) ?? `HTTP ${statusCode} request validation failed.`,
        retryable: false,
        safeDiagnostics: {
          path: error.path,
          statusCode,
        },
        scope: "request",
      }),
    };
  }

  if (statusCode >= 500) {
    return mapDisconnectedBackend("http", error);
  }

  return {
    failure: createRuntimeFailure({
      actor: "omnigent",
      category: "transport",
      message: truncate(bodyText) ?? `HTTP ${statusCode} transport failure.`,
      retryable: false,
      safeDiagnostics: {
        path: error.path,
        statusCode,
      },
      scope: "request",
    }),
  };
}
