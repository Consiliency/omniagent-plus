import { existsSync, readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { cleanupChild, ProcessScope, runProcess, signalOwned, spawnOwned, waitExit, waitReady } from "../helpers/guard-process.js";

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
    await expect(runProcess(process.execPath, ["-e", `const{spawn}=require('node:child_process');const{writeFileSync}=require('node:fs');const c=spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"],{detached:true,stdio:'ignore'});writeFileSync(${JSON.stringify(pidFile)},String(c.pid));process.on('SIGTERM',()=>{});setInterval(()=>{},1000);`], { timeout: 250 })).rejects.toThrow("timed out");
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
    await runProcess(process.execPath, ["-e", `const{spawn}=require('node:child_process');const{writeFileSync}=require('node:fs');const c=spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"],{detached:true,stdio:'ignore'});writeFileSync(${JSON.stringify(pidFile)},String(c.pid));c.unref();setTimeout(()=>process.exit(0),100);`]);
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
it("discovers descendants through owned task links without a host-wide proc scan", async () => {
  const helper = new URL("../helpers/guard-process.ts", import.meta.url).href;
  const script = `import assert from 'node:assert/strict';import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';import {runProcess} from ${JSON.stringify(helper)};
const read=fs.readdirSync;const paths=[];fs.readdirSync=function(path,...args){assert.notEqual(String(path),'/proc');paths.push(String(path));return read.call(this,path,...args);};syncBuiltinESMExports();
await runProcess(process.execPath,['-e','setTimeout(()=>{},150)']);assert(paths.length>0);assert(paths.every(path=>/^\\/proc\\/\\d+\\/task$/.test(path)));console.log('owned task links only');`;
  expect(await runProcess(process.execPath, ["--input-type=module", "-e", script])).toBe("owned task links only");
});
it("signals the owned POSIX group after its leader closes, with an unrelated group surviving", async () => {
  const helper = new URL("../helpers/guard-process.ts", import.meta.url).href;
  const leaf = "process.on('SIGTERM',()=>{});console.log(process.pid);setInterval(()=>{},1000)";
  const leader = `const{spawn}=require('node:child_process');const child=spawn(process.execPath,['-e',${JSON.stringify(leaf)}],{stdio:['ignore','pipe','ignore']});child.stdout.once('data',data=>{console.log(data.toString().trim());child.stdout.destroy();child.unref();process.exit(0);});`;
  const script = `import assert from 'node:assert/strict';import {existsSync,readFileSync} from 'node:fs';import {spawnOwned,waitReady,waitExit,cleanupChild} from ${JSON.stringify(helper)};
const platform=process.platform;Object.defineProperty(process,'platform',{value:'darwin'});
const kill=process.kill.bind(process);const calls=[];let killed=false;let descendant=0;
const alive=pid=>{try{return !readFileSync('/proc/'+pid+'/stat','utf8').split(') ')[1].startsWith('Z');}catch(error){if(error.code==='ENOENT'||error.code==='ESRCH')return false;throw error;}};
const unrelated=spawnOwned(process.execPath,['-e',"console.log('ready');setInterval(()=>{},1000)"]);
const child=spawnOwned(process.execPath,['-e',${JSON.stringify(leader)}]);
try{await waitReady(unrelated);descendant=Number((await waitReady(child)).toString());assert.equal(await waitExit(child),0);
process.kill=(pid,signal)=>{assert.equal(pid,-child.pid);calls.push(signal);if(signal==='SIGKILL')killed=true;
// Model init reaping after real SIGKILL: this Linux host can retain orphan zombies.
if(signal===0&&killed&&!alive(descendant))throw Object.assign(Error('reaped'),{code:'ESRCH'});return kill(pid,signal);};
await cleanupChild(child);assert(calls.includes('SIGTERM'));assert(calls.includes('SIGKILL'));assert(!alive(descendant));kill(unrelated.pid,0);console.log('owned POSIX group cleaned');
}finally{process.kill=kill;try{kill(-child.pid,'SIGKILL');}catch(error){if(error.code!=='ESRCH')throw error;}await cleanupChild(unrelated);Object.defineProperty(process,'platform',{value:platform});}`;
  const child = spawnOwned(process.execPath, ["--input-type=module", "-e", script]);
  let stdout = "", stderr = "";
  child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
  child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
  try { expect(await waitExit(child), stderr).toBe(0); expect(stdout.trim()).toBe("owned POSIX group cleaned"); }
  finally { await cleanupChild(child); }
}, 10_000);
