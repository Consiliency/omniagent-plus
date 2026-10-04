import { readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, stat, rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnOwned as spawn, runProcess, waitReady, cleanupChild } from "../../../tests/helpers/guard-process.js";

import { describe, expect, it } from "vitest";

import { FilesystemLockBackend } from "./index.js";

interface LeaseFixture {
  readonly exclusiveWrite: {
    readonly holder: {
      readonly processId: number;
      readonly host: string;
      readonly sessionId: string;
      readonly turnId: string;
    };
  };
}

function readFixture(): LeaseFixture {
  return JSON.parse(
    readFileSync(
      new URL("../../../fixtures/worktree/leases/lease-cases.json", import.meta.url),
      "utf8",
    ),
  ) as LeaseFixture;
}

function writeChildScript(rootDir: string): string {
  const scriptPath = join(rootDir, "lock-child.ts");
  writeFileSync(
    scriptPath,
    `
    import { FilesystemLockBackend } from ${JSON.stringify(new URL("./locks.ts", import.meta.url).href)};

    const backend = new FilesystemLockBackend({ rootDir: process.env.LOCK_ROOT });
    const attempt = await backend.tryExclusiveLock(
      process.env.LOCK_RESOURCE_ID,
      JSON.parse(process.env.LOCK_HOLDER),
      async (metadata) => {
        if (process.env.LOCK_HOLD_OPEN === "1") {
          console.log(JSON.stringify({ acquired: true, metadata }));
          await new Promise((resolve) => {
            process.stdin.once("data", () => resolve(undefined));
          });
        }
        return metadata;
      },
      {
        timeoutMs: Number(process.env.LOCK_TIMEOUT_MS ?? "1000"),
      },
    );

    if (process.env.LOCK_HOLD_OPEN !== "1") {
      console.log(JSON.stringify(attempt));
    }
  `,
    "utf8",
  );

  return scriptPath;
}

describe("locks", () => {
  it("rejects replacement of its permanent inode while the callback is running", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "worktree-lock-replacement-"));
    const backend = new FilesystemLockBackend({ rootDir });
    await expect(backend.withExclusiveLock("replacement", readFixture().exclusiveWrite.holder, async (metadata) => {
      await rename(metadata.lockPath, metadata.lockPath + "-displaced");
    })).rejects.toThrow();
  });
  it("preserves undefined results and propagates callback EEXIST exactly once", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "worktree-lock-return-"));
    const backend = new FilesystemLockBackend({ rootDir });
    const holder = readFixture().exclusiveWrite.holder;
    await expect(backend.withExclusiveLock("return", holder, async () => undefined)).resolves.toBeUndefined();
    let calls = 0;
    const failure = Object.assign(new Error("callback collision"), { code: "EEXIST" });
    await expect(backend.tryExclusiveLock("return", holder, async () => {
      calls += 1;
      throw failure;
    }, { timeoutMs: 25 })).rejects.toBe(failure);
    expect(calls).toBe(1);
  });
  it("proves atomic cross-process lock acquisition and durable holder metadata", async () => {
    const fixture = readFixture();
    const rootDir = await mkdtemp(join(tmpdir(), "worktree-locks-"));
    const scriptPath = writeChildScript(rootDir);
    const resourceId = "worktree-lock";
    const holdingChild = spawn(
      "pnpm",
      ["exec", "vite-node", "--script", scriptPath],
      {
        cwd: process.cwd(),
        custodyControlId: "owner-death",
        env: {
          ...process.env,
          LOCK_ROOT: rootDir,
          LOCK_RESOURCE_ID: resourceId,
          LOCK_HOLDER: JSON.stringify(fixture.exclusiveWrite.holder),
          LOCK_HOLD_OPEN: "1",
          LOCK_TIMEOUT_MS: "1000",
        },
      },
    );
    try {
    const readyBuffer = await waitReady(holdingChild);
    const ready = JSON.parse(readyBuffer.toString("utf8").trim()) as {
      readonly acquired: boolean;
      readonly metadata: {
        readonly holder: LeaseFixture["exclusiveWrite"]["holder"];
        readonly fencingToken: string;
      };
    };

    const backend = new FilesystemLockBackend({ rootDir });
    const metadata = await backend.readLockMetadata(resourceId);
    expect(ready.acquired).toBe(true);
    expect(metadata?.holder).toEqual(fixture.exclusiveWrite.holder);
    expect(metadata?.fencingToken).toBe(ready.metadata.fencingToken);

    const second = await runProcess(
      "pnpm",
      ["exec", "vite-node", "--script", scriptPath],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          LOCK_ROOT: rootDir,
          LOCK_RESOURCE_ID: resourceId,
          LOCK_HOLDER: JSON.stringify({
            ...fixture.exclusiveWrite.holder,
            processId: 5150,
          }),
          LOCK_HOLD_OPEN: "0",
          LOCK_TIMEOUT_MS: "25",
        },
      },
    );

    const secondAttempt = JSON.parse(second.trim()) as {
      readonly acquired: boolean;
    };
    expect(secondAttempt.acquired).toBe(false);

    const inode = (await stat(metadata!.lockPath)).ino;
    await cleanupChild(holdingChild);
    const afterCrash = await backend.tryExclusiveLock(resourceId, fixture.exclusiveWrite.holder, async () => undefined);
    expect(afterCrash.acquired).toBe(true);
    expect(afterCrash.metadata?.fencingToken).not.toBe(metadata!.fencingToken);
    expect((await stat(metadata!.lockPath)).ino).toBe(inode);
    } finally { await cleanupChild(holdingChild); }
  }, 50_000);
});
