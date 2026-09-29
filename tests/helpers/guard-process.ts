import { spawn } from "node:child_process";
import type { ChildProcessWithoutNullStreams, SpawnOptionsWithoutStdio } from "node:child_process";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { closeSync, constants, existsSync, openSync, readFileSync, writeSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Readable, Writable } from "node:stream";

export const PROCESS_MS = 15_000;
export const NESTED_FIXTURE_SHUTDOWN_MS = 112_500;
const TAIL_MS = 2_500;
const CLEANUP_SLOT_MS = 17_500;
const JOB_MS = 20 * 60_000;
const JOB_FINAL_MS = 30_000;
const ROOT_CLEANUP_MS = 55_000;
export function jobBudgetMs(started = process.env.GUARD_JOB_STARTED_MS, now = Date.now(), cleanup = false): number | undefined {
  if (started === undefined) {
    if (process.env.GITHUB_ACTIONS === "true") throw new Error("GUARD hosted job clock missing");
    return undefined;
  }
  if (!/^\d{13}$/.test(started) || Number(started) > now || now - Number(started) >= JOB_MS) throw new Error("GUARD hosted job clock invalid or expired");
  return Number(started) + JOB_MS - now - JOB_FINAL_MS - (cleanup ? 0 : ROOT_CLEANUP_MS);
}
export function cleanEnvironment(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = {};
  for (const key of ["PATH", "HOME", "TMPDIR", "TEMP", "SystemRoot", "LANG", "LC_ALL", "CI", "PNPM_HOME", "XDG_CACHE_HOME", "GUARD_CUSTODY_RUN_DIR", "GUARD_CUSTODY_STAGE", "GUARD_JOB_STARTED_MS"]) {
    if (source[key] !== undefined) result[key] = source[key];
  }
  return result;
}

type LauncherBudget = { cleanupSlots: number; maxChildReservationMs: number };
type AdmittedBudget = LauncherBudget & { operationNs: bigint; completionNs: bigint; ceilingNs: bigint };
type OwnedOptions = SpawnOptionsWithoutStdio & { timeout?: number; input?: string; custodyControlId?: string; shutdownReservationMs?: number; launcherBudget?: LauncherBudget };
function inheritedBudget(requestedSlots = 0, allowPastOperation = false, allowExhausted = false): AdmittedBudget | undefined {
  const keys = ["GUARD_ADMITTED_OPERATION_NS", "GUARD_ADMITTED_COMPLETION_NS", "GUARD_ADMITTED_CLEANUP_SLOTS", "GUARD_ADMITTED_CHILD_RESERVATION_MS"] as const;
  const values = keys.map((key) => process.env[key]);
  if (values.every((value) => value === undefined)) return undefined;
  if (values.some((value) => value === undefined || !/^\d+$/.test(value))) throw new Error("Invalid GUARD inherited reservation");
  const [operationNs, completionNs, slots, childMs] = values as [string, string, string, string];
  const epochPath = process.env.GUARD_ADMITTED_EPOCH_FILE;
  if (!epochPath) throw new Error("GUARD inherited cancellation epoch missing");
  const epoch = readFileSync(epochPath, "ascii");
  if (!/^\d{20}$/.test(epoch)) throw new Error("GUARD inherited cancellation epoch invalid");
  const admitted = { operationNs: BigInt(operationNs), completionNs: BigInt(completionNs), ceilingNs: BigInt(epoch), cleanupSlots: Number(slots), maxChildReservationMs: Number(childMs) };
  const now = process.hrtime.bigint();
  if (!Number.isSafeInteger(admitted.cleanupSlots) || !Number.isSafeInteger(admitted.maxChildReservationMs) || admitted.cleanupSlots < 0 || admitted.maxChildReservationMs < 0 || requestedSlots > admitted.cleanupSlots || !allowPastOperation && admitted.operationNs <= now || admitted.completionNs !== admitted.operationNs + BigInt(TAIL_MS + admitted.cleanupSlots * CLEANUP_SLOT_MS + admitted.maxChildReservationMs) * 1_000_000n || admitted.ceilingNs > admitted.completionNs || !allowExhausted && admitted.ceilingNs < now + BigInt(TAIL_MS + requestedSlots * CLEANUP_SLOT_MS) * 1_000_000n) throw new Error("GUARD inherited cleanup reservation exhausted");
  return admitted;
}
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
  admissionJournaled: boolean;
  terminalWritten: boolean;
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
  runDir?: string;
  stage: string;
  supervisorStart: string | null;
  shutdownReservationMs: number;
  budgetSlots: number;
  budgetChildMs: number;
  cooperativeDeadline?: bigint;
  shutdownDeadline?: bigint;
};
const owned = new Map<number, OwnedChild>();
const context = new AsyncLocalStorage<ProcessScope | undefined>();
const custodyContext = new AsyncLocalStorage<{ runDir: string; stage: string }>();
const cleanupContext = new AsyncLocalStorage<{ deadline: bigint; remainingSlots: number }>();
const controlCases = new Set(["hung-child", "normal-orphan", "immediate-orphan"]);
const supervisorPath = fileURLToPath(new URL("./guard-supervisor.py", import.meta.url));
const elapsedMs = (started: bigint) => Number((process.hrtime.bigint() - started) / 1_000_000n);

