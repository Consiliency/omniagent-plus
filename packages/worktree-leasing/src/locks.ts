import { createHash, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { open, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";

import { nowIsoString } from "@omniagent-plus/state-ledger";

import {
  WorktreeLeasingError,
  type DurableLockMetadata,
  type LockAttemptOptions,
  type LockAttemptResult,
  type LockHolderIdentity,
} from "./types.js";

async function sleep(milliseconds: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

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

    if (!attempt.acquired || attempt.result === undefined) {
      throw new WorktreeLeasingError(
        "lock_acquisition_failed",
        `Failed to acquire durable lock for ${resourceId}.`,
        { resourceId },
      );
    }

    return attempt.result;
  }

  async tryExclusiveLock<T>(
    resourceId: string,
    holder: LockHolderIdentity,
    callback: (metadata: DurableLockMetadata) => Promise<T>,
    options: LockAttemptOptions = {},
  ): Promise<LockAttemptResult<T>> {
    await mkdir(this.rootDir, { recursive: true });

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
    const deadline = Date.now() + timeoutMs;

    while (true) {
      try {
        const handle = await open(lockPath, "wx");
        try {
          await handle.writeFile(`${JSON.stringify(metadata, null, 2)}\n`, "utf8");
          const result = await callback(metadata);
          return {
            acquired: true,
            metadata,
            result,
          };
        } finally {
          await handle.close();
          await unlink(lockPath).catch(() => undefined);
        }
      } catch (error) {
        const lockBusy =
          error instanceof Error && "code" in error && error.code === "EEXIST";
        if (!lockBusy) {
          throw error;
        }
        if (Date.now() >= deadline) {
          return {
            acquired: false,
            metadata: await this.readLockMetadata(resourceId),
          };
        }
        await sleep(retryMs);
      }
    }
  }

  async readLockMetadata(
    resourceId: string,
  ): Promise<DurableLockMetadata | undefined> {
    const lockPath = join(this.rootDir, buildLockFileName(resourceId));

    try {
      return JSON.parse(
        await readFile(lockPath, "utf8"),
      ) as DurableLockMetadata;
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return undefined;
      }
      throw error;
    }
  }
}
