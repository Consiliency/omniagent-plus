import { spawn } from "node:child_process";
import type { ChildProcessWithoutNullStreams, SpawnOptionsWithoutStdio } from "node:child_process";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Readable, Writable } from "node:stream";

export const PROCESS_MS = 15_000;
export function cleanEnvironment(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = {};
  for (const key of ["PATH", "HOME", "TMPDIR", "TEMP", "SystemRoot", "LANG", "LC_ALL", "CI", "PNPM_HOME", "XDG_CACHE_HOME", "GUARD_CUSTODY_RUN_DIR", "GUARD_CUSTODY_STAGE"]) {
    if (source[key] !== undefined) result[key] = source[key];
  }
  return result;
}

type OwnedOptions = SpawnOptionsWithoutStdio & { timeout?: number; input?: string; custodyControlId?: string };
type CustodyResult = {
  payload_pid: number | null;
  outcome: { exit_code?: number; signal?: NodeJS.Signals; not_started?: boolean };
  custody: "quiescent" | "unproven";
  error: string | null;
  adopted_count: number;
  adopted_natural_count: number;
  adopted_signaled_count: number;
  adopted_unresolved_count: number;
  force_killed_count: number;
};
type OwnedChild = {
  child: ChildProcessWithoutNullStreams;
  command: string;
  args: string[];
  id: string;
  nonce: string;
  control: Writable;
  status: Readable;
  buffer: string;
  inputSeq: number;
  outputSeq: number;
  admitted: boolean;
  workDrained: boolean;
  result?: CustodyResult;
  fault?: Error;
  closed: boolean;
  finished: Promise<CustodyResult>;
  resolve: (result: CustodyResult) => void;
  reject: (error: Error) => void;
  cleanup?: Promise<void>;
  timeout: number;
  started: bigint;
  options: OwnedOptions;
  scope?: ProcessScope;
};
const owned = new Map<number, OwnedChild>();
const context = new AsyncLocalStorage<ProcessScope | undefined>();
const supervisorPath = fileURLToPath(new URL("./guard-supervisor.py", import.meta.url));
const elapsedMs = (started: bigint) => Number((process.hrtime.bigint() - started) / 1_000_000n);

function journal(record: OwnedChild, event: "admission" | "terminal", result?: CustodyResult): void {
  const dir = process.env.GUARD_CUSTODY_RUN_DIR;
  if (!dir) return;
  const row = { event, command_id: record.id, stage: process.env.GUARD_CUSTODY_STAGE ?? "standalone", supervisor_pid: record.child.pid, control_case_id: record.options.custodyControlId ?? null, ...(result ? { custody: result.custody, adopted_count: result.adopted_count, adopted_natural_count: result.adopted_natural_count, adopted_signaled_count: result.adopted_signaled_count, adopted_unresolved_count: result.adopted_unresolved_count, force_killed_count: result.force_killed_count } : {}) };
  appendFileSync(`${dir}/custody.jsonl`, `${JSON.stringify(row)}\n`);
}

function send(record: OwnedChild, kind: string, fields: Record<string, unknown> = {}): void {
  const data = `${JSON.stringify({ v: 1, nonce: record.nonce, seq: record.outputSeq++, type: kind, ...fields })}\n`;
  if (Buffer.byteLength(data) > 65_536 || !record.control.writable) throw new Error("GUARD control channel unavailable");
  record.control.write(data);
}

function finish(record: OwnedChild): void {
  if (record.closed) return;
  record.closed = true;
  let error = record.fault;
  const result = record.result;
  if (!error && (!record.admitted || !record.workDrained || !result)) error = new Error("GUARD custody result missing");
  if (!error && result) {
    if (result.custody !== "quiescent" || result.error || result.adopted_unresolved_count !== 0) error = new Error("GUARD custody unproven");
    else if (result.adopted_count !== result.adopted_natural_count + result.adopted_signaled_count) error = new Error("GUARD custody counts invalid");
    else if (result.outcome.signal ? record.child.signalCode !== result.outcome.signal : record.child.exitCode !== result.outcome.exit_code) error = new Error("GUARD supervisor/payload exit mismatch");
  }
  if (record.admitted) {
    try { journal(record, "terminal", result ?? { payload_pid: null, outcome: {}, custody: "unproven", error: "result_missing", adopted_count: 0, adopted_natural_count: 0, adopted_signaled_count: 0, adopted_unresolved_count: 0, force_killed_count: 0 }); }
    catch { error = new Error("GUARD custody receipt write failed"); }
  }
  if (error || !result) record.reject(error ?? new Error("GUARD custody result missing"));
  else record.resolve(result);
}