export function withCustodyContext<T>(runDir: string, stage: string, operation: () => T): T {
  return custodyContext.run({ runDir, stage }, operation);
}

export function validateCustodyJournal(runDir: string): { admitted: number; natural: number; signaled: number } {
  const path = `${runDir}/custody.jsonl`;
  if (!existsSync(path)) return { admitted: 0, natural: 0, signaled: 0 };
  const admissions = new Map<string, Record<string, unknown>>();
  let natural = 0;
  let signaled = 0;
  for (const line of readFileSync(path, "utf8").trim().split("\n")) {
    const row = JSON.parse(line) as Record<string, unknown>;
    const id = row.command_id;
    if (typeof id !== "string") throw new Error("GUARD custody journal ID invalid");
    if (row.event === "admission") {
      if (typeof row.stage !== "string" || !row.stage || !Number.isSafeInteger(row.supervisor_pid) || Number(row.supervisor_pid) <= 0 || typeof row.supervisor_start_identity !== "string" || !row.supervisor_start_identity || row.control_case_id !== null && !controlCases.has(String(row.control_case_id))) throw new Error("GUARD custody admission identity invalid");
      if (admissions.has(id)) throw new Error("GUARD duplicate custody admission");
      admissions.set(id, { ...row, terminal: false });
    } else if (row.event === "terminal") {
      const first = admissions.get(id);
      if (!first || first.terminal || first.stage !== row.stage || first.supervisor_pid !== row.supervisor_pid || first.supervisor_start_identity !== row.supervisor_start_identity || first.control_case_id !== row.control_case_id) throw new Error("GUARD custody journal terminal mismatch");
      first.terminal = true;
      const counts = [row.adopted_count, row.adopted_natural_count, row.adopted_signaled_count, row.adopted_unresolved_count, row.force_killed_count];
      if (counts.some((count) => !Number.isSafeInteger(count) || Number(count) < 0) || row.adopted_count !== Number(row.adopted_natural_count) + Number(row.adopted_signaled_count) + Number(row.adopted_unresolved_count)) throw new Error("GUARD custody journal counts invalid");
      if (row.custody !== "quiescent" || Number(row.adopted_unresolved_count) !== 0) throw new Error("GUARD custody journal unproven");
      if (Number(row.adopted_signaled_count) > 0 && !controlCases.has(String(row.control_case_id))) throw new Error("GUARD unexpected signaled rescue");
      natural += Number(row.adopted_natural_count);
      signaled += Number(row.adopted_signaled_count);
    } else throw new Error("GUARD custody journal event invalid");
  }
  if ([...admissions.values()].some((row) => row.terminal !== true)) throw new Error("GUARD custody journal admission missing terminal");
  return { admitted: admissions.size, natural, signaled };
}

