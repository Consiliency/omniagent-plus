import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { nowIsoString, withFilesystemLock, writeJsonAtomic } from "@omniagent-plus/state-ledger";
import { worktreeLeaseSchema } from "@consiliency/runtime-provider";
import { z } from "zod";

import {
  WorktreeLeasingError,
  type DurableLockMetadata,
  type LockAttemptOptions,
  type LockAttemptResult,
  type LockHolderIdentity,
} from "./types.js";

const metadataSchema = z.object({
  resourceId: z.string().min(1), fencingToken: z.string().min(1),
  holder: worktreeLeaseSchema.innerType().shape.holder,
  acquiredAt: z.string().datetime({ offset: true }), expiresAt: z.string().datetime({ offset: true }),
  lockPath: z.string().min(1),
}).strict();

function buildLockFileName(resourceId: string): string {
  return `${createHash("sha256").update(resourceId).digest("hex")}.lock`;
}

function buildExpiresAt(now: string, ttlSeconds: number): string {
  return new Date(Date.parse(now) + ttlSeconds * 1_000).toISOString();
}

export class FilesystemLockBackend {
  private readonly rootDir: string;

  private readonly retryMs: number;

  private readonly timeoutMs: number;

  constructor(options: {
    readonly rootDir: string;
    readonly retryMs?: number;
    readonly timeoutMs?: number;
  }) {
    this.rootDir = options.rootDir;
    this.retryMs = options.retryMs ?? 25;
    this.timeoutMs = options.timeoutMs ?? 2_000;
  }

  async withExclusiveLock<T>(
    resourceId: string,
    holder: LockHolderIdentity,
    callback: (metadata: DurableLockMetadata) => Promise<T>,
    options: LockAttemptOptions = {},
  ): Promise<T> {
    const attempt = await this.tryExclusiveLock(
      resourceId,
      holder,
      callback,
      options,
    );

    if (!attempt.acquired) {
      throw new WorktreeLeasingError(
        "lock_acquisition_failed",
        `Failed to acquire durable lock for ${resourceId}.`,
        { resourceId },
      );
    }

    return attempt.result as T;
  }

  async tryExclusiveLock<T>(
    resourceId: string,
    holder: LockHolderIdentity,
    callback: (metadata: DurableLockMetadata) => Promise<T>,
    options: LockAttemptOptions = {},
  ): Promise<LockAttemptResult<T>> {
    const retryMs = options.retryMs ?? this.retryMs;
    const timeoutMs = options.timeoutMs ?? this.timeoutMs;
    const now = options.now ?? nowIsoString();
    const ttlSeconds = options.ttlSeconds ?? 300;
    const lockPath = join(this.rootDir, buildLockFileName(resourceId));
    const metadata: DurableLockMetadata = {
      resourceId,
      fencingToken: randomUUID(),
      holder,
      acquiredAt: now,
      expiresAt: buildExpiresAt(now, ttlSeconds),
      lockPath,
    };
    metadataSchema.parse(metadata);
    if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds <= 0) throw new WorktreeLeasingError("invalid_ttl", "Lock TTL must be a positive whole number.");
    let entered = false;
    try {
      return await withFilesystemLock(lockPath, async () => {
        entered = true;
        await writeJsonAtomic(`${lockPath}.holder.json`, metadata);
        return { acquired: true, metadata, result: await callback(metadata) };
      }, { retryMs, timeoutMs });
    } catch (error) {
      if (!entered && error instanceof Error && error.message === "Timed out waiting for state-ledger lock.") {
        return { acquired: false, metadata: await this.readLockMetadata(resourceId) };
      }
      throw error;
    }
  }

  async readLockMetadata(
    resourceId: string,
  ): Promise<DurableLockMetadata | undefined> {
    const lockPath = join(this.rootDir, buildLockFileName(resourceId));

    try {
      const metadata = metadataSchema.parse(JSON.parse(await readFile(`${lockPath}.holder.json`, "utf8")));
      if (metadata.resourceId !== resourceId || metadata.lockPath !== lockPath) throw new WorktreeLeasingError("invalid_lock_metadata", "Lock diagnostic identity does not match.");
      return metadata;
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return undefined;
      }
      throw error;
    }
  }
}
