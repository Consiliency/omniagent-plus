import { expect, it } from "vitest";
import { configDefaults } from "vitest/config";
import config from "../../vitest.config.js";
import { cleanEnvironment, runProcess } from "../helpers/guard-process.js";
import { suiteEnvironment } from "../../scripts/verify.mjs";
import { awaitReadiness, connectionEnvironment, createFixture, pullImage, validateMetadata, IMAGE, PLATFORM } from "../../scripts/prepare-test-postgres.mjs";

it("scrubs hostile SQL, live opt-in, provider keys and routes before test launches", () => {
  const hostile = { PATH: process.env.PATH, HOME: process.env.HOME, GUARD_INTEGRATION_REQUIRED: "1", GUARD_TEST_DATABASE_URL: "hostile", DATABASE_URL: "hostile", PGHOSTADDR: "hostile", PGOPTIONS: "hostile", PGSERVICEFILE: "hostile", PGPASSFILE: "hostile", PGSSLMODE: "hostile", SUPABASE_URL: "hostile", OMNIAGENT_PLUS_LIVE_OMNIGENT: "1", OMNIAGENT_PLUS_LIVE_OMNIGENT_BASE_URL: "http://127.0.0.1:1", OMNIAGENT_PLUS_LIVE_OMNIGENT_BEARER_TOKEN: "hostile", OMNIGENT_AGENT_ID: "hostile", OPENAI_API_KEY: "hostile", ANTHROPIC_BASE_URL: "hostile" };
  expect(suiteEnvironment(undefined, hostile)).toEqual({ PATH: process.env.PATH, HOME: process.env.HOME });
  expect(cleanEnvironment(hostile)).toEqual(suiteEnvironment(undefined, hostile));
  const env = connectionEnvironment({ port: 1234, password: "synthetic", runDir: "/nonexistent/fixture" });
  expect(env.PGHOSTADDR).toBe("127.0.0.1");
  expect(env.PGOPTIONS).toBe("-c statement_timeout=10000");
  expect(env.PGSSLMODE).toBe("disable");
  expect(env.PGSERVICEFILE).toBe("/nonexistent/fixture/absent-service");
  expect(env).not.toHaveProperty("DATABASE_URL");
});
it("retains Vitest dependency exclusions when partitioning DB collection", () => {
  const project = config.test?.projects?.[0];
  expect(typeof project).toBe("object");
  if (typeof project !== "object" || !("test" in project)) throw new Error("Missing deterministic project");
  expect(project.test?.exclude).toEqual([...configDefaults.exclude, "tests/guard/**/*.db.test.ts"]);
});
it("leaks no fixture parameters to non-DB workers or their descendants", async () => {
  const keys = Object.keys(process.env).filter((key) => key.startsWith("PG") || key.startsWith("GUARD_") || key.startsWith("SUPABASE_") || key === "DATABASE_URL");
  expect(keys).toEqual([]);
  const output = await runProcess(process.execPath, ["-e", "console.log(JSON.stringify(Object.keys(process.env).filter(k=>/^(PG|GUARD_|SUPABASE_|DATABASE_URL)/.test(k))))"], { env: process.env });
  expect(JSON.parse(output)).toEqual([]);
});
it("rejects absent and forged hosted fixture tuples without docker writes", async () => {
  const calls: string[][] = [];
  const run = async (_cmd: string, args: string[]) => { calls.push(args); return ""; };
  await expect(createFixture({ mode: "github-service", source: {}, run })).rejects.toThrow("hosted fixture");
  expect(calls).toEqual([]);
  await expect(createFixture({ mode: "remote", run })).rejects.toThrow("mode");
});
it("separates cold pull budget from readiness and propagates failed pulls", async () => {
  const calls: unknown[] = [];
  await pullImage(async (_cmd: string, args: string[], options: unknown) => { calls.push({ args, options }); return ""; });
  expect(calls).toEqual([{ args: ["pull", "--platform", PLATFORM, IMAGE], options: { timeout: 300_000 } }]);
  await expect(pullImage(async () => { throw new Error("cold pull failed"); })).rejects.toThrow("cold pull failed");
});
it("rejects image, platform, host binding and service identity substitution", () => {
  const fixture = { id: "owned", port: 15432 };
  const image = { Id: "image", Os: "linux", Architecture: "amd64", RepoDigests: [IMAGE] };
  const container = { Id: "owned", Config: { Image: IMAGE }, Image: "image", State: { Running: true }, NetworkSettings: { Ports: { "5432/tcp": [{ HostIp: "127.0.0.1", HostPort: "15432" }] } } };
  expect(() => validateMetadata(container, image, fixture)).not.toThrow();
  for (const changed of [{ ...container, Id: "forged" }, { ...container, Image: "forged" }, { ...container, NetworkSettings: { Ports: { "5432/tcp": [{ HostIp: "0.0.0.0", HostPort: "15432" }] } } }]) expect(() => validateMetadata(changed, image, fixture)).toThrow("identity");
  expect(() => validateMetadata(container, { ...image, Architecture: "arm64" }, fixture)).toThrow("identity");
});
it("caps readiness attempts and sleeps by the remaining 30-second budget", async () => {
  let time = 0;
  const budgets: number[] = [];
  await expect(awaitReadiness({ password: "synthetic" }, {
    now: () => time,
    sleep: async (ms: number) => { time += ms; },
    probe: async (_fixture: unknown, _sql: string, _user = "postgres", _password?: string, timeout = 15_000) => {
      budgets.push(timeout);
      time += timeout + 500;
      throw new Error("not ready");
    },
  })).rejects.toThrow("readiness");
  expect(budgets).toEqual([15_000, 13_700]);
  expect(time).toBeLessThanOrEqual(30_000);
});
it.each(["SIGINT", "SIGTERM"])("registers %s cleanup before the cold pull starts", async (signal) => {
  const script = `import {createFixture} from './scripts/prepare-test-postgres.mjs';
try {await createFixture({run:async (_command,args,options)=>{if(args[0]!=='pull')throw Error('unexpected operation');process.kill(process.pid,${JSON.stringify(signal)});await new Promise(r=>setTimeout(r,25));if(options.signal.aborted)throw Error('aborted owned pull');return '';}});process.exitCode=3;}
catch(error){if(error.message!=='aborted owned pull')throw error;console.log('signal safely rejected');}`;
  expect(await runProcess(process.execPath, ["--input-type=module", "-e", script])).toBe("signal safely rejected");
});