function journal(record: OwnedChild, event: "admission" | "terminal", result?: CustodyResult): void {
  const dir = record.runDir;
  if (!dir) return;
  const row = { event, command_id: record.id, stage: record.stage, supervisor_pid: record.child.pid, supervisor_start_identity: record.supervisorStart, control_case_id: record.options.custodyControlId ?? null, ...(result ? { custody: result.custody, proof_error: result.error, adopted_count: result.adopted_count, adopted_natural_count: result.adopted_natural_count, adopted_signaled_count: result.adopted_signaled_count, adopted_unresolved_count: result.adopted_unresolved_count, force_killed_count: result.force_killed_count } : {}) };
  const data = Buffer.from(`${JSON.stringify(row)}\n`);
  const fd = openSync(`${dir}/custody.jsonl`, constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT, 0o600);
  try {
    if (writeSync(fd, data) !== data.length) throw new Error("GUARD custody journal partial append");
  } finally { closeSync(fd); }
}

function unprovenResult(result?: CustodyResult, error?: Error): CustodyResult {
  return { payload_pid: result?.payload_pid ?? null, outcome: result?.outcome ?? {}, custody: "unproven", error: result?.error ?? error?.message ?? "proof_failed", adopted_count: result?.adopted_count ?? 0, adopted_natural_count: result?.adopted_natural_count ?? 0, adopted_signaled_count: result?.adopted_signaled_count ?? 0, adopted_unresolved_count: result?.adopted_unresolved_count ?? 0, force_killed_count: result?.force_killed_count ?? 0 };
}

function terminal(record: OwnedChild, result?: CustodyResult): void {
  if (!record.admissionJournaled || record.terminalWritten) return;
  journal(record, "terminal", result);
  record.terminalWritten = true;
}

function send(record: OwnedChild, kind: string, fields: Record<string, unknown> = {}): void {
  const data = `${JSON.stringify({ v: 1, nonce: record.nonce, seq: record.outputSeq++, type: kind, ...fields })}\n`;
  if (Buffer.byteLength(data) > 65_536 || !record.control.writable) throw new Error("GUARD control channel unavailable");
  record.control.write(data);
}

function requestShutdown(record: OwnedChild): void {
  if (record.closed || record.shutdownDeadline) return;
  if (!record.admitted) { record.control.end(); return; }
  const now = process.hrtime.bigint();
  const completion = record.started + BigInt(record.timeout + record.shutdownReservationMs) * 1_000_000n;
  const cooperativeEnd = record.cooperativeDeadline === undefined ? completion : record.cooperativeDeadline + 2_500_000_000n;
  record.shutdownDeadline = [now + 2_500_000_000n, cooperativeEnd, completion].reduce((earliest, value) => value < earliest ? value : earliest);
  send(record, "SHUTDOWN", { epoch: 1, mode: "forced", deadline_ns: String(record.shutdownDeadline) });
}

