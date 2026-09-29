import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanupChild, spawnOwned, validateCustodyJournal, waitExit, withCustodyContext } from "../tests/helpers/guard-process.ts";

const evidenceRoot = join(process.cwd(), ".phase-loop/guard");
mkdirSync(evidenceRoot, { recursive: true });
const dir = mkdtempSync(join(evidenceRoot, "real-suite-interrupt-"));
const ready = join(dir, "ready");
const finished = join(dir, "finished");
writeFileSync(join(dir, "vitest.config.ts"), "export default { test: { include: ['mini.test.ts'], globals: true, maxWorkers: 1 } };\n");
writeFileSync(join(dir, "mini.test.ts"), `import {writeFileSync} from 'node:fs';test('active work',async()=>{writeFileSync(${JSON.stringify(ready)},'ready');await new Promise(resolve=>setTimeout(resolve,1500));writeFileSync(${JSON.stringify(finished)},'finished')});`);
const script = `import {runSuite} from ${JSON.stringify(new URL("./verify.mjs", import.meta.url).href)};import {ProcessScope} from ${JSON.stringify(new URL("../tests/helpers/guard-process.ts", import.meta.url).href)};
const scope=new ProcessScope(3);try{await scope.run(()=>runSuite('test',undefined,${JSON.stringify(dir)}))}catch{process.exitCode=1}finally{await scope.close().catch(()=>{process.exitCode=1})}`;
const child = withCustodyContext(dir, "real-suite-interrupt", () => spawnOwned(process.execPath, ["--input-type=module", "-e", script], { cwd: dir, timeout: 40_000, launcherBudget: { cleanupSlots: 3, maxChildReservationMs: 167_500 } }));
child.stdout.resume(); child.stderr.resume(); child.stdin.end();
try {
  const deadline = Date.now() + 30_000;
  while (!existsSync(ready) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(existsSync(ready), true, "real Vitest test did not start");
  process.kill(child.pid, "SIGINT");
  assert.equal(await waitExit(child), 1);
  assert.equal(existsSync(finished), true, "active test did not finish after interrupt");
  const custody = validateCustodyJournal(dir);
  assert.ok(custody.admitted >= 2);
  assert.equal(custody.signaled, 0);
  console.log(JSON.stringify({ control: "real-suite-interrupt", custody }));
} finally { await cleanupChild(child); }
