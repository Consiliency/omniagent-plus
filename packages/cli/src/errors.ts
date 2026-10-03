import {
  isRuntimeFailure,
  sanitizeMetadataText,
  type RuntimeFailure,
} from "@consiliency/runtime-provider";
import { ZodError, z } from "zod";
import { CoordinationBackendError } from "@omniagent-plus/state-ledger";

export const cliErrorCategories = [
  "argument_error",
  "missing_record",
  "validation_failure",
  "policy_block",
  "cleanup_block",
  "route_block",
  "internal_failure",
] as const;
export type CliErrorCategory = (typeof cliErrorCategories)[number];

export const cliExitCodeByCategory: Record<CliErrorCategory, number> = {
  internal_failure: 1,
  argument_error: 2,
  missing_record: 3,
  validation_failure: 4,
  policy_block: 5,
  cleanup_block: 6,
  route_block: 7,
};

export const cliErrorSchema = z.object({
  schema: z.literal("omniagent_cli_error.v0.1"),
  category: z.enum(cliErrorCategories),
  code: z.number().int().positive(),
  message: z.string().min(1),
  details: z.record(z.string(), z.unknown()).optional(),
});
export type CliErrorPayload = z.infer<typeof cliErrorSchema>;

function sanitizeMessage(message: string): string {
  try {
    return sanitizeMetadataText(message, "cli error message", 512);
  } catch {
    return "Command failed with redacted diagnostics.";
  }
}

function sanitizeDetailString(value: string, label: string): string {
  try {
    return sanitizeMetadataText(value, label, 512);
  } catch {
    return "[redacted]";
  }
}

export function sanitizeErrorDetails(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === "string") {
    return sanitizeDetailString(value, "cli error detail");
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeErrorDetails(entry));
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        sanitizeErrorDetails(entry),
      ]),
    );
  }
  return String(value);
}

export class CliError extends Error {
  readonly payload: CliErrorPayload;

  constructor(
    category: CliErrorCategory,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(sanitizeMessage(message));
    this.name = "CliError";
    this.payload = cliErrorSchema.parse({
      schema: "omniagent_cli_error.v0.1",
      category,
      code: cliExitCodeByCategory[category],
      message: this.message,
      details:
        details === undefined
          ? undefined
          : (sanitizeErrorDetails(details) as Record<string, unknown>),
    });
  }
}

export function createCliError(
  category: CliErrorCategory,
  message: string,
  details?: Record<string, unknown>,
): CliError {
  return new CliError(category, message, details);
}

function mapRuntimeFailureCategory(
  failure: RuntimeFailure,
): CliErrorCategory {
  switch (failure.category) {
    case "validation":
    case "malformed_response":
    case "backend_version_mismatch":
    case "backend_capability_missing":
      return "validation_failure";
    case "policy_denied":
    case "approval_required":
    case "approval_denied":
    case "auth":
    case "billing":
      return "policy_block";
    case "rate_limit":
    case "concurrency_limit":
    case "transport":
    case "timeout":
      return "route_block";
    case "state_conflict":
      return "cleanup_block";
    default:
      return "internal_failure";
  }
}

export function normalizeCliError(error: unknown): CliErrorPayload {
  if (error instanceof CliError) {
    return error.payload;
  }
  if (error instanceof CoordinationBackendError) return createCliError("route_block", "Coordination backend failed.", { cause: error.failureCause }).payload;

  if (error instanceof ZodError) {
    return createCliError("validation_failure", "Validation failed.", {
      issues: error.issues.map((issue) => ({
        code: issue.code,
        path: issue.path.join("."),
        message: issue.message,
      })),
    }).payload;
  }

  if (isRuntimeFailure(error)) {
    return createCliError(
      mapRuntimeFailureCategory(error),
      error.message,
      {
        runtimeFailure: error,
      },
    ).payload;
  }

  if (error instanceof Error) {
    return createCliError("internal_failure", error.message).payload;
  }

  return createCliError("internal_failure", "Unexpected internal failure.", {
    valueType: typeof error,
  }).payload;
}