function handleStatus(record: OwnedChild, chunk: Buffer): void {
  record.buffer += chunk.toString("utf8");
  if (Buffer.byteLength(record.buffer) > 65_536) { record.fault = new Error("GUARD status frame too large"); record.control.end(); return; }
  while (record.buffer.includes("\n")) {
    const index = record.buffer.indexOf("\n");
    const line = record.buffer.slice(0, index);
    record.buffer = record.buffer.slice(index + 1);
    let frame: Record<string, unknown>;
    try { frame = JSON.parse(line) as Record<string, unknown>; }
    catch { record.fault = new Error("GUARD status frame malformed"); record.control.end(); return; }
    if (frame.v !== 1 || frame.nonce !== record.nonce || frame.seq !== record.inputSeq++) { record.fault = new Error("GUARD status sequence mismatch"); record.control.end(); return; }
    if (frame.type === "READY" && record.inputSeq === 1) {
      const capabilities = frame.capabilities as Record<string, unknown> | undefined;
      if (!capabilities || Object.values(capabilities).length !== 4 || Object.values(capabilities).some((value) => value !== true)) { record.fault = new Error("GUARD custody capability refused"); record.control.end(); return; }
      if (record.options.signal?.aborted || record.scope?.controller.signal.aborted || elapsedMs(record.started) >= record.timeout) { record.fault = new Error("GUARD admission cancelled"); record.control.end(); return; }
      const env = Object.fromEntries(Object.entries(record.options.env ?? cleanEnvironment()).filter((entry): entry is [string, string] => entry[1] !== undefined));
      const cwd = record.options.cwd instanceof URL ? fileURLToPath(record.options.cwd) : record.options.cwd ?? process.cwd();
      try {
        journal(record, "admission");
        send(record, "ADMIT", { command: record.command, argv: record.args, cwd, env, umask: process.umask(), stdio: { stdin: 0, stdout: 1, stderr: 2 }, deadline_ns: String(record.started + BigInt(record.timeout) * 1_000_000n) });
        record.admitted = true;
      } catch { record.fault = new Error("GUARD admission failed"); record.control.end(); }
    } else if (frame.type === "WORK_DRAINED") {
      record.workDrained = frame.quiescent === true;
    } else if (frame.type === "RESULT") {
      record.result = frame as unknown as CustodyResult;
    } else { record.fault = new Error("GUARD status frame out of order"); record.control.end(); return; }
  }
}

export class ProcessScope {
  readonly controller = new AbortController();
  readonly children = new Set<ChildProcessWithoutNullStreams>();
  private readonly cleanups = new Set<() => Promise<void>>();
  private closing?: Promise<void>;
  private readonly interrupt = () => {
    this.controller.abort();
    this.close().catch(() => { process.exitCode = 1; });
  };
  constructor() {
    process.on("SIGINT", this.interrupt);
    process.on("SIGTERM", this.interrupt);
  }
  run<T>(operation: () => T): T { return context.run(this, operation); }
  check(): void { if (this.controller.signal.aborted || this.closing) throw new Error("GUARD operation interrupted/closed"); }
  addCleanup(cleanup: () => Promise<void>): void { this.cleanups.add(cleanup); }
  close(): Promise<void> {
    return this.closing ??= Promise.resolve().then(() => this.finish());
  }
  private async finish(): Promise<void> {
    this.controller.abort();
    try {
      const results = await Promise.allSettled([...this.children].map(cleanupChild));
      // Resource cleanup must be allowed to launch bounded commands after cancellation.
      const resources = await context.run(undefined, async () => {
        const outcomes: PromiseSettledResult<void>[] = [];
        for (const cleanup of this.cleanups) outcomes.push(...await Promise.allSettled([Promise.resolve().then(cleanup)]));
        return outcomes;
      });
      const failed = [...results, ...resources].find((result) => result.status === "rejected");
      if (failed?.status === "rejected") throw failed.reason;
    } finally {
      process.off("SIGINT", this.interrupt);
      process.off("SIGTERM", this.interrupt);
    }
  }
}
export function currentProcessScope(): ProcessScope | undefined { return context.getStore(); }
export function outsideProcessScope<T>(operation: () => T): T { return context.run(undefined, operation); }

export function signalOwned(pid: number, signal: NodeJS.Signals): void {
  const record = owned.get(pid);
  if (!record || pid === process.pid) throw new Error("Unowned process group");
  if (!["SIGINT", "SIGTERM", "SIGHUP"].includes(signal)) throw new Error("Unsupported GUARD forward signal");
  send(record, "FORWARD", { signal });
}

