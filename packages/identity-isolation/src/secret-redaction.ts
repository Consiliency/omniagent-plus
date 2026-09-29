import {
  scanMetadataLeaks,
  redactConfigRecord,
  redactConfigValue,
  type RedactedConfigValue,
} from "@consiliency/runtime-provider";

import { IdentityIsolationError } from "./types.js";

export interface SecretLeak {
  readonly path: string;
  readonly reason: string;
  readonly sample: string;
}

export interface SecretLeakScanResult {
  readonly ok: boolean;
  readonly leaks: SecretLeak[];
}

export function scanForSecretLeaks(value: unknown): SecretLeakScanResult {
  const leaks = scanMetadataLeaks(value, { allowHomePaths: true }).map((leak) => ({ ...leak, sample: "[redacted]" }));
  return { ok: leaks.length === 0, leaks };
}

export function assertNoSecretLeaks(value: unknown): void {
  const result = scanForSecretLeaks(value);
  if (result.ok) {
    return;
  }

  throw new IdentityIsolationError(
    "secret_leak_detected",
    "Rejected raw secret material before metadata-only persistence.",
    {
      leakCount: result.leaks.length,
      firstLeakPath: result.leaks[0]?.path,
      reasons: result.leaks.map((leak) => leak.reason),
    },
  );
}

export function redactSecretLikeValue(
  reason = "secret_ref",
  updatedAt?: string,
): RedactedConfigValue {
  return redactConfigValue(reason, updatedAt);
}

export function redactSecretLikeRecord(
  values: Record<string, string | undefined>,
  reason = "secret_ref",
): Record<string, RedactedConfigValue> {
  return redactConfigRecord(values, reason);
}