function finish(record: OwnedChild): void {
  if (record.closed) return;
  record.closed = true;
  let error = record.fault;
  const result = record.result;
  if (record.buffer.length) error = new Error("GUARD status frame truncated");
  if (!error && (!record.admitted || !record.workDrained || !result)) error = new Error("GUARD custody result missing");
  if (!error && result) {
    if (result.custody !== "quiescent" || result.error && !["payload_spawn_failed", "operation_deadline"].includes(result.error) || result.adopted_unresolved_count !== 0) error = new Error("GUARD custody unproven");
    else if (result.adopted_count !== result.adopted_natural_count + result.adopted_signaled_count) error = new Error("GUARD custody counts invalid");
    else if (result.outcome.signal ? record.child.signalCode !== result.outcome.signal : record.child.exitCode !== result.outcome.exit_code) error = new Error("GUARD supervisor/payload exit mismatch");
  }
  if (record.admissionJournaled) {
    try { terminal(record, error ? unprovenResult(result, error) : result); }
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
    if (frame.type === "READY" && record.inputSeq === 1 && !record.admitted) {
      const capabilities = frame.capabilities as Record<string, unknown> | undefined;
      if (!capabilities || Object.values(capabilities).length !== 4 || Object.values(capabilities).some((value) => value !== true)) { record.fault = new Error("GUARD custody capability refused"); record.control.end(); return; }
      if (record.options.signal?.aborted || record.scope?.controller.signal.aborted || elapsedMs(record.started) >= record.timeout) { record.fault = new Error("GUARD admission cancelled"); record.control.end(); return; }
      if (!record.supervisorStart) { record.fault = new Error("GUARD supervisor identity unproven"); record.control.end(); return; }
      const env = Object.fromEntries(Object.entries(record.options.env ?? cleanEnvironment()).filter((entry): entry is [string, string] => entry[1] !== undefined));
      if (record.runDir) { env.GUARD_CUSTODY_RUN_DIR = record.runDir; env.GUARD_CUSTODY_STAGE = record.stage; }
      const cwd = record.options.cwd instanceof URL ? fileURLToPath(record.options.cwd) : record.options.cwd ?? process.cwd();
      try {
        journal(record, "admission");
        record.admissionJournaled = true;
        for (const key of Object.keys(env)) if (key.startsWith("GUARD_ADMITTED_")) delete env[key];
        send(record, "ADMIT", { command: record.command, argv: record.args, cwd, env, umask: process.umask(), stdio: { stdin: 0, stdout: 1, stderr: 2 }, deadline_ns: String(record.started + BigInt(record.timeout) * 1_000_000n), shutdown_reservation_ns: String(BigInt(record.shutdownReservationMs) * 1_000_000n), shutdown_completion_ns: String(record.started + BigInt(record.timeout + record.shutdownReservationMs) * 1_000_000n), cleanup_slots: record.budgetSlots, child_reservation_ns: String(BigInt(record.budgetChildMs) * 1_000_000n) });
        record.admitted = true;
      } catch { record.fault = new Error("GUARD admission failed"); record.control.end(); }
    } else if (frame.type === "WORK_DRAINED" && record.admitted && !record.workDrained && !record.result && typeof frame.quiescent === "boolean") {
      record.workDrained = frame.quiescent;
      if (!frame.quiescent) record.fault = new Error("GUARD work drain unproven");
    } else if (frame.type === "RESULT" && record.admitted && !record.result && (record.workDrained || record.fault?.message === "GUARD work drain unproven")) {
      const result = frame as unknown as CustodyResult;
      const counts = [result.adopted_count, result.adopted_natural_count, result.adopted_signaled_count, result.adopted_unresolved_count, result.force_killed_count];
      if ((result.custody !== "quiescent" && result.custody !== "unproven") || counts.some((count) => !Number.isSafeInteger(count) || count < 0) || result.adopted_count !== result.adopted_natural_count + result.adopted_signaled_count + result.adopted_unresolved_count || typeof result.outcome !== "object" || result.outcome === null) { record.fault = new Error("GUARD custody result invalid"); record.control.end(); return; }
      record.result = result;
    } else { record.fault = new Error("GUARD status frame out of order"); record.control.end(); return; }
  }
}