export function spawnOwned(command: string, args: string[], options: OwnedOptions = {}): ChildProcessWithoutNullStreams {
  const scope = currentProcessScope();
  scope?.check();
  if (process.platform !== "linux") throw new Error("GUARD Linux custody backend required");
  const started = process.hrtime.bigint();
  const nonce = randomUUID();
  const child = spawn("python3", ["-I", "-S", "-B", supervisorPath, nonce], { env: cleanEnvironment(), detached: true, stdio: ["pipe", "pipe", "pipe", "pipe", "pipe"] }) as ChildProcessWithoutNullStreams;
  if (child.pid !== undefined) {
    let resolve!: (result: CustodyResult) => void;
    let reject!: (error: Error) => void;
    const finished = new Promise<CustodyResult>((yes, no) => { resolve = yes; reject = no; });
    const record: OwnedChild = { child, id: randomUUID(), nonce, command, args, control: child.stdio[3] as Writable, status: child.stdio[4] as Readable, buffer: "", inputSeq: 0, outputSeq: 0, admitted: false, workDrained: false, closed: false, finished, resolve, reject, timeout: options.timeout ?? PROCESS_MS, started, options, scope };
    owned.set(child.pid, record);
    scope?.children.add(child);
    record.status.on("data", (chunk: Buffer) => handleStatus(record, chunk));
    record.status.on("error", () => { record.fault = new Error("GUARD status channel failed"); });
    record.control.on("error", () => { record.fault = new Error("GUARD control channel failed"); });
    child.on("error", () => { record.fault = new Error("GUARD supervisor spawn failed"); });
    child.once("close", () => finish(record));
    options.signal?.addEventListener("abort", () => {
      if (!record.admitted) record.control.end();
      else if (!record.closed) send(record, "SHUTDOWN", { epoch: 1, mode: "forced" });
    }, { once: true });
    void finished.catch(() => {});
  }
  child.on("error", () => {});
  return child;
}

export function cleanupChild(child: ChildProcessWithoutNullStreams): Promise<void> {
  const record = child.pid === undefined ? undefined : owned.get(child.pid);
  if (!record) return Promise.resolve();
  return record.cleanup ??= (async () => {
    if (!record.closed) {
      if (record.admitted) send(record, "SHUTDOWN", { epoch: 1, mode: "forced" });
      else record.control.end();
    }
    await Promise.race([record.finished, new Promise<never>((_, reject) => setTimeout(() => reject(new Error("GUARD custody deadline: supervisor retained")), 2_500))]);
    owned.delete(child.pid!);
  })();
}

export async function waitExit(child: ChildProcessWithoutNullStreams, timeout = PROCESS_MS, signal?: AbortSignal): Promise<number> {
  if (signal?.aborted) throw new Error("Child operation interrupted");
  const record = child.pid === undefined ? undefined : owned.get(child.pid);
  if (!record) throw new Error("Child spawn failed");
  const remaining = Math.max(0, timeout - elapsedMs(record.started));
  const result = await new Promise<CustodyResult>((resolve, reject) => {
    const timer = setTimeout(() => { if (!record.closed && record.admitted) send(record, "SHUTDOWN", { epoch: 1, mode: "forced" }); reject(new Error("Child operation timed out")); }, remaining);
    const onAbort = () => { if (!record.closed && record.admitted) send(record, "SHUTDOWN", { epoch: 1, mode: "forced" }); reject(new Error("Child operation interrupted")); };
    signal?.addEventListener("abort", onAbort, { once: true });
    record.finished.then(resolve, reject).finally(() => { clearTimeout(timer); signal?.removeEventListener("abort", onAbort); });
  });
  if (result.outcome.signal) throw new Error("Child terminated by signal");
  if (typeof result.outcome.exit_code !== "number") throw new Error("Child outcome missing");
  return result.outcome.exit_code;
}

export async function waitReady(child: ChildProcessWithoutNullStreams, timeout = PROCESS_MS): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => finish(new Error("Child readiness timed out")), timeout);
    const onError = () => finish(new Error("Child failed before readiness"));
    const onData = (chunk: Buffer) => {
      output += chunk.toString();
      if (output.includes("\n")) finish();
    };
    function finish(error?: Error): void {
      clearTimeout(timer);
      child.stdout.off("data", onData);
      child.off("error", onError);
      child.off("close", onError);
      if (error) reject(error); else resolve(Buffer.from(output));
    }
    child.stdout.on("data", onData);
    child.once("error", onError);
    child.once("close", onError);
  });
}

export async function runProcess(command: string, args: string[], options: OwnedOptions = {}): Promise<string> {
  const scope = currentProcessScope();
  const signals = [scope?.controller.signal, options.signal].filter((signal): signal is AbortSignal => signal !== undefined);
  const signal = AbortSignal.any(signals);
  if (signal.aborted) throw new Error("Child operation interrupted");
  const child = spawnOwned(command, args, options);
  let stdout = "";
  child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
  child.stderr.resume();
  child.stdin.end(options.input);
  try {
    const code = await waitExit(child, options.timeout ?? PROCESS_MS, signal);
    if (code !== 0) throw new Error(`${command} failed (exit ${code})`);
    return stdout.trim();
  } finally { await cleanupChild(child); scope?.children.delete(child); }
}
