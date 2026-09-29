import { createRequire } from "node:module";

import { z } from "zod";
import { metadataSchemaCheck } from "./redaction.js";

const require = createRequire(import.meta.url);

export const coordinationContractVersion = "0.6.3";

export const coordinationContractSchemaPaths = [
  "core/schemas/lease.schema.json",
  "core/schemas/lease-event.schema.json",
  "core/schemas/lease-store-protocol.schema.json",
  "core/schemas/coordination-channel-protocol.schema.json",
  "core/schemas/coordination-scenario.schema.json",
] as const;

export const coordinationContractVectorPaths = [
  "conformance/vectors/lease-acquire.json",
  "conformance/vectors/lease-event-carries-lease.json",
  "conformance/vectors/lease-expire.json",
  "conformance/vectors/lease-expiry-boundary.json",
  "conformance/vectors/lease-hard-degrades-to-soft.json",
  "conformance/vectors/lease-hard-mode-atomic.json",
  "conformance/vectors/lease-release.json",
  "conformance/vectors/lease-renew.json",
  "conformance/vectors/coordination-announce-intent-does-not-lease.json",
  "conformance/vectors/coordination-done-does-not-release-lease.json",
  "conformance/vectors/coordination-handoff-does-not-transfer-holder.json",
  "conformance/vectors/coordination-message-does-not-mutate-lease.json",
] as const;

export type CoordinationContractSchemaPath =
  (typeof coordinationContractSchemaPaths)[number];
export type CoordinationContractVectorPath =
  (typeof coordinationContractVectorPaths)[number];

export function loadCoordinationContractArtifact(path: string): unknown {
  return require(`@consiliency/contract/${path}`) as unknown;
}

export function loadCoordinationContractSchemas(): Record<CoordinationContractSchemaPath, unknown> {
  return Object.fromEntries(
    coordinationContractSchemaPaths.map((path) => [
      path,
      loadCoordinationContractArtifact(path),
    ]),
  ) as Record<CoordinationContractSchemaPath, unknown>;
}

export function loadCoordinationContractVectors(): Record<CoordinationContractVectorPath, unknown> {
  return Object.fromEntries(
    coordinationContractVectorPaths.map((path) => [
      path,
      loadCoordinationContractArtifact(path),
    ]),
  ) as Record<CoordinationContractVectorPath, unknown>;
}

const isoTimestampSecondsSchema = z
  .string()
  .regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$/);

export const consiliencyLeaseScopeSchema = z.object({
  granularity: z.enum(["repo", "path-set", "symbol"]),
  selector: z.array(
    z
      .string()
      .min(1)
      .refine((value) => !value.startsWith("/"), "absolute paths are not allowed")
      .refine((value) => !/(^|\/)\.\.($|\/)/.test(value), "parent path segments are not allowed")
      .refine((value) => !/^[A-Za-z]:[\\/]/.test(value), "drive-qualified paths are not allowed"),
  ).min(1),
});
export type ConsiliencyLeaseScope = z.infer<typeof consiliencyLeaseScopeSchema>;

export const consiliencyLeaseSchema = z.object({
  schema: z.literal("consiliency.lease.v1"),
  lease_id: z.string().regex(/^[a-z0-9][a-z0-9_.:-]*$/),
  holder: z.string().min(1),
  acquired_at: isoTimestampSecondsSchema,
  ttl_seconds: z.number().int().min(1).max(7_200),
  heartbeat_at: isoTimestampSecondsSchema,
  mode: z.enum(["soft", "hard"]),
  scope: consiliencyLeaseScopeSchema,
  phase: z.string().min(1),
});
export type ConsiliencyLease = z.infer<typeof consiliencyLeaseSchema>;

export const coordinationMessageTypes = [
  "request-yield",
  "announce-intent",
  "handoff",
  "done",
] as const;
export type CoordinationMessageType = (typeof coordinationMessageTypes)[number];

export const coordinationMessageSchema = z.object({
  schema: z.literal("consiliency.coordination_message.v1"),
  message_id: z.string().min(1),
  type: z.enum(coordinationMessageTypes),
  sender: z.string().min(1),
  created_at: z.string().datetime({ offset: true }),
  scope: consiliencyLeaseScopeSchema,
  target_holder: z.string().min(1).optional(),
  lease_id: z.string().min(1).optional(),
  handoff_packet_id: z.string().min(1).optional(),
  body: z.record(z.unknown()).optional(),
}).superRefine(metadataSchemaCheck);
export type CoordinationMessage = z.infer<typeof coordinationMessageSchema>;

export function toContractTimestamp(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function expiresAtForLease(lease: ConsiliencyLease): string {
  return new Date(
    Date.parse(lease.heartbeat_at) + lease.ttl_seconds * 1_000,
  ).toISOString();
}

export function isLeaseExpired(
  lease: ConsiliencyLease,
  now: string | Date,
): boolean {
  return Date.parse(typeof now === "string" ? now : now.toISOString())
    >= Date.parse(expiresAtForLease(lease));
}
