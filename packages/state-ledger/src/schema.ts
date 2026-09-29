import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { z } from "zod";

export const CURRENT_STATE_LEDGER_SCHEMA_VERSION = 1;
export const DEFAULT_MAX_PAYLOAD_BYTES = 16 * 1024;
export const DEFAULT_MAX_EVIDENCE_EXCERPT_BYTES = 2 * 1024;

export interface StateLedgerPaths {
  readonly rootDir: string;
  readonly ledgerPath: string;
  readonly manifestPath: string;
  readonly indexesDir: string;
  readonly locksDir: string;
  readonly storeLockPath: string;
  readonly kindIndexPath: string;
  readonly sessionIndexPath: string;
  readonly taskIndexPath: string;
  readonly coordinationDir: string;
  readonly cooldownsPath: string;
  readonly worktreeLeasesPath: string;
}

export const storeManifestSchema = z.object({
  schema: z.literal("state_ledger_store_manifest.v0.1"),
  schemaVersion: z.number().int().safe().positive(),
  recordCount: z.number().int().safe().nonnegative(),
  lastSequence: z.number().int().safe().nonnegative(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  recoveredTailTruncations: z.number().int().safe().nonnegative(),
});
export type StoreManifest = z.infer<typeof storeManifestSchema>;

export const stateLedgerIndexSnapshotSchema = z.object({
  updatedAt: z.string().datetime({ offset: true }),
  byKind: z.record(z.string(), z.array(z.number().int().positive())),
  bySession: z.record(z.string(), z.array(z.number().int().positive())),
  byTask: z.record(z.string(), z.array(z.number().int().positive())),
});
export type StateLedgerIndexSnapshot = z.infer<
  typeof stateLedgerIndexSnapshotSchema
>;

export function getStateLedgerPaths(rootDir: string): StateLedgerPaths {
  return {
    rootDir,
    ledgerPath: join(rootDir, "ledger.jsonl"),
    manifestPath: join(rootDir, "manifest.json"),
    indexesDir: join(rootDir, "indexes"),
    locksDir: join(rootDir, "locks"),
    storeLockPath: join(rootDir, "locks", "store.lock"),
    kindIndexPath: join(rootDir, "indexes", "by-kind.json"),
    sessionIndexPath: join(rootDir, "indexes", "by-session.json"),
    taskIndexPath: join(rootDir, "indexes", "by-task.json"),
    coordinationDir: join(rootDir, "coordination"),
    cooldownsPath: join(rootDir, "coordination", "provider-cooldowns.json"),
    worktreeLeasesPath: join(rootDir, "coordination", "worktree-leases.json"),
  };
}

export function nowIsoString(value?: string): string {
  return value ?? new Date().toISOString();
}

export function payloadByteLength(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

export function assertBoundedPayload(
  value: unknown,
  maxBytes = DEFAULT_MAX_PAYLOAD_BYTES,
): number {
  const size = payloadByteLength(value);
  if (size > maxBytes) {
    throw new Error(
      `State ledger payload exceeds ${maxBytes} bytes (${size} bytes).`,
    );
  }
  return size;
}

export async function ensureParentDirectory(path: string): Promise<void> {
  const directory = resolve(dirname(path));
  await mkdir(directory, { recursive: true });
  let current = directory;
  while (true) {
    await syncDirectory(current);
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
}

export async function ensureStateLedgerDirectories(
  rootDir: string,
): Promise<StateLedgerPaths> {
  const paths = getStateLedgerPaths(rootDir);
  await Promise.all([
    ensureParentDirectory(join(paths.rootDir, ".entry")),
    ensureParentDirectory(join(paths.indexesDir, ".entry")),
    ensureParentDirectory(join(paths.locksDir, ".entry")),
    ensureParentDirectory(join(paths.coordinationDir, ".entry")),
  ]);
  return paths;
}

export async function readJsonFile<T>(
  path: string,
): Promise<T | undefined> {
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as T;
  } catch (error) {
    if (isMissingFileError(error)) {
      return undefined;
    }
    throw error;
  }
}

export async function writeJsonAtomic(
  path: string,
  value: unknown,
): Promise<void> {
  await writeFileAtomic(path, `${JSON.stringify(value, null, 2)}\n`);
}

export async function syncDirectory(path: string): Promise<void> {
  const handle = await open(path, "r");
  try { await handle.sync(); } finally { await handle.close(); }
}

export async function writeFileAtomic(path: string, value: string): Promise<void> {
  await ensureParentDirectory(path);
  const tempPath = `${path}.${randomUUID()}.tmp`;
  const handle = await open(tempPath, "wx", 0o600);
  try {
    try { await handle.writeFile(value, "utf8"); await handle.sync(); }
    finally { await handle.close(); }
    await rename(tempPath, path);
    await syncDirectory(dirname(path));
  } finally {
    await unlink(tempPath).catch((error: unknown) => { if (!isMissingFileError(error)) throw error; });
  }
}

export function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
