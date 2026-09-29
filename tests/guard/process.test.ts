import { existsSync, readFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, it } from "vitest";
import { cleanupChild, ProcessScope, runProcess, signalOwned, spawnOwned, validateCustodyJournal, waitExit, waitReady, withCustodyContext } from "../helpers/guard-process.js";

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
  const scope = new ProcessScope(2);
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
  const scope = new ProcessScope(2);
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
it("reaps a double-forked child in a new session before the launcher returns", async () => {
  const dir = mkdtempSync(join(tmpdir(), "guard-double-fork-"));
  const pidFile = join(dir, "leaf");
  try {
    const middle = `const{spawn}=require('node:child_process');const{writeFileSync}=require('node:fs');const leaf=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,stdio:'ignore'});writeFileSync(${JSON.stringify(pidFile)},String(leaf.pid));leaf.unref();process.exit(0);`;
    const launcher = `const{spawn}=require('node:child_process');const middle=spawn(process.execPath,['-e',${JSON.stringify(middle)}],{detached:true,stdio:'ignore'});middle.unref();process.exit(0);`;
    await runProcess(process.execPath, ["-e", launcher], { custodyControlId: "immediate-orphan" });
    expect(existsSync(`/proc/${Number(readFileSync(pidFile, "utf8"))}`)).toBe(false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
it("retains the original polling helper as a failing positive control", async () => {
  const dir = mkdtempSync(join(tmpdir(), "guard-old-probe-"));
  try {
    expect(await runProcess("git", ["rev-parse", "160a770:tests/helpers/guard-process.ts"])).toBe("bc95c97854ae52f8ad83e28bbf0dd204bec4f630");
    const source = `${await runProcess("git", ["show", "160a770:tests/helpers/guard-process.ts"])}\n`;
    expect(createHash("sha256").update(source).digest("hex")).toBe("d7f67d4d1b27c05ca8095094d71b01c5184df69e915fb00852e991a6fe9e79a4");
    const helper = join(dir, "guard-process.ts");
    writeFileSync(helper, source);
    const script = `import fs from 'node:fs';import {runProcess} from ${JSON.stringify(pathToFileURL(helper).href)};
const marker='guard-old-positive-control';const leaf='setInterval(()=>{},1000)';
const identity=pid=>{try{const f=fs.readFileSync('/proc/'+pid+'/stat','utf8').split(') ')[1].split(' ');return{start:f[19],state:f[0]};}catch(e){if(e.code==='ENOENT')return null;throw e;}};
const alive=(pid,start)=>{const now=identity(pid);return now&&now.start===start&&!['Z','X'].includes(now.state);};
let escapes=0;
for(let i=0;i<20;i++){
 const code="const{spawn}=require('node:child_process');const c=spawn(process.execPath,['-e',"+JSON.stringify(leaf)+","+JSON.stringify(marker)+"],{detached:true,stdio:'ignore'});console.log(c.pid);c.unref();";
 const pid=Number(await runProcess(process.execPath,['-e',code]));const first=identity(pid);
 if(first&&alive(pid,first.start)){
  const args=fs.readFileSync('/proc/'+pid+'/cmdline','utf8').split('\\0');
  if(!args.includes(marker)||!args.includes(leaf)||!alive(pid,first.start))throw Error('positive-control ownership mismatch');
  escapes++;process.kill(pid,'SIGTERM');
  const deadline=Date.now()+2000;while(alive(pid,first.start)&&Date.now()<deadline)await new Promise(r=>setTimeout(r,20));
  if(alive(pid,first.start))throw Error('positive-control rescue failed');
 }
}
console.log(escapes);`;
    expect(Number(await runProcess(process.execPath, ["--input-type=module", "-e", script], { timeout: 15_000 }))).toBeGreaterThan(0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}, 30_000);
it("records a service child that exits naturally after its launcher", async () => {
  const dir = mkdtempSync(join(tmpdir(), "guard-natural-adoption-"));
  const script = `const{spawn}=require('node:child_process');const child=spawn(process.execPath,['-e',"const parent=process.ppid;const timer=setInterval(()=>{if(process.ppid!==parent){clearInterval(timer);process.stdin.resume();process.stdin.on('end',()=>process.exit(0));}},10)"],{detached:true,stdio:['inherit','ignore','ignore']});child.unref();setTimeout(()=>process.exit(0),50);`;
  try {
    await withCustodyContext(dir, "natural-adoption-control", () => runProcess(process.execPath, ["-e", script]));
    expect(validateCustodyJournal(dir)).toEqual({ admitted: 1, natural: 1, signaled: 0 });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
it("isolates the Python supervisor from a shadow standard-library module", async () => {
  const dir = mkdtempSync(join(tmpdir(), "guard-shadow-"));
  try {
    writeFileSync(join(dir, "json.py"), "raise RuntimeError('shadow module loaded')\n");
    expect(await runProcess(process.execPath, ["-e", "console.log('admitted')"], { cwd: dir })).toBe("admitted");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
it("counts a reaped adopted child with failed pidfd acquisition as unresolved", async () => {
  const helper = new URL("../helpers/guard-supervisor.py", import.meta.url).pathname;
  const script = `import os,runpy,time
m=runpy.run_path(${JSON.stringify(helper)})
s=m['Supervisor']('fault-control')
read,write=os.pipe()
pid=os.fork()
if pid==0:
 os.close(write);os.read(read,1);os._exit(0)
os.close(read)
s.payload=999999
m['Supervisor'].register.__globals__['verified_pidfd']=lambda p: (_ for _ in ()).throw(OSError('injected pidfd refusal'))
s.register(pid)
s.payload_status=0
frames=[]
s.send=lambda kind,**fields: frames.append((kind,fields))
s.result(True)
assert frames[-1][1]['custody']=='unproven' and frames[-1][1]['adopted_unresolved_count']==1
os.write(write,b'x');os.close(write)
deadline=time.monotonic()+2
while pid in s.active and time.monotonic()<deadline:
 s.reap();time.sleep(.005)
assert pid not in s.active and s.adopted_unresolved==1 and s.adopted_natural==0 and s.adopted_signaled==0
print('pidfd refusal retained')`;
  expect(await runProcess("python3", ["-I", "-S", "-B", "-c", script])).toBe("pidfd refusal retained");
});
it("rejects unbalanced custody receipts and an unexpected rescue beside an expected control", () => {
  const dir = mkdtempSync(join(tmpdir(), "guard-journal-"));
  const admission = (id: string, control: string | null = null) => ({ event: "admission", command_id: id, stage: "root-suite", supervisor_pid: 123, supervisor_start_identity: "456", control_case_id: control });
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
