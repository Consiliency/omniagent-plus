import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { cleanEnvironment, runProcess } from "../helpers/guard-process.js";
import { suiteEnvironment } from "../../scripts/verify.mjs";

it("keeps direct live opt-in outside launchers and fails on closed loopback", async () => {
  const dir = mkdtempSync(join(tmpdir(), "guard-live-"));
  const hostile = { ...cleanEnvironment(), OMNIAGENT_PLUS_LIVE_OMNIGENT: "1", OMNIAGENT_PLUS_LIVE_OMNIGENT_BASE_URL: "http://127.0.0.1:1", OMNIAGENT_PLUS_LIVE_OMNIGENT_BEARER_TOKEN: "synthetic", OMNIGENT_AGENT_ID: "guard-falsifier", OPENAI_API_KEY: "synthetic" };
  const args = ["exec", "vitest", "run", "packages/omnigent-transport/src/live-omnigent-smoke.test.ts", "--reporter=json", `--outputFile=${join(dir, "report.json")}`];
  try {
    await runProcess("pnpm", args, { env: suiteEnvironment(undefined, hostile), timeout: 20_000 });
    const scrubbed = JSON.parse(readFileSync(join(dir, "report.json"), "utf8"));
    expect(scrubbed.numPendingTests).toBe(1);
    await expect(runProcess("pnpm", args, { env: hostile, timeout: 20_000 })).rejects.toThrow("exit 1");
    const direct = JSON.parse(readFileSync(join(dir, "report.json"), "utf8"));
    expect(direct.numPendingTests).toBe(0);
    expect(direct.numFailedTests).toBe(1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}, 45_000);
