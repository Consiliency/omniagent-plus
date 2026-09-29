import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cleanEnvironment, runProcess } from "../../../tests/helpers/guard-process.js";
import { AppendOnlyStore } from "./append-only-store.js";

const tail = '{"schema":"state_ledger_record.v0.1","unfinished":"é';

async function runFault(rootDir: string, point: string, action: string): Promise<void> {
  const script = join(rootDir, "fault-child.ts");
  await writeFile(script, `
    import fs from "node:fs/promises";
    import { writeFileSync } from "node:fs";
    import { syncBuiltinESMExports } from "node:module";
    const root = process.env.DATA_FAULT_ROOT;
    const point = process.env.DATA_FAULT_POINT;
    const action = process.env.DATA_FAULT_ACTION;
    let armed = action === "recovery" || action === "lock";
    let lastRename = "";
    const fire = (operation, path) => {
      if (!armed) return;
      const ledger = path === root + "/ledger.jsonl";
      const manifest = path.includes("/manifest.json.") && path.endsWith(".tmp");
      const recovery = path.includes("/.recovery/") && path.endsWith(".tail");
      const hit = point === "append_write" && ledger && operation === "write"
        || point === "append_sync" && ledger && operation === "sync"
        || point === "manifest_write" && manifest && operation === "write"
        || point === "manifest_sync" && manifest && operation === "sync"
        || point === "manifest_rename" && path === root + "/manifest.json" && operation === "rename"
        || point === "manifest_parent_sync" && path === root && operation === "sync" && lastRename.endsWith("/manifest.json")
        || point === "compact_rename" && ledger && operation === "rename"
        || point === "index_write" && path.includes("/indexes/by-kind.json.") && operation === "write"
        || point === "recovery_write" && recovery && operation === "write"
        || point === "recovery_sync" && recovery && operation === "sync"
        || point === "recovery_dir_sync" && path === root + "/.recovery" && operation === "sync"
        || point === "recovery_truncate" && ledger && operation === "truncate"
        || point === "lock_link" && path.endsWith("/store.lock") && operation === "link"
        || point === "lock_parent_sync" && path === root + "/locks" && operation === "sync" && lastRename === "lock_published";
      if (hit) {
        writeFileSync(root + "/fault-fired.json", JSON.stringify({ point, action }));
        process.kill(process.pid, "SIGKILL");
      }
    };
    const originalOpen = fs.open;
    fs.open = async (path, ...args) => {
      const handle = await originalOpen(path, ...args);
      for (const [method, operation] of [["writeFile", "write"], ["sync", "sync"], ["truncate", "truncate"]]) {
        const original = handle[method].bind(handle);
        handle[method] = async (...parameters) => { const result = await original(...parameters); fire(operation, String(path)); return result; };
      }
      return handle;
    };
    const originalRename = fs.rename;
    fs.rename = async (source, target) => { await originalRename(source, target); lastRename = String(target); fire("rename", String(target)); };
    const originalLink = fs.link;
    fs.link = async (source, target) => { await originalLink(source, target); lastRename = "lock_published"; fire("link", String(target)); };
    syncBuiltinESMExports();
    const { AppendOnlyStore } = await import(${JSON.stringify(new URL("./append-only-store.ts", import.meta.url).href)});
    const store = await AppendOnlyStore.open({ rootDir: root });
    armed = true;
    lastRename = "";
    if (action === "append") await store.appendRecord({ kind: "evidence_ref", payload: { kind: "log", label: "interrupted" } });
    if (action === "compact") await store.compactRecords(() => false);
    throw new Error("Fault construction site was not reached");
  `);
  await expect(runProcess("pnpm", ["exec", "vite-node", "--script", script], {
    cwd: process.cwd(), env: { ...cleanEnvironment(), DATA_FAULT_ROOT: rootDir, DATA_FAULT_POINT: point, DATA_FAULT_ACTION: action },
  })).rejects.toThrow(/failed \(exit|terminated by signal/);
  expect(JSON.parse(await readFile(join(rootDir, "fault-fired.json"), "utf8"))).toEqual({ point, action });
}

describe("DATA crash construction sites", () => {
  it.each(["append_write", "append_sync", "manifest_write", "manifest_sync", "manifest_rename", "manifest_parent_sync"])(
    "recovers monotonic append after %s", async (point) => {
      const rootDir = await mkdtemp(join(tmpdir(), "data-append-crash-"));
      const store = await AppendOnlyStore.open({ rootDir });
      const acknowledged = await store.appendRecord({ kind: "evidence_ref", payload: { kind: "log", label: "acknowledged" } });
      await runFault(rootDir, point, "append");
      const reopened = await AppendOnlyStore.open({ rootDir });
      const records = await reopened.listRecords();
      expect(records[0]?.recordId).toBe(acknowledged.recordId);
      const next = await reopened.appendRecord({ kind: "evidence_ref", payload: { kind: "log", label: "after crash" } });
      expect(next.sequence).toBe(Math.max(...records.map((record) => record.sequence)) + 1);
      expect(new Set((await reopened.listRecords()).map((record) => record.sequence)).size).toBe(records.length + 1);
    }, 20_000);

  it.each(["compact_rename", "index_write"])("preserves historical high-water after %s", async (point) => {
    const rootDir = await mkdtemp(join(tmpdir(), "data-compact-crash-"));
    const store = await AppendOnlyStore.open({ rootDir });
    for (let index = 0; index < 3; index += 1) await store.appendRecord({ kind: "evidence_ref", payload: { kind: "log", label: "before compaction" } });
    await runFault(rootDir, point, "compact");
    const reopened = await AppendOnlyStore.open({ rootDir });
    expect((await reopened.appendRecord({ kind: "evidence_ref", payload: { kind: "log", label: "after compaction" } })).sequence).toBe(4);
  }, 20_000);

  it.each(["recovery_write", "recovery_sync", "recovery_dir_sync", "recovery_truncate"])(
    "preserves rejected bytes across %s", async (point) => {
      const rootDir = await mkdtemp(join(tmpdir(), "data-recovery-crash-"));
      const store = await AppendOnlyStore.open({ rootDir });
      await store.appendRecord({ kind: "evidence_ref", payload: { kind: "log", label: "valid prefix" } });
      await writeFile(store.paths.ledgerPath, tail, { flag: "a" });
      await runFault(rootDir, point, "recovery");
      const raw = await readFile(store.paths.ledgerPath, "utf8");
      const evidenceDir = join(rootDir, ".recovery");
      const preserved = await Promise.all((await readdir(evidenceDir)).map((file) => readFile(join(evidenceDir, file), "utf8")));
      expect(raw.endsWith(tail) || preserved.includes(tail)).toBe(true);
      const reopened = await AppendOnlyStore.open({ rootDir });
      expect(await reopened.listRecords()).toHaveLength(1);
      const after = await Promise.all((await readdir(evidenceDir)).map((file) => readFile(join(evidenceDir, file), "utf8")));
      expect(after).toContain(tail);
    }, 20_000);

  it.each(["lock_link", "lock_parent_sync"])("publishes recoverable initialized ownership before %s", async (point) => {
    const rootDir = await mkdtemp(join(tmpdir(), "data-lock-crash-"));
    await runFault(rootDir, point, "lock");
    const reopened = await AppendOnlyStore.open({ rootDir });
    expect((await reopened.appendRecord({ kind: "evidence_ref", payload: { kind: "log", label: "new owner" } })).sequence).toBe(1);
  }, 20_000);
});
