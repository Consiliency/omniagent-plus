import { randomUUID } from "node:crypto";
import { link, open, stat, unlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { ensureParentDirectory, isMissingFileError, syncDirectory } from "./schema.js";

// Closing any alias of a SQLite inode can release POSIX locks owned by this process.
const activePaths = new Set<string>();

async function publishLock(path: string): Promise<void> {
  if (await stat(path).then(() => true, (error: unknown) => {
    if (isMissingFileError(error)) return false;
    throw error;
  })) return;
  const candidate = `${path}.${randomUUID()}.tmp`;
  const file = await open(candidate, "wx", 0o600);
  await file.close();
  try {
    const db = new DatabaseSync(candidate);
    try {
      db.exec("PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; CREATE TABLE lock_identity (schema_version INTEGER NOT NULL, instance_id TEXT NOT NULL);");
      db.prepare("INSERT INTO lock_identity VALUES (1, ?)").run(randomUUID());
    } finally { db.close(); }
    const handle = await open(candidate, "r");
    try { await handle.sync(); } finally { await handle.close(); }
    try { await link(candidate, path); }
    catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
    }
    await syncDirectory(dirname(path));
  } finally { await unlink(candidate); }
}

function validateIdentity(db: DatabaseSync): string {
  const rows = db.prepare("SELECT schema_version, instance_id FROM lock_identity").all();
  const row = rows[0];
  if (rows.length !== 1 || row?.schema_version !== 1 || typeof row.instance_id !== "string" || !/^[\da-f-]{36}$/i.test(row.instance_id)) {
    throw new Error("Legacy or unprovable state-ledger lock identity.");
  }
  return row.instance_id;
}

export async function withFilesystemLock<T>(
  lockPath: string,
  callback: () => Promise<T>,
  options: { readonly retryMs?: number; readonly timeoutMs?: number } = {},
): Promise<T> {
  lockPath = resolve(lockPath);
  const retryMs = options.retryMs ?? 25;
  const timeoutMs = options.timeoutMs ?? 2_000;
  if (![retryMs, timeoutMs].every((value) => Number.isSafeInteger(value) && value > 0)) {
    throw new Error("Lock limits must be positive safe integers.");
  }
  const deadline = Date.now() + timeoutMs;
  const retry = async () => {
    if (Date.now() >= deadline) throw new Error("Timed out waiting for state-ledger lock.");
    await new Promise((resolve) => setTimeout(resolve, Math.min(retryMs, deadline - Date.now())));
  };
  while (activePaths.has(lockPath)) await retry();
  activePaths.add(lockPath);
  let db: DatabaseSync | undefined;
  let reserved = false;
  try {
    await ensureParentDirectory(lockPath);
    await publishLock(lockPath);
    const before = await stat(lockPath, { bigint: true });
    let identity: string;
    try {
      const readonly = new DatabaseSync(lockPath, { readOnly: true });
      try { identity = validateIdentity(readonly); } finally { readonly.close(); }
      db = new DatabaseSync(lockPath);
      if (validateIdentity(db) !== identity) throw new Error("State-ledger lock replaced.");
      db.exec("PRAGMA busy_timeout=0;");
    } catch {
      throw new Error("Legacy or unprovable state-ledger lock identity.");
    }
    const checkPath = async () => {
      const current = await stat(lockPath, { bigint: true });
      if (before.dev !== current.dev || before.ino !== current.ino || validateIdentity(db!) !== identity) {
        throw new Error("State-ledger lock replaced.");
      }
    };
    while (!reserved) {
      try { db.exec("BEGIN IMMEDIATE"); reserved = true; }
      catch (error) {
        if (!(error instanceof Error && "errcode" in error && (error.errcode === 5 || error.errcode === 6))) throw error;
        await retry();
      }
    }
    await checkPath();
    const result = await callback();
    await checkPath();
    return result;
  } finally {
    try { if (reserved) db!.exec("ROLLBACK"); }
    finally { try { db?.close(); } finally { activePaths.delete(lockPath); } }
  }
}