export class ProcessScope {
  readonly controller = new AbortController();
  readonly children = new Set<ChildProcessWithoutNullStreams>();
  private readonly cleanupSlots: number;
  private readonly cleanups = new Set<() => Promise<void>>();
  private closing?: Promise<void>;
  private cooperativeSignal?: NodeJS.Signals;
  private readonly interrupt = () => {
    this.cooperativeSignal = this.cooperativeSignal ?? "SIGTERM";
    this.controller.abort();
    this.close().catch(() => { process.exitCode = 1; });
  };
  constructor(cleanupSlots = 0) {
    if (!Number.isSafeInteger(cleanupSlots) || cleanupSlots < 0) throw new Error("Invalid GUARD cleanup reservation");
    this.cleanupSlots = cleanupSlots;
    inheritedBudget(cleanupSlots);
    process.on("SIGINT", this.onInterrupt);
    process.on("SIGTERM", this.onTerminate);
  }
  private readonly onInterrupt = () => { this.cooperativeSignal = this.cooperativeSignal ?? "SIGINT"; this.interrupt(); };
  private readonly onTerminate = () => { this.cooperativeSignal = this.cooperativeSignal ?? "SIGTERM"; this.interrupt(); };
  run<T>(operation: () => T): T { return context.run(this, operation); }
  get cleanupReservationSlots(): number { return this.cleanupSlots; }
  check(): void { if (this.controller.signal.aborted || this.closing) throw new Error("GUARD operation interrupted/closed"); }
  get cooperativeClosing(): boolean { return this.cooperativeSignal !== undefined; }
  addCleanup(cleanup: () => Promise<void>): void {
    if (this.closing || this.cleanups.size >= this.cleanupSlots) throw new Error("GUARD cleanup reservation exhausted");
    this.cleanups.add(cleanup);
  }
  close(): Promise<void> {
    return this.closing ??= Promise.resolve().then(() => this.finish());
  }
  private async finish(): Promise<void> {
    this.controller.abort();
    const children = [...this.children];
    const childReservation = Math.max(0, ...children.map((child) => child.pid === undefined ? 2_500 : owned.get(child.pid)?.shutdownReservationMs ?? 2_500));
    const requested = process.hrtime.bigint() + BigInt(TAIL_MS + childReservation + this.cleanupSlots * CLEANUP_SLOT_MS) * 1_000_000n;
    const ceiling = inheritedBudget(this.cleanupSlots, true, true)?.ceilingNs;
    const cleanup = { deadline: ceiling && ceiling < requested ? ceiling : requested, remainingSlots: this.cleanupSlots };
    try {
      if (this.cooperativeSignal) for (const child of children) if (child.pid !== undefined && (owned.get(child.pid)?.shutdownReservationMs ?? 2_500) > 2_500) signalOwned(child.pid, this.cooperativeSignal);
      const results = await Promise.allSettled(children.map((child) => this.cooperativeSignal && child.pid !== undefined && (owned.get(child.pid)?.shutdownReservationMs ?? 2_500) > 2_500 ? waitForCooperativeChild(child) : cleanupChild(child)));
      // Resource cleanup must be allowed to launch bounded commands after cancellation.
      const resources = await context.run(undefined, () => cleanupContext.run(cleanup, async () => {
        const outcomes: PromiseSettledResult<void>[] = [];
        for (const callback of this.cleanups) {
          const remaining = Number((cleanup.deadline - process.hrtime.bigint()) / 1_000_000n);
          if (remaining <= 0) throw new Error("GUARD resource cleanup reservation exhausted");
          let timer: ReturnType<typeof setTimeout> | undefined;
          try { outcomes.push(...await Promise.allSettled([Promise.race([Promise.resolve().then(callback), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("GUARD resource cleanup deadline")), remaining); })])])); }
          finally { clearTimeout(timer); }
        }
        return outcomes;
      }));
      const failed = [...results, ...resources].find((result) => result.status === "rejected");
      if (failed?.status === "rejected") throw failed.reason;
    } finally {
      process.off("SIGINT", this.onInterrupt);
      process.off("SIGTERM", this.onTerminate);
    }
  }
}
async function waitForCooperativeChild(child: ChildProcessWithoutNullStreams): Promise<void> {
  const record = child.pid === undefined ? undefined : owned.get(child.pid);
  if (!record) throw new Error("GUARD cooperative child missing");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const end = record.cooperativeDeadline === undefined ? process.hrtime.bigint() : record.cooperativeDeadline + 2_500_000_000n;
    const remaining = Math.max(0, Number((end - process.hrtime.bigint()) / 1_000_000n));
    await Promise.race([record.finished, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("GUARD cooperative shutdown deadline")), remaining); })]);
    owned.delete(child.pid!);
  } catch (error) {
    await cleanupChild(child);
    throw error;
  } finally { clearTimeout(timer); }
}
export function currentProcessScope(): ProcessScope | undefined { return context.getStore(); }
export function outsideProcessScope<T>(operation: () => T): T { return context.run(undefined, operation); }

