import type { OmnigentProcessSignal } from "./types.js";

export interface ManagedOmnigentProcess {
  readonly command: readonly string[];
  readonly pid: number;
  readonly processGroupId: number;
}

export interface OmnigentProcessManagerOptions {
  readonly heartbeatTimeoutMs?: number;
  readonly isParentAlive?: (pid: number) => boolean;
  readonly kill?: (
    processGroupId: number,
    signal: OmnigentProcessSignal,
  ) => Promise<void> | void;
  readonly now?: () => number;
  readonly parentPid?: number;
  readonly spawn: (
    command: readonly string[],
  ) => Promise<ManagedOmnigentProcess> | ManagedOmnigentProcess;
}

export interface OmnigentManagedProcessStatus {
  readonly lastHeartbeatAt?: string;
  readonly parentAlive: boolean;
  readonly pid?: number;
  readonly processGroupId?: number;
  readonly running: boolean;
  readonly startedAt?: string;
  readonly timedOut: boolean;
}

interface ManagedProcessRecord {
  process: ManagedOmnigentProcess;
  startedAtMs: number;
  lastHeartbeatAtMs: number;
}

function toIso(ms?: number): string | undefined {
  return ms === undefined ? undefined : new Date(ms).toISOString();
}

export class OmnigentProcessManager {
  private readonly heartbeatTimeoutMs: number;
  private readonly isParentAlive: (pid: number) => boolean;
  private readonly kill: (
    processGroupId: number,
    signal: OmnigentProcessSignal,
  ) => Promise<void> | void;
  private readonly now: () => number;
  private readonly parentPid?: number;
  private readonly spawn: (
    command: readonly string[],
  ) => Promise<ManagedOmnigentProcess> | ManagedOmnigentProcess;

  private current?: ManagedProcessRecord;

  constructor(options: OmnigentProcessManagerOptions) {
    this.heartbeatTimeoutMs = options.heartbeatTimeoutMs ?? 30_000;
    this.isParentAlive = options.isParentAlive ?? (() => true);
    this.kill = options.kill ?? (() => undefined);
    this.now = options.now ?? Date.now;
    this.parentPid = options.parentPid;
    this.spawn = options.spawn;
  }

  async ensureRunning(
    command: readonly string[],
  ): Promise<ManagedOmnigentProcess> {
    if (this.current) {
      return this.current.process;
    }

    const process = await this.spawn(command);
    const now = this.now();
    this.current = {
      lastHeartbeatAtMs: now,
      process,
      startedAtMs: now,
    };
    return process;
  }

  heartbeat(): void {
    if (!this.current) {
      return;
    }
    this.current.lastHeartbeatAtMs = this.now();
  }

  status(): OmnigentManagedProcessStatus {
    const now = this.now();
    const parentAlive =
      this.parentPid === undefined ? true : this.isParentAlive(this.parentPid);
    const timedOut =
      this.current === undefined
        ? false
        : now - this.current.lastHeartbeatAtMs > this.heartbeatTimeoutMs;

    return {
      lastHeartbeatAt: toIso(this.current?.lastHeartbeatAtMs),
      parentAlive,
      pid: this.current?.process.pid,
      processGroupId: this.current?.process.processGroupId,
      running: this.current !== undefined,
      startedAt: toIso(this.current?.startedAtMs),
      timedOut,
    };
  }

  async stop(signal: OmnigentProcessSignal = "SIGTERM"): Promise<void> {
    if (!this.current) {
      return;
    }

    await this.kill(this.current.process.processGroupId, signal);
    this.current = undefined;
  }

  async enforceParentDeathCleanup(): Promise<boolean> {
    if (!this.current || this.parentPid === undefined) {
      return false;
    }

    if (this.isParentAlive(this.parentPid)) {
      return false;
    }

    await this.stop("SIGTERM");
    return true;
  }

  async enforceTimeoutCleanup(): Promise<boolean> {
    if (!this.current) {
      return false;
    }

    if (this.now() - this.current.lastHeartbeatAtMs <= this.heartbeatTimeoutMs) {
      return false;
    }

    await this.stop("SIGTERM");
    return true;
  }
}
