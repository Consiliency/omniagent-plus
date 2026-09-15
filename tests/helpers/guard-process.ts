import { spawn } from "node:child_process";
import type { ChildProcessWithoutNullStreams, SpawnOptionsWithoutStdio } from "node:child_process";
import { AsyncLocalStorage } from "node:async_hooks";
import { readFileSync, readdirSync } from "node:fs";

export const PROCESS_MS = 15_000;
export function cleanEnvironment(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = {};
  for (const key of ["PATH", "HOME", "TMPDIR", "TEMP", "SystemRoot", "LANG", "LC_ALL", "CI", "PNPM_HOME", "XDG_CACHE_HOME"]) {
    if (source[key] !== undefined) result[key] = source[key];
  }
  return result;
}

type Identity = { pid: number; parent: number; start: string; state: string };
type OwnedChild = { child: ChildProcessWithoutNullStreams; identities: Map<number, Identity>; closed: boolean; poll: NodeJS.Timeout; cleanup?: Promise<void> };
const owned = new Map<number, OwnedChild>();
const context = new AsyncLocalStorage<ProcessScope | undefined>();
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function identity(pid: number): Identity | undefined {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    const fields = stat.slice(stat.lastIndexOf(") ") + 2).split(" ");
    return { pid, parent: Number(fields[1]), start: fields[19]!, state: fields[0]! };
  } catch (error) {
    if (!["ENOENT", "ESRCH"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error;
  }
}
function live(processIdentity: Identity): boolean {
  const current = identity(processIdentity.pid);
  return current?.start === processIdentity.start && !["Z", "X"].includes(current.state);
}
function discover(record: OwnedChild): void {
  if (process.platform !== "linux") return;
  const pending = [...record.identities.values()];
  const visited = new Set<number>();
  // Traverse only proven owned ancestry, including children forked by non-leader threads.
  for (const parent of pending) {
    if (visited.has(parent.pid) || !live(parent)) continue;
    visited.add(parent.pid);
    try {
      for (const tid of readdirSync(`/proc/${parent.pid}/task`)) {
        let children: string;
        try { children = readFileSync(`/proc/${parent.pid}/task/${tid}/children`, "utf8"); }
        catch (error) {
          if (!["ENOENT", "ESRCH"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error;
          continue;
        }
        for (const pid of children.trim().split(/\s+/).filter(Boolean)) {
          const entry = identity(Number(pid));
          if (entry?.parent !== parent.pid || !live(parent)) continue;
          record.identities.set(entry.pid, entry);
          pending.push(entry);
        }
      }
    } catch (error) {
      if (!["ENOENT", "ESRCH"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error;
    }
  }
}
function groupAlive(record: OwnedChild): boolean {
  if (record.child.pid === undefined) return false;
  try { process.kill(-record.child.pid, 0); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; return false; }
}
function signalRecord(record: OwnedChild, signal: NodeJS.Signals): void {
  if (process.platform === "linux") {
    for (const entry of record.identities.values()) if (live(entry)) {
      try { process.kill(entry.pid, signal); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
    }
  } else if (record.child.pid !== undefined && (process.platform !== "win32" || !record.closed)) {
    try { process.kill(process.platform === "win32" ? record.child.pid : -record.child.pid, signal); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
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
  discover(record);
  signalRecord(record, signal);
}

export function spawnOwned(command: string, args: string[], options: SpawnOptionsWithoutStdio = {}): ChildProcessWithoutNullStreams {
  const scope = currentProcessScope();
  scope?.check();
  const child = spawn(command, args, { ...options, signal: undefined, env: options.env ?? cleanEnvironment(), detached: process.platform !== "win32", stdio: "pipe" });
  if (child.pid !== undefined) {
    const root = process.platform === "linux" ? identity(child.pid) : undefined;
    const record: OwnedChild = { child, identities: new Map(root ? [[root.pid, root]] : []), closed: false, poll: setInterval(() => discover(record), 20) };
    record.poll.unref();
    owned.set(child.pid, record);
    scope?.children.add(child);
    child.once("close", () => { record.closed = true; });
  }
  // Keep spawn errors observable by waits without an unhandled EventEmitter error.
  child.on("error", () => {});
  return child;
}

export function cleanupChild(child: ChildProcessWithoutNullStreams): Promise<void> {
  const record = child.pid === undefined ? undefined : owned.get(child.pid);
  if (!record) return Promise.resolve();
  return record.cleanup ??= (async () => {
    const quiet = () => record.closed && (process.platform === "linux" ? ![...record.identities.values()].some(live) : process.platform === "win32" || !groupAlive(record));
    discover(record);
    signalRecord(record, "SIGTERM");
    const grace = Date.now() + 500;
    while (!quiet() && Date.now() < grace) { discover(record); await sleep(Math.min(20, Math.max(0, grace - Date.now()))); }
    discover(record);
    signalRecord(record, "SIGKILL");
    const deadline = Date.now() + 2_000;
    while (!quiet() && Date.now() < deadline) { discover(record); signalRecord(record, "SIGKILL"); await sleep(20); }
    clearInterval(record.poll);
    if (!quiet()) throw new Error("Owned child/descendants failed to quiesce");
    owned.delete(child.pid!);
  })();
}

export async function waitExit(child: ChildProcessWithoutNullStreams, timeout = PROCESS_MS, signal?: AbortSignal): Promise<number> {
  if (signal?.aborted) throw new Error("Child operation interrupted");
  if (child.exitCode !== null) return child.exitCode;
  if (child.signalCode !== null) throw new Error("Child terminated by signal");
  return await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error("Child operation timed out")), timeout);
    const onError = () => finish(new Error("Child spawn failed"));
    const onAbort = () => finish(new Error("Child operation interrupted"));
    const onClose = (code: number | null) => code === null ? finish(new Error("Child terminated by signal")) : finish(undefined, code);
    function finish(error?: Error, code = 1): void {
      clearTimeout(timer);
      child.off("error", onError);
      child.off("close", onClose);
      signal?.removeEventListener("abort", onAbort);
      if (error) reject(error); else resolve(code);
    }
    child.once("error", onError);
    child.once("close", onClose);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
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

export async function runProcess(command: string, args: string[], options: SpawnOptionsWithoutStdio & { timeout?: number; input?: string } = {}): Promise<string> {
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