export function signalOwned(pid: number, signal: NodeJS.Signals): void {
  const record = owned.get(pid);
  if (!record || pid === process.pid) throw new Error("Unowned process group");
  if (!["SIGINT", "SIGTERM", "SIGHUP"].includes(signal)) throw new Error("Unsupported GUARD forward signal");
  if (!record.admitted) { record.control.end(); return; }
  if (record.closed) return;
  const now = process.hrtime.bigint();
  const completion = record.started + BigInt(record.timeout + record.shutdownReservationMs) * 1_000_000n;
  const forcedStart = now + BigInt(record.shutdownReservationMs - 2_500) * 1_000_000n;
  const latestStart = completion - 2_500_000_000n;
  record.cooperativeDeadline ??= forcedStart < latestStart ? forcedStart : latestStart;
  send(record, "FORWARD", { signal, deadline_ns: String(record.cooperativeDeadline) });
}

export function spawnOwned(command: string, args: string[], options: OwnedOptions = {}): ChildProcessWithoutNullStreams {
  const scope = currentProcessScope();
  scope?.check();
  if (process.platform !== "linux") throw new Error("GUARD Linux custody backend required");
  if (options.custodyControlId && !controlCases.has(options.custodyControlId)) throw new Error("Unknown GUARD custody control");
  const cleanup = cleanupContext.getStore();
  if (cleanup) {
    const inheritedCeiling = inheritedBudget(0, true, true)?.ceilingNs;
    const deadline = inheritedCeiling && inheritedCeiling < cleanup.deadline ? inheritedCeiling : cleanup.deadline;
    const remaining = Number((deadline - process.hrtime.bigint()) / 1_000_000n) - 2_500;
    if (cleanup.remainingSlots <= 0 || remaining <= 0) throw new Error("GUARD cleanup command reservation exhausted");
    cleanup.remainingSlots--;
    options = { ...options, timeout: Math.min(options.timeout ?? PROCESS_MS, remaining) };
  }
  const slots = options.launcherBudget?.cleanupSlots ?? 0;
  const childReservation = options.launcherBudget?.maxChildReservationMs ?? (options.shutdownReservationMs ?? TAIL_MS) - TAIL_MS;
  if (![slots, childReservation].every((value) => Number.isSafeInteger(value) && value >= 0)) throw new Error("Invalid GUARD shutdown reservation");
  const shutdownReservationMs = TAIL_MS + slots * CLEANUP_SLOT_MS + childReservation;
  if (!Number.isSafeInteger(shutdownReservationMs) || options.shutdownReservationMs !== undefined && options.shutdownReservationMs !== shutdownReservationMs) throw new Error("Invalid GUARD shutdown reservation");
  const custody = custodyContext.getStore();
  const runDir = custody?.runDir ?? process.env.GUARD_CUSTODY_RUN_DIR;
  const stage = custody?.stage ?? process.env.GUARD_CUSTODY_STAGE ?? "standalone";
  const started = process.hrtime.bigint();
  const requestedTimeout = options.timeout ?? PROCESS_MS;
  if (!Number.isSafeInteger(requestedTimeout) || requestedTimeout <= 0) throw new Error("Invalid GUARD operation timeout");
  const inherited = cleanup ? undefined : inheritedBudget(scope?.cleanupReservationSlots ?? 0);
  const operationEnd = inherited?.operationNs;
  const jobRemaining = jobBudgetMs(undefined, Date.now(), Boolean(cleanup));
  const timeout = Math.min(requestedTimeout, operationEnd === undefined ? requestedTimeout : Number((operationEnd - started) / 1_000_000n), jobRemaining === undefined ? requestedTimeout : jobRemaining - shutdownReservationMs);
  if (timeout <= 0 || inherited && (shutdownReservationMs > inherited.maxChildReservationMs || started + BigInt(timeout + shutdownReservationMs) * 1_000_000n > inherited.ceilingNs - BigInt(TAIL_MS + (scope?.cleanupReservationSlots ?? inherited.cleanupSlots) * CLEANUP_SLOT_MS) * 1_000_000n)) throw new Error("GUARD inherited child reservation exhausted");
  const nonce = randomUUID();
  const child = spawn("python3", ["-I", "-S", "-B", supervisorPath, nonce], { env: cleanEnvironment(), detached: true, stdio: ["pipe", "pipe", "pipe", "pipe", "pipe"] }) as ChildProcessWithoutNullStreams;
  if (child.pid !== undefined) {
    let resolve!: (result: CustodyResult) => void;
    let reject!: (error: Error) => void;
    const finished = new Promise<CustodyResult>((yes, no) => { resolve = yes; reject = no; });
    let supervisorStart: string | null = null;
    try { supervisorStart = readFileSync(`/proc/${child.pid}/stat`, "utf8").split(") ").at(-1)?.split(" ")[19] ?? null; } catch { /* Spawn errors are handled by the status channel. */ }
    const record: OwnedChild = { child, id: randomUUID(), nonce, command, args, control: child.stdio[3] as Writable, status: child.stdio[4] as Readable, buffer: "", inputSeq: 0, outputSeq: 0, admitted: false, admissionJournaled: false, terminalWritten: false, workDrained: false, closed: false, finished, resolve, reject, timeout, started, options, scope, runDir, stage, supervisorStart, shutdownReservationMs, budgetSlots: slots, budgetChildMs: childReservation };
    owned.set(child.pid, record);
    scope?.children.add(child);
    record.status.on("data", (chunk: Buffer) => handleStatus(record, chunk));
    record.status.on("error", () => { record.fault = new Error("GUARD status channel failed"); });
    record.control.on("error", () => { record.fault = new Error("GUARD control channel failed"); });
    child.on("error", () => { record.fault = new Error("GUARD supervisor spawn failed"); });
    child.once("close", () => finish(record));
    options.signal?.addEventListener("abort", () => {
      requestShutdown(record);
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
      requestShutdown(record);
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const remaining = record.shutdownDeadline === undefined ? 2_500 : Math.max(0, Number((record.shutdownDeadline - process.hrtime.bigint()) / 1_000_000n));
      await Promise.race([record.finished, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("GUARD custody deadline: supervisor retained")), remaining); })]);
      owned.delete(child.pid!);
    } catch (error) {
      terminal(record, unprovenResult(record.result));
      throw error;
    } finally { clearTimeout(timer); }
  })();
}

