import { spawn } from "node:child_process";
import type { ChildProcessWithoutNullStreams, SpawnOptionsWithoutStdio } from "node:child_process";

export const PROCESS_MS = 15_000;
export function cleanEnvironment(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = {};
  for (const key of ["PATH", "HOME", "TMPDIR", "TEMP", "SystemRoot", "LANG", "LC_ALL", "CI", "PNPM_HOME", "XDG_CACHE_HOME"]) {
    if (source[key] !== undefined) result[key] = source[key];
  }
  return result;
}

const owned = new Set<number>();
export function signalOwned(pid: number, signal: NodeJS.Signals): void {
  if (!owned.has(pid) || pid === process.pid) throw new Error("Unowned process group");
  try { process.kill(process.platform === "win32" ? pid : -pid, signal); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
}

export function spawnOwned(command: string, args: string[], options: SpawnOptionsWithoutStdio = {}): ChildProcessWithoutNullStreams {
  const child = spawn(command, args, { ...options, env: options.env ?? cleanEnvironment(), detached: process.platform !== "win32", stdio: "pipe" });
  if (child.pid !== undefined) owned.add(child.pid);
  // Keep spawn errors observable by waits without an unhandled EventEmitter error.
  child.on("error", () => {});
  return child;
}

export async function cleanupChild(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.pid === undefined || !owned.has(child.pid)) return;
  signalOwned(child.pid, "SIGTERM");
  await new Promise<void>((resolve) => setTimeout(resolve, 500));
  signalOwned(child.pid, "SIGKILL");
  owned.delete(child.pid);
}

export async function waitExit(child: ChildProcessWithoutNullStreams, timeout = PROCESS_MS): Promise<number> {
  if (child.exitCode !== null) return child.exitCode;
  if (child.signalCode !== null) throw new Error("Child terminated by signal");
  return await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error("Child operation timed out")), timeout);
    const onError = () => finish(new Error("Child spawn failed"));
    const onClose = (code: number | null) => code === null ? finish(new Error("Child terminated by signal")) : finish(undefined, code);
    function finish(error?: Error, code = 1): void {
      clearTimeout(timer);
      child.off("error", onError);
      child.off("close", onClose);
      if (error) reject(error); else resolve(code);
    }
    child.once("error", onError);
    child.once("close", onClose);
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
  const child = spawnOwned(command, args, options);
  let stdout = "";
  child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
  child.stderr.resume();
  child.stdin.end(options.input);
  try {
    const code = await waitExit(child, options.timeout ?? PROCESS_MS);
    if (code !== 0) throw new Error(`${command} failed (exit ${code})`);
    return stdout.trim();
  } finally { await cleanupChild(child); }
}
