import { mkdtemp, readFile, rename, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { withFilesystemLock } from "./append-only-store.js";

async function lockPath() {
  return join(await mkdtemp(join(tmpdir(), "data-lock-")), "writer.lock");
}

describe("permanent writer arbitration", () => {
  it("publishes initialized identity and preserves the arbitration inode", async () => {
    const path = await lockPath();
    await withFilesystemLock(path, async () => undefined);
    const before = await stat(path);
    const db = new DatabaseSync(path, { readOnly: true });
    try {
      expect(db.prepare("SELECT schema_version, instance_id FROM lock_identity").get())
        .toMatchObject({ schema_version: 1, instance_id: expect.any(String) });
    } finally { db.close(); }
    await withFilesystemLock(path, async () => undefined);
    expect((await stat(path)).ino).toBe(before.ino);
  });

  it("serializes async owners and bounds local contention", async () => {
    const path = await lockPath();
    let entered!: () => void;
    const ready = new Promise<void>((resolve) => { entered = resolve; });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const owner = withFilesystemLock(path, async () => { entered(); await gate; });
    await ready;
    try {
      await expect(withFilesystemLock(path, async () => { throw new Error("overlapping owner"); }, { retryMs: 1, timeoutMs: 20 }))
        .rejects.toThrow(/Timed out/);
    } finally { release(); await owner; }
    await expect(withFilesystemLock(path, async () => "next")).resolves.toBe("next");
  });

  it("preserves legacy and invalid arbitration files", async () => {
    const path = await lockPath();
    for (const raw of ["", "legacy-owner"]) {
      await writeFile(path, raw);
      let entered = false;
      await expect(withFilesystemLock(path, async () => { entered = true; }))
        .rejects.toThrow(/unprovable|legacy/i);
      expect(entered).toBe(false);
      expect(await readFile(path, "utf8")).toBe(raw);
    }
  });

  it("leaves a replacement pathname intact when an old owner releases", async () => {
    const path = await lockPath();
    await expect(withFilesystemLock(path, async () => {
      await rename(path, `${path}.old`);
      await writeFile(path, "replacement");
    })).rejects.toThrow(/replaced/i);
    expect(await readFile(path, "utf8")).toBe("replacement");
  });

  it("does not retry callback failures that happen to carry EEXIST", async () => {
    const path = await lockPath();
    const failure = Object.assign(new Error("callback failure"), { code: "EEXIST" });
    let calls = 0;
    await expect(withFilesystemLock(path, async () => { calls += 1; throw failure; })).rejects.toBe(failure);
    expect(calls).toBe(1);
    await expect(withFilesystemLock(path, async () => "released")).resolves.toBe("released");
  });
});