export async function waitExit(child: ChildProcessWithoutNullStreams, timeout = PROCESS_MS, signal?: AbortSignal): Promise<number> {
  if (signal?.aborted) throw new Error("Child operation interrupted");
  const record = child.pid === undefined ? undefined : owned.get(child.pid);
  if (!record) throw new Error("Child spawn failed");
  const remaining = Math.max(0, timeout - elapsedMs(record.started));
  const result = await new Promise<CustodyResult>((resolve, reject) => {
    const timer = setTimeout(() => { requestShutdown(record); reject(new Error("Child operation timed out")); }, remaining);
    const onAbort = () => { if (!record.scope?.cooperativeClosing) requestShutdown(record); reject(new Error("Child operation interrupted")); };
    signal?.addEventListener("abort", onAbort, { once: true });
    record.finished.then(resolve, reject).finally(() => { clearTimeout(timer); signal?.removeEventListener("abort", onAbort); });
  });
  if (result.error === "operation_deadline") throw new Error("Child operation timed out");
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
  let operationError: unknown;
  let cleanupError: unknown;
  try {
    const record = child.pid === undefined ? undefined : owned.get(child.pid);
    const code = await waitExit(child, record?.timeout ?? options.timeout ?? PROCESS_MS, signal);
    if (code !== 0) throw new Error(`${command} failed (exit ${code})`);
  } catch (error) {
    operationError = error;
  }
  if (!scope?.cooperativeClosing) try { await cleanupChild(child); } catch (error) { cleanupError = error; }
  const record = child.pid === undefined ? undefined : owned.get(child.pid);
  if (!scope?.cooperativeClosing && !owned.has(child.pid!)) scope?.children.delete(child);
  if (cleanupError && (!operationError || record?.admitted || !(operationError instanceof Error && /timed out|interrupted/.test(operationError.message)))) throw cleanupError;
  if (operationError) throw operationError;
  return stdout.trim();
}
