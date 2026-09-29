import { existsSync, readFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { cleanupChild, ProcessScope, runProcess, signalOwned, spawnOwned, validateCustodyJournal, waitExit, waitReady } from "../helpers/guard-process.js";

it("fails spawn errors, nonzero children and signal/null exits", async () => {
  await expect(runProcess("guard-command-does-not-exist", [])).rejects.toThrow();
  await expect(runProcess(process.execPath, ["-e", "process.exit(7)"])).rejects.toThrow("exit 7");
  await expect(runProcess(process.execPath, ["-e", "process.kill(process.pid,'SIGTERM')"])).rejects.toThrow("signal");
}, 10_000);
it("terminates a hung child and descendant without signaling unowned processes", async () => {
  const dir = mkdtempSync(join(tmpdir(), "guard-hung-"));
  const pidFile = join(dir, "descendant");
  const unrelated = spawnOwned(process.execPath, ["-e", "console.log('ready');setInterval(()=>{},1000)"]);
  await waitReady(unrelated);
  try {
    const started = Date.now();
    await expect(runProcess(process.execPath, ["-e", `const{spawn}=require('node:child_process');const{writeFileSync}=require('node:fs');const c=spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"],{detached:true,stdio:'ignore'});writeFileSync(${JSON.stringify(pidFile)},String(c.pid));process.on('SIGTERM',()=>{});setInterval(()=>{},1000);`], { timeout: 250, custodyControlId: "hung-child" })).rejects.toThrow("timed out");
    const pid = Number(readFileSync(pidFile, "utf8"));
    const deadline = Date.now() + 2_000;
    const alive = () => existsSync(`/proc/${pid}/stat`) && !readFileSync(`/proc/${pid}/stat`, "utf8").split(") ")[1]?.startsWith("Z");
    while (alive() && Date.now() < deadline) await new Promise((r) => setTimeout(r, 20));
    expect(alive()).toBe(false);
    expect(Date.now() - started).toBeLessThan(2_750);
    expect(() => process.kill(unrelated.pid!, 0)).not.toThrow();
    expect(() => signalOwned(process.pid, "SIGKILL")).toThrow("Unowned");
  } finally { await cleanupChild(unrelated); rmSync(dir, { recursive: true, force: true }); }
}, 10_000);
it("bounds readiness failure and cleans its child", async () => {
  const child = spawnOwned(process.execPath, ["-e", "setInterval(()=>{},1000)"]);
  try { await expect(waitReady(child, 250)).rejects.toThrow("readiness"); }
  finally { await cleanupChild(child); }
});
it("reaps normal exits and shares concurrent cleanup until descendants are quiescent", async () => {
  const child = spawnOwned(process.execPath, ["-e", "console.log('ready');setInterval(()=>{},1000)"]);
  await waitReady(child);
  const first = cleanupChild(child);
  expect(cleanupChild(child)).toBe(first);
  await first;
  expect(child.signalCode).toBe("SIGTERM");
  expect(() => process.kill(child.pid!, 0)).toThrow();
  expect(() => signalOwned(child.pid!, "SIGKILL")).toThrow("Unowned");
  await cleanupChild(child);
  const normal = spawnOwned(process.execPath, ["-e", "process.exit(0)"]);
  expect(await waitExit(normal)).toBe(0);
  await cleanupChild(normal);
  expect(() => process.kill(normal.pid!, 0)).toThrow();
});
it("cleans a detached descendant after its direct parent exits normally", async () => {
  const dir = mkdtempSync(join(tmpdir(), "guard-normal-descendant-"));
  const pidFile = join(dir, "pid");
  try {
    await runProcess(process.execPath, ["-e", `const{spawn}=require('node:child_process');const{writeFileSync}=require('node:fs');const c=spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"],{detached:true,stdio:'ignore'});writeFileSync(${JSON.stringify(pidFile)},String(c.pid));c.unref();setTimeout(()=>process.exit(0),100);`], { custodyControlId: "normal-orphan" });
    const pid = Number(readFileSync(pidFile, "utf8"));
    expect(existsSync('/proc/'+pid+'/stat') && !readFileSync('/proc/'+pid+'/stat', 'utf8').split(') ')[1]?.startsWith('Z')).toBe(false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
it("cleans owned active work after an ordinary failure without closing another scope", async () => {
  const scope = new ProcessScope();
  const unrelated = spawnOwned(process.execPath, ["-e", "console.log('ready');setInterval(()=>{},1000)"]);
  let pid = 0;
  try {
    await waitReady(unrelated);
    await expect(scope.run(async () => {
      try {
        const child = spawnOwned(process.execPath, ["-e", "console.log('ready');setInterval(()=>{},1000)"]);
        pid = child.pid!;
        await waitReady(child);
        throw new Error("stage failed");
      } finally { await scope.close(); }
    })).rejects.toThrow("stage failed");
    expect(() => process.kill(pid, 0)).toThrow();
    expect(() => process.kill(unrelated.pid!, 0)).not.toThrow();
    expect(() => scope.run(() => spawnOwned(process.execPath, []))).toThrow("closed");
    await scope.close();
  } finally { await scope.close(); await cleanupChild(unrelated); }
});
it("keeps shutdown idempotent through reentrant cancellation and cleanup failures", async () => {
  const listeners = [process.listenerCount("SIGINT"), process.listenerCount("SIGTERM")];
  const scope = new ProcessScope();
  let reentrant: Promise<void> | undefined;
  let finished = false;
  scope.controller.signal.addEventListener("abort", () => { reentrant = scope.close(); });
  scope.addCleanup(() => { throw new Error("resource cleanup failed"); });
  scope.addCleanup(async () => { finished = true; });
  const closing = scope.close();
  expect(scope.close()).toBe(closing);
  await expect(closing).rejects.toThrow("resource cleanup failed");
  expect(reentrant).toBe(closing);
  expect(finished).toBe(true);
  expect([process.listenerCount("SIGINT"), process.listenerCount("SIGTERM")]).toEqual(listeners);
});
it("leaves Linux child discovery to the custody supervisor", async () => {
  const helper = new URL("../helpers/guard-process.ts", import.meta.url).href;
  const script = `import assert from 'node:assert/strict';import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';import {runProcess} from ${JSON.stringify(helper)};
const read=fs.readdirSync;fs.readdirSync=function(path,...args){assert(!String(path).startsWith('/proc'));return read.call(this,path,...args);};syncBuiltinESMExports();
await runProcess(process.execPath,['-e','setTimeout(()=>{},150)']);console.log('Node did not scan proc');`;
  expect(await runProcess(process.execPath, ["--input-type=module", "-e", script])).toBe("Node did not scan proc");
});
it("refuses unsupported platforms before launching a payload", () => {
  const original = Object.getOwnPropertyDescriptor(process, "platform")!;
  try {
    for (const platform of ["darwin", "win32"]) {
      Object.defineProperty(process, "platform", { ...original, value: platform });
      expect(() => spawnOwned(process.execPath, ["-e", "process.exit(0)"])).toThrow("Linux custody backend required");
    }
  } finally { Object.defineProperty(process, "platform", original); }
});
it("reaps 100 immediate-exit detached descendants before each command returns", async () => {
  const dir = mkdtempSync(join(tmpdir(), "guard-immediate-"));
  try {
    for (let index = 0; index < 100; index++) {
      const pidFile = join(dir, String(index));
      const script = `const{spawn}=require('node:child_process');const{writeFileSync}=require('node:fs');const child=spawn(process.execPath,['-e','setTimeout(()=>{},5000)'],{detached:true,stdio:'ignore'});writeFileSync(${JSON.stringify(pidFile)},String(child.pid));child.unref();process.exit(0);`;
      await runProcess(process.execPath, ["-e", script], { custodyControlId: "immediate-orphan" });
      const pid = Number(readFileSync(pidFile, "utf8"));
      expect(existsSync(`/proc/${pid}`), `trial ${index} escaped`).toBe(false);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
}, 120_000);
it("rejects unbalanced custody receipts and an unexpected rescue beside an expected control", () => {
  const dir = mkdtempSync(join(tmpdir(), "guard-journal-"));
  const admission = (id: string, control: string | null = null) => ({ event: "admission", command_id: id, stage: "root-suite", supervisor_pid: 123, control_case_id: control });
  const terminal = (id: string, signaled = 0, control: string | null = null) => ({ ...admission(id, control), event: "terminal", custody: "quiescent", adopted_count: signaled, adopted_natural_count: 0, adopted_signaled_count: signaled, adopted_unresolved_count: 0, force_killed_count: 0 });
  const check = (rows: object[]) => { writeFileSync(join(dir, "custody.jsonl"), rows.map((row) => JSON.stringify(row)).join("\n") + "\n"); return () => validateCustodyJournal(dir); };
  try {
    expect(check([admission("expected", "normal-orphan"), terminal("expected", 1, "normal-orphan")])()).toEqual({ admitted: 1, natural: 0, signaled: 1 });
    expect(check([admission("missing")])).toThrow("missing terminal");
    expect(check([terminal("orphan")])).toThrow("terminal mismatch");
    expect(check([admission("duplicate"), admission("duplicate")])).toThrow("duplicate");
    expect(check([admission("expected", "normal-orphan"), terminal("expected", 1, "normal-orphan"), admission("unexpected"), terminal("unexpected", 1)])).toThrow("unexpected signaled rescue");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
