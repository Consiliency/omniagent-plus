import { z } from "zod";
import { opaqueExportPath, projectMetadataExport, metadataSchemaCheck } from "@consiliency/runtime-provider";

import { cliErrorSchema, type CliErrorPayload } from "./errors.js";
import {
  commandResultSchema,
  type CliCommandKey,
  type CliCommandResult,
} from "./types.js";

const cliEnvelopeBaseSchema = z.object({
  schema: z.literal("omniagent_cli_envelope.v0.1"),
  command: z.string().min(1),
  stateRoot: z.string().min(1).transform(opaqueExportPath),
});

export const cliSuccessEnvelopeSchema = cliEnvelopeBaseSchema.extend({
  ok: z.literal(true),
  result: commandResultSchema,
});

export const cliErrorEnvelopeSchema = cliEnvelopeBaseSchema.extend({
  ok: z.literal(false),
  error: cliErrorSchema,
});

export const cliEnvelopeSchema = z.union([
  cliSuccessEnvelopeSchema,
  cliErrorEnvelopeSchema,
]).superRefine(metadataSchemaCheck);

export type CliEnvelope = z.infer<typeof cliEnvelopeSchema>;

export function createSuccessEnvelope(
  command: CliCommandKey,
  stateRoot: string,
  result: CliCommandResult,
): CliEnvelope {
  return cliSuccessEnvelopeSchema.parse(projectMetadataExport({
    schema: "omniagent_cli_envelope.v0.1",
    ok: true,
    command,
    stateRoot,
    result,
  }));
}

export function createErrorEnvelope(
  command: string,
  stateRoot: string,
  error: CliErrorPayload,
): CliEnvelope {
  return cliErrorEnvelopeSchema.parse(projectMetadataExport({
    schema: "omniagent_cli_envelope.v0.1",
    ok: false,
    command,
    stateRoot,
    error,
  }));
}

function sortKeys(record: Record<string, unknown>): string[] {
  return Object.keys(record).sort((left, right) => {
    if (left === "schema") {
      return -1;
    }
    if (right === "schema") {
      return 1;
    }
    return left.localeCompare(right);
  });
}

function renderScalar(value: string | number | boolean | null): string {
  if (value === null) {
    return "null";
  }
  return String(value);
}

function renderValue(value: unknown, indent: number): string[] {
  const pad = " ".repeat(indent);

  if (value === null || value === undefined) {
    return [`${pad}${renderScalar(value ?? null)}`];
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return [`${pad}${renderScalar(value)}`];
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return [`${pad}[]`];
    }
    if (
      value.every(
        (entry) =>
          entry === null
          || typeof entry === "string"
          || typeof entry === "number"
          || typeof entry === "boolean",
      )
    ) {
      return [`${pad}${value.map((entry) => renderScalar(entry as string | number | boolean | null)).join(", ")}`];
    }

    return value.flatMap((entry) => {
      const lines = renderValue(entry, indent + 2);
      const [first, ...rest] = lines;
      return [`${pad}- ${(first ?? "").trimStart()}`, ...rest];
    });
  }

  if (typeof value === "object") {
    return sortKeys(value as Record<string, unknown>).flatMap((key) => {
      const child = (value as Record<string, unknown>)[key];
      if (
        child === null
        || child === undefined
        || typeof child === "string"
        || typeof child === "number"
        || typeof child === "boolean"
      ) {
        return [`${pad}${key}: ${renderScalar(child ?? null)}`];
      }

      const lines = renderValue(child, indent + 2);
      return [`${pad}${key}:`, ...lines];
    });
  }

  return [`${pad}${String(value)}`];
}

export function renderEnvelopeText(envelope: CliEnvelope): string {
  envelope = cliEnvelopeSchema.parse(projectMetadataExport(envelope));
  const body = envelope.ok ? envelope.result : envelope.error;
  const bodyLabel = envelope.ok ? "Result" : "Error";

  return [
    `Command: ${envelope.command}`,
    `State root: ${envelope.stateRoot}`,
    `Status: ${envelope.ok ? "ok" : "error"}`,
    `${bodyLabel}:`,
    ...renderValue(body, 2),
  ].join("\n");
}

export function serializeEnvelope(
  envelope: CliEnvelope,
  json: boolean,
): string {
  envelope = cliEnvelopeSchema.parse(projectMetadataExport(envelope));
  return json
    ? `${JSON.stringify(envelope, null, 2)}\n`
    : `${renderEnvelopeText(envelope)}\n`;
}
