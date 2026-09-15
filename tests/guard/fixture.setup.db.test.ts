import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createFixture, setupFixture, sql, probeClient } from "../../scripts/prepare-test-postgres.mjs";
import { cleanupChild, runProcess, spawnOwned, waitExit, waitReady } from "../helpers/guard-process.js";

describe.sequential("disposable SQL setup", () => {
  it.each(["SIGINT", "SIGTERM"] as const)("quiesces nested admitted root-suite ownership on %s before fixture cleanup/exit", async (signal) => {
    const dir = mkdtempSync(join(tmpdir(), "guard-suite-interrupt-"));
    const ready = join(dir, "ready.json");
    const fixtureFile = join(dir, "fixture.json");
    const cleanupFile = join(dir, "cleanup.json");
    const helper = new URL("../helpers/guard-process.ts", import.meta.url).href;
    const leaf = "process.on('SIGTERM',()=>{});process.on('SIGINT',()=>{});console.log(process.pid);setInterval(()=>{},1000)";
    const middle = `import {ProcessScope,spawnOwned,waitReady,waitExit} from ${JSON.stringify(helper)};
const scope=new ProcessScope();await scope.run(async()=>{const child=spawnOwned(process.execPath,['-e',${JSON.stringify(leaf)}]);try{const pid=Number((await waitReady(child)).toString());console.log(JSON.stringify([process.pid,pid]));await waitExit(child,15000,scope.controller.signal);}finally{await scope.close();}}).catch(()=>{process.exitCode=1;});`;
    const worker = `import {writeFileSync} from 'node:fs';import {ProcessScope,spawnOwned,waitReady,waitExit} from ${JSON.stringify(helper)};
const scope=new ProcessScope();await scope.run(async()=>{const child=spawnOwned(process.execPath,['--input-type=module','-e',${JSON.stringify(middle)}]);try{const pids=JSON.parse((await waitReady(child)).toString());await new Promise(r=>setTimeout(r,100));writeFileSync(${JSON.stringify(ready)},JSON.stringify([process.pid,...pids]));await waitExit(child,15000,scope.controller.signal);}finally{await scope.close();}}).catch(()=>{process.exitCode=1;});`;
    const script = `import {writeFileSync,readFileSync,existsSync} from 'node:fs';import {verify} from ${JSON.stringify(new URL("../../scripts/verify.mjs", import.meta.url).href)};import {createFixture} from ${JSON.stringify(new URL("../../scripts/prepare-test-postgres.mjs", import.meta.url).href)};import {runProcess} from ${JSON.stringify(helper)};
try{await verify({inputs:async()=>({source_sha:'a'.repeat(40),lockfile_sha256:'b'.repeat(64),package_manifest_sha256:{}}),stageList:['sql-setup','root-suite'],run:async()=> 'a'.repeat(40),create:async(options)=>{const fixture=await createFixture({...options,run:async(command,args,options)=>{if(args[0]==='rm'&&existsSync(${JSON.stringify(ready)})){const pids=JSON.parse(readFileSync(${JSON.stringify(ready)},'utf8'));writeFileSync(${JSON.stringify(cleanupFile)},JSON.stringify({quiescent:pids.every(pid=>!existsSync('/proc/'+pid+'/stat')||readFileSync('/proc/'+pid+'/stat','utf8').split(') ')[1].startsWith('Z'))}));}return runProcess(command,args,options);}});writeFileSync(${JSON.stringify(fixtureFile)},JSON.stringify({id:fixture.id,runDir:fixture.runDir}));return fixture;},suite:async(_command,fixture)=>{if(!fixture.receipt.admitted||fixture.receipt.probe!=='passed-signature-and-read-only-query')throw Error('not admitted');await runProcess(process.execPath,['--input-type=module','-e',${JSON.stringify(worker)}]);}});}catch{process.exitCode=1;}`;
    const unrelated = spawnOwned(process.execPath, ["-e", "console.log('ready');setInterval(()=>{},1000)"]);
    const launcher = spawnOwned(process.execPath, ["--input-type=module", "-e", script]);
    launcher.stdout.resume(); launcher.stderr.resume();
    try {
      await waitReady(unrelated);
      const deadline = Date.now() + 330_000;
      while (!existsSync(ready) && launcher.exitCode === null && launcher.signalCode === null && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20));
      expect(existsSync(ready)).toBe(true);
      const pids = JSON.parse(readFileSync(ready, "utf8")) as number[];
      expect(pids).toHaveLength(3);
      process.kill(launcher.pid!, signal);
      await new Promise((resolve) => setTimeout(resolve, 100));
      process.kill(launcher.pid!, signal);
      expect(await waitExit(launcher, 15_000)).toBe(1);
      for (const pid of pids) expect(existsSync(`/proc/${pid}/stat`) && !readFileSync(`/proc/${pid}/stat`, "utf8").split(") ")[1]?.startsWith("Z")).toBe(false);
      expect(() => process.kill(unrelated.pid!, 0)).not.toThrow();
      const fixture = JSON.parse(readFileSync(fixtureFile, "utf8")) as { id: string; runDir: string };
      const receipt = JSON.parse(readFileSync(join(fixture.runDir, "sql-setup.json"), "utf8"));
      expect(JSON.parse(readFileSync(cleanupFile, "utf8"))).toEqual({ quiescent: true });
      expect(receipt).toMatchObject({ container_id: fixture.id, admitted: true, probe: "passed-signature-and-read-only-query", cleanup: "removed-owned-container" });
      await expect(runProcess("docker", ["inspect", fixture.id])).rejects.toThrow();
    } finally {
      await cleanupChild(launcher); await cleanupChild(unrelated);
      if (existsSync(fixtureFile)) {
        const { id } = JSON.parse(readFileSync(fixtureFile, "utf8")) as { id: string };
        await runProcess("docker", ["rm", "--force", id]);
      }
      rmSync(dir, { recursive: true, force: true });
    }
  }, 360_000);
  it("GUARD-SQL-positive", async () => {
    let removals = 0;
    const fixture = await createFixture({ run: async (command, args, options) => {
      if (args[0] === "rm") removals++;
      return await runProcess(command, args, options);
    } });
    try { await setupFixture(fixture); expect(fixture.receipt.probe).toBe("passed-signature-and-read-only-query"); }
    finally { await Promise.all([fixture.cleanup(), fixture.cleanup()]); }
    expect(removals).toBe(1);
  }, 360_000);
  it("GUARD-SQL-creation-cleanup", async () => {
    let created = "";
    await expect(createFixture({ run: async (command, args, options) => {
      const output = await runProcess(command, args, options);
      if (args[0] === "run") { created = output; throw new Error("Lost container creation response"); }
      return output;
    } })).rejects.toThrow("Lost container creation response");
    expect(created).toMatch(/^[a-f0-9]{64}$/);
    await expect(runProcess("docker", ["inspect", created])).rejects.toThrow();
  }, 360_000);
  it("GUARD-SQL-unreachable", async () => {
    await expect(sql({ port: 1, password: "synthetic", runDir: "/nonexistent/guard" }, "select 1")).rejects.toThrow();
  }, 20_000);
  it("GUARD-SQL-invalid-migration", async () => {
    const dir = mkdtempSync(join(tmpdir(), "guard-migrations-"));
    cpSync("supabase/migrations", dir, { recursive: true });
    writeFileSync(join(dir, "999999_invalid.sql"), "this is invalid sql;");
    const fixture = await createFixture();
    try { await expect(setupFixture(fixture, dir)).rejects.toThrow(); }
    finally { await fixture.cleanup(); rmSync(dir, { recursive: true, force: true }); }
  }, 360_000);
  for (const [id, mutation] of [
    ["GUARD-SQL-missing-role", "alter role anon rename to missing_anon"],
    ["GUARD-SQL-privilege", "alter role guard_client superuser"],
    ["GUARD-SQL-missing-function", "drop function public.coordination_acquire_lease(jsonb)"],
  ] as const) it(id, async () => {
    const dir = mkdtempSync(join(tmpdir(), "guard-mutation-"));
    cpSync("supabase/migrations", dir, { recursive: true });
    writeFileSync(join(dir, "999999_control.sql"), mutation + ";");
    const fixture = await createFixture();
    try { await expect(setupFixture(fixture, dir)).rejects.toThrow(); }
    finally { await fixture.cleanup(); rmSync(dir, { recursive: true, force: true }); }
  }, 360_000);
  it("GUARD-SQL-stale", async () => {
    const fixture = await createFixture();
    try {
      await expect(setupFixture({ ...fixture, database: "other" })).rejects.toThrow("before bootstrap");
      await expect(setupFixture({ ...fixture, host: "192.0.2.1" })).rejects.toThrow("before bootstrap");
      expect(await sql(fixture, "select count(*) from pg_roles where rolname='service_role'")).toBe("0");
      await sql(fixture, "create table public.coordination_stale(id int)");
      await expect(setupFixture(fixture)).rejects.toThrow("before bootstrap");
      expect(await sql(fixture, "select count(*) from pg_roles where rolname='guard_client'")).toBe("0");
      await sql(fixture, "drop table public.coordination_stale; create role guard_client");
      await expect(setupFixture(fixture)).rejects.toThrow("before bootstrap");
      expect(await sql(fixture, "select count(*) from pg_roles where rolname='service_role'")).toBe("0");
    } finally { await fixture.cleanup(); }
  }, 360_000);
  it("GUARD-SQL-superuser", async () => {
    const fixture = await createFixture();
    try { await setupFixture(fixture); await expect(probeClient(fixture, "postgres", fixture.password)).rejects.toThrow("Invalid test caller"); }
    finally { await fixture.cleanup(); }
  }, 360_000);
});
