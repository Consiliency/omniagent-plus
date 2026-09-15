import { existsSync, readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { cleanupChild, runProcess, signalOwned, spawnOwned, waitReady } from "../helpers/guard-process.js";

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
    await expect(runProcess(process.execPath, ["-e", `const{spawn}=require('node:child_process');const{writeFileSync}=require('node:fs');const c=spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"],{stdio:'ignore'});writeFileSync(${JSON.stringify(pidFile)},String(c.pid));process.on('SIGTERM',()=>{});setInterval(()=>{},1000);`], { timeout: 250 })).rejects.toThrow("timed out");
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
