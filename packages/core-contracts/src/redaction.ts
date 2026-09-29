import { createHash } from "node:crypto";
import { isAbsolute, posix } from "node:path";
import { types } from "node:util";

import { z } from "zod";

export const redactionStatuses = [
  "metadata_only",
  "content_allowed",
  "content_redacted",
] as const;
export type RedactionStatus = (typeof redactionStatuses)[number];

export const DEFAULT_METADATA_TEXT_MAX_BYTES = 280;
export const DEFAULT_UNTRUSTED_TEXT_MAX_BYTES = 2048;

const secretTextPatterns: Array<{
  readonly reason: string;
  readonly pattern: RegExp;
}> = [
  {
    reason: "bearer_token",
    pattern: /\bbearer\s+[a-z0-9._~+/=-]{8,}/i,
  },
  {
    reason: "api_key_token",
    pattern: /\b(?:(?:sk-|gh[pousr]_|xox[baprs]?-|glpat-|AIza)[a-z0-9._-]{8,}|npm_[a-z0-9]{8,})\b/i,
  },
  {
    reason: "auth_assignment",
    pattern: /(?<![a-z0-9_])(?:[a-z][a-z0-9_]*_)?(?:password|passwd|token|credential|authorization|api_key|access_key|client_secret|secret_key|service_role_key|secret)\s*(?:=|:)\s*\S+/i,
  },
  {
    reason: "secret_env_assignment",
    pattern:
      /\bOMNIGENT_[A-Z0-9_]*(?:API_KEY|TOKEN|SECRET|CREDENTIAL|PASSWORD|KEY)\s*=\s*\S+/i,
  },
  {
    reason: "private_key",
    pattern: /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/,
  },
  { reason: "aws_access_key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { reason: "jwt_token", pattern: /\beyJ[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}\b/i },
  { reason: "auth_header", pattern: /\b(?:authorization|x-api-key|cookie)\s*:\s*\S+/i },
  { reason: "url_userinfo", pattern: /\b[a-z][a-z0-9+.-]*:\/\/[^/\s@]+:[^/\s@]+@/i },
  { reason: "home_path", pattern: /(?:\/(?:home|Users)\/[^/\s]+|[A-Z]:[\\/]Users[\\/][^\\/\s]+)/i },
];

const secretPathPatterns = [
  /(^|\/)\.env(?:\.|$)/i,
  /(^|\/)\.ssh(\/|$)/,
  /(^|\/)(?:secrets?|credentials?|private)(\/|$)/i,
  /(^|\/)(?:\.npmrc|\.netrc|\.git-credentials)$/i,
  /(^|\/)(?:\.kube\/config|\.docker\/config\.json)$/i,
  /(^|\/)id_(?:rsa|ed25519|ecdsa)(?:\.pub)?$/i,
  /\.(?:pem|p12|key|jks|pfx)$/i,
  /(^|\/)\.recovery(?:\/|$)/,
] as const;

const envDumpPattern = /(^|\n)(?:HOME|PATH|PWD|OPENAI_API_KEY|ANTHROPIC_API_KEY|GOOGLE_API_KEY|AZURE_OPENAI_API_KEY|OMNIGENT_[A-Z0-9_]*(?:API_KEY|TOKEN|SECRET|CREDENTIAL|PASSWORD|KEY))=/m;
const privateRecoveryReferencePattern = /(?:^|[^a-z0-9_.-])\.recovery(?:[\\/]|$|[^a-z0-9_.-])/i;

export interface MetadataLeak { readonly path: string; readonly reason: string }

function plainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function inertMetadataObject(value: object): boolean {
  if (types.isProxy(value) || types.isBoxedPrimitive(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (Array.isArray(value) ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).some((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(descriptors, key)!.value as PropertyDescriptor;
    return !("value" in descriptor) || ["function", "symbol", "bigint"].includes(typeof descriptor.value);
  })) return false;
  const hook = descriptors.toJSON ?? (prototype === null ? undefined : Object.getOwnPropertyDescriptor(prototype, "toJSON"));
  return hook === undefined || ("value" in hook && typeof hook.value !== "function");
}

function providerPayload(value: unknown): boolean {
  if (!plainRecord(value) || !inertMetadataObject(value)) return false;
  return (Array.isArray(value.choices) && inertMetadataObject(value.choices) && value.choices.some((item) => plainRecord(item) && inertMetadataObject(item) && ("message" in item || "delta" in item)))
    || (Array.isArray(value.messages) && inertMetadataObject(value.messages) && value.messages.some((item) => plainRecord(item) && inertMetadataObject(item) && "role" in item))
    || (Array.isArray(value.candidates) && inertMetadataObject(value.candidates) && value.candidates.some((item) => plainRecord(item) && inertMetadataObject(item) && "content" in item))
    || (typeof value.anthropic_version === "string") || plainRecord(value.providerPayload);
}

function sensitiveField(key: string, value: unknown): boolean {
  const normalized = key.replaceAll(/[^a-z0-9]/gi, "").toLowerCase();
  if (normalized === "fencingtoken" || (normalized === "autorefreshtoken" && typeof value === "boolean")) return false;
  return /^(?:tokens|passwords|secrets|cookies|apikeys)$/.test(normalized)
    || /(?:password|passwd|token|credentials?|authorization|authheader|apikey|accesskey|secret|secretkey|privatekey|servicerolekey|cookie)$/.test(normalized);
}

function redactedConfigPlaceholder(value: unknown): boolean {
  return plainRecord(value) && inertMetadataObject(value) && Object.keys(value).every((key) => ["schema", "value", "reason", "updatedAt"].includes(key))
    && redactedConfigValueSchema.safeParse(value).success;
}

export function scanMetadataLeaks(value: unknown, options: { readonly allowHomePaths?: boolean; readonly inertOnly?: boolean } = {}): MetadataLeak[] {
  const leaks: MetadataLeak[] = [];
  const visit = (entry: unknown, path: string, depth: number) => {
    if (depth > 64) { leaks.push({ path, reason: "metadata_depth_limit" }); return; }
    if (["function", "symbol", "bigint"].includes(typeof entry)
      || (entry !== null && typeof entry === "object" && !inertMetadataObject(entry))) {
      leaks.push({ path, reason: "non_json_metadata" }); return;
    }
    if (options.inertOnly && entry !== null && typeof entry === "object") {
      const descriptors = Object.getOwnPropertyDescriptors(entry);
      Reflect.ownKeys(descriptors).forEach((key, index) => {
        const descriptor = Object.getOwnPropertyDescriptor(descriptors, key)!.value as PropertyDescriptor;
        visit(descriptor.value, `${path}.[field-${index}]`, depth + 1);
      });
      return;
    }
    if (typeof entry === "string") {
      if (options.inertOnly) return;
      if (privateRecoveryReferencePattern.test(entry)) leaks.push({ path, reason: "private_recovery_path" });
      if (envDumpPattern.test(entry)) leaks.push({ path, reason: "environment_dump" });
      for (const rule of secretTextPatterns) if (!(options.allowHomePaths && rule.reason === "home_path") && rule.pattern.test(entry)) leaks.push({ path, reason: rule.reason });
      try {
        const parsed: unknown = JSON.parse(entry);
        if (typeof parsed === "string" || plainRecord(parsed) || Array.isArray(parsed)) visit(parsed, path, depth + 1);
      } catch { /* Ordinary text remains text. */ }
      return;
    }
    if (Array.isArray(entry)) { entry.forEach((item, index) => visit(item, `${path}[${index}]`, depth + 1)); return; }
    if (!plainRecord(entry)) return;
    if (!options.inertOnly && providerPayload(entry)) leaks.push({ path, reason: "provider_payload" });
    Object.entries(entry).forEach(([key, item], index) => {
      const safeKey = /^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/.test(key) && !secretTextPatterns.some((rule) => rule.pattern.test(key)) ? key : `[field-${index}]`;
      const next = `${path}.${safeKey}`;
      if (sensitiveField(key, item) && item !== undefined && !redactedConfigPlaceholder(item)) leaks.push({ path: next, reason: "sensitive_field" });
      if ((key === "env" || key === "environment") && plainRecord(item) && inertMetadataObject(item) && !redactedConfigPlaceholder(item) && Object.keys(item).length > 0
        && Object.values(item).every((field) => typeof field === "string" || field === undefined)) leaks.push({ path: next, reason: "environment_dump" });
      if (privateRecoveryReferencePattern.test(key) || secretTextPatterns.some((rule) => rule.pattern.test(key))) leaks.push({ path: `${path}.[field-${index}]`, reason: "sensitive_field_name" });
      visit(item, next, depth + 1);
    });
  };
  visit(value, "$", 0);
  return leaks;
}

export function assertMetadataSafe(value: unknown, options: { readonly inertOnly?: boolean } = {}): void {
  const first = scanMetadataLeaks(value, options)[0];
  if (first) throw new Error(`Metadata contains ${first.reason === "provider_payload" ? "raw provider payload" : first.reason.replaceAll("_", " ")}.`);
}

export function metadataSchemaCheck(value: unknown, context: z.RefinementCtx): void {
  for (const leak of scanMetadataLeaks(value)) context.addIssue({ code: z.ZodIssueCode.custom, message: `Metadata contains ${leak.reason === "provider_payload" ? "raw provider payload" : leak.reason.replaceAll("_", " ")}.` });
}

export function opaqueExportPath(path: string): string {
  if (/^path:sha256:[a-f0-9]{64}$/.test(path)) return path;
  const normalized = path.replaceAll("\\", "/");
  if (isAbsolute(path) || /^[A-Z]:\//i.test(normalized) || secretTextPatterns.some((rule) => rule.pattern.test(path))) {
    return `path:sha256:${createHash("sha256").update(path).digest("hex")}`;
  }
  return sanitizeMetadataPath(path);
}

export function projectMetadataExport(value: unknown, options: { readonly inertOnly?: boolean } = {}): unknown {
  const project = (value: unknown, depth: number): unknown => {
    if (depth > 64) return "[redacted]";
    if (["function", "symbol", "bigint"].includes(typeof value)
      || (value !== null && typeof value === "object" && !inertMetadataObject(value))) return "[redacted]";
    if (typeof value === "string") {
      if (options.inertOnly) return value;
      if (isSecretLikePath(value.replaceAll("\\", "/"))) return "[redacted]";
      if (isAbsolute(value) || /^[A-Z]:[\\/]/i.test(value)) return opaqueExportPath(value);
      if (scanMetadataLeaks(value).length > 0) return "[redacted]";
      return value.replace(/(^|[\s'"])(\/[\w.~-][^\s'"]*)/g, (_match, before: string, path: string) => `${before}${opaqueExportPath(path)}`);
    }
    if (Array.isArray(value)) {
      const projected: unknown[] = new Array(value.length);
      for (let index = 0; index < value.length; index += 1) {
        if (Object.hasOwn(value, index)) projected[index] = project(value[index], depth + 1);
      }
      return projected;
    }
    if (plainRecord(value)) {
      if (!options.inertOnly && providerPayload(value)) return redactConfigValue("provider_payload_export");
      return Object.fromEntries(Object.entries(value).flatMap(([key, entry]) => {
        if (options.inertOnly) return [[key, project(entry, depth + 1)]];
        if (privateRecoveryReferencePattern.test(key) || secretTextPatterns.some((rule) => rule.pattern.test(key))) return [];
        if (sensitiveField(key, entry) && entry !== undefined && !redactedConfigPlaceholder(entry)) {
          return [[key, redactConfigValue("metadata_export")]];
        }
        if ((key === "env" || key === "environment") && plainRecord(entry) && inertMetadataObject(entry) && Object.keys(entry).length > 0
          && Object.values(entry).every((field) => typeof field === "string" || field === undefined)) {
          return [[key, redactConfigValue("environment_export")]];
        }
        return [[key, project(entry, depth + 1)]];
      }));
    }
    return value;
  };
  return project(value, 0);
}

export const redactionStatusSchema = z.enum(redactionStatuses);

export const runtimeEvidenceKinds = [
  "file",
  "log",
  "command",
  "test",
  "diff",
] as const;

export interface RuntimeEvidenceRef {
  readonly kind: (typeof runtimeEvidenceKinds)[number];
  readonly label: string;
  readonly path?: string;
  readonly excerpt?: string;
}

export const runtimeEvidenceRefSchema = z.object({
  kind: z.enum(runtimeEvidenceKinds),
  label: z.string().min(1),
  path: z.string().min(1).optional(),
  excerpt: z.string().min(1).optional(),
}).superRefine((value, context) => {
  try {
    sanitizeMetadataText(value.label, "evidence label");
    if (value.path !== undefined) sanitizeMetadataPath(value.path);
    if (value.excerpt !== undefined) sanitizeMetadataText(value.excerpt, "evidence excerpt", DEFAULT_UNTRUSTED_TEXT_MAX_BYTES);
  } catch (error) { context.addIssue({ code: z.ZodIssueCode.custom, message: error instanceof Error ? error.message : "Invalid evidence metadata." }); }
});

export interface RedactedConfigValue {
  readonly schema: "redacted_config_value.v0.1";
  readonly value: "[redacted]";
  readonly reason: string;
  readonly updatedAt?: string;
}

export interface RedactedText {
  readonly schema: "redacted_text.v0.1";
  readonly redaction: "content_redacted";
  readonly reason: string;
  readonly content: string;
  readonly byteLength: number;
  readonly truncated: boolean;
}

export const redactedConfigValueSchema = z.object({
  schema: z.literal("redacted_config_value.v0.1"),
  value: z.literal("[redacted]"),
  reason: z.string().min(1),
  updatedAt: z.string().datetime({ offset: true }).optional(),
});

export const redactedTextSchema = z.object({
  schema: z.literal("redacted_text.v0.1"),
  redaction: z.literal("content_redacted"),
  reason: z.string().min(1),
  content: z.string().min(1),
  byteLength: z.number().int().positive(),
  truncated: z.literal(false),
}).superRefine((value, context) => {
  metadataSchemaCheck(value, context);
  if (value.byteLength !== Buffer.byteLength(value.content, "utf8") || value.byteLength > DEFAULT_UNTRUSTED_TEXT_MAX_BYTES) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Redacted text byte length must agree with bounded content." });
  }
});

function normalizeText(value: string, label: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new Error(`${label} must not be empty.`);
  }

  return normalized;
}

function assertMaxBytes(value: string, label: string, maxBytes: number): void {
  const byteLength = Buffer.byteLength(value, "utf8");
  if (byteLength > maxBytes) {
    throw new Error(`${label} exceeds ${maxBytes} bytes (${byteLength} bytes).`);
  }
}

export function isSecretLikePath(pathValue: string): boolean {
  return secretPathPatterns.some((pattern) => pattern.test(pathValue));
}

export function sanitizeMetadataText(
  value: string,
  label: string,
  maxBytes = DEFAULT_METADATA_TEXT_MAX_BYTES,
): string {
  const normalized = normalizeText(value, label);
  assertMaxBytes(value, label, maxBytes);

  if (envDumpPattern.test(normalized)) {
    throw new Error(`${label} must not contain environment dump content.`);
  }

  assertMetadataSafe(normalized);

  return normalized;
}

export function sanitizeMetadataPath(pathValue: string): string {
  const posixPath = pathValue.trim().replaceAll("\\", "/");
  const collapsed = posix.normalize(posixPath);

  if (isAbsolute(pathValue) || posixPath.startsWith("/") || /^[A-Z]:\//i.test(posixPath)) {
    throw new Error("Evidence paths must be repo-relative metadata, not absolute paths.");
  }

  if (posixPath.split("/").includes("..")) {
    throw new Error("Evidence paths must not traverse outside the repository.");
  }

  if (isSecretLikePath(collapsed)) {
    throw new Error("Evidence paths must not reference secret-bearing locations.");
  }

  sanitizeMetadataText(pathValue, "path");

  return collapsed;
}

export function sanitizeWorkspacePath(pathValue: string, label: string): string {
  const normalized = normalizeText(pathValue, label);
  assertMaxBytes(pathValue, label, DEFAULT_UNTRUSTED_TEXT_MAX_BYTES);
  const posixPath = normalized.replaceAll("\\", "/");

  if (isSecretLikePath(posixPath)) {
    throw new Error(`${label} must not reference secret-bearing locations.`);
  }

  const leak = scanMetadataLeaks(normalized, { allowHomePaths: true })[0];
  if (leak) throw new Error(`Workspace path contains ${leak.reason.replaceAll("_", " ")}.`);

  return normalized;
}

export function redactUntrustedText(
  value: string,
  options: {
    readonly label?: string;
    readonly reason?: string;
    readonly maxBytes?: number;
  } = {},
): RedactedText {
  const label = options.label ?? "untrusted evidence";
  const normalized = normalizeText(value, label);
  const maxBytes = options.maxBytes ?? DEFAULT_UNTRUSTED_TEXT_MAX_BYTES;

  assertMaxBytes(value, label, maxBytes);

  if (envDumpPattern.test(normalized)) {
    throw new Error(`${label} must not include environment dump content.`);
  }

  assertMetadataSafe(normalized);

  return redactedTextSchema.parse({
    schema: "redacted_text.v0.1",
    redaction: "content_redacted",
    reason: options.reason ?? "untrusted_evidence_excerpt",
    content: normalized,
    byteLength: Buffer.byteLength(normalized, "utf8"),
    truncated: false,
  });
}

export function redactConfigValue(
  reason = "sensitive",
  updatedAt?: string,
): RedactedConfigValue {
  return {
    schema: "redacted_config_value.v0.1",
    value: "[redacted]",
    reason,
    updatedAt,
  };
}

export function redactConfigRecord(
  values: Record<string, string | undefined>,
  reason = "sensitive",
): Record<string, RedactedConfigValue> {
  return Object.fromEntries(
    Object.keys(values).map((key) => [key, redactConfigValue(reason)]),
  );
}
