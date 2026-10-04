import { normalizeCliError } from "./errors.js";
import {
  createErrorEnvelope,
  createSuccessEnvelope,
  serializeEnvelope,
  type CliEnvelope,
} from "./output.js";
import {
  parseCliArgs,
  type ParsedCliRequest,
} from "./args.js";
import type {
  CliCommandInfo,
  CliCommandKey,
  CliCommandResult,
  CliContext,
} from "./types.js";

export interface CliCommandRegistration {
  readonly key: CliCommandKey;
  readonly description: string;
  handle(
    request: ParsedCliRequest,
    context: CliContext,
  ): Promise<CliCommandResult>;
}

export interface ExecuteCliResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly envelope: CliEnvelope;
}

function fallbackStateRoot(cwd: string, argv: readonly string[]): string {
  try {
    const index = argv.indexOf("--state-root");
    const supplied = index >= 0 ? argv[index + 1] : argv.find((token) => token.startsWith("--state-root="))?.slice("--state-root=".length);
    const request = parseCliArgs(supplied === undefined ? ["health"] : ["health", "--state-root", supplied], cwd);
    return request.stateRoot;
  } catch {
    return cwd;
  }
}

export async function executeCli(
  argv: string[],
  registry: readonly CliCommandRegistration[],
  options: {
    readonly cwd?: string;
    readonly hostEnv?: Readonly<Record<string, string | undefined>>;
  } = {},
): Promise<ExecuteCliResult> {
  const cwd = options.cwd ?? process.cwd();
  let command = "unknown";
  let stateRoot = fallbackStateRoot(cwd, argv);

  try {
    const known = registry.map((entry) => entry.key).sort((a, b) => b.length - a.length).find((key) => {
      const parts = key.split(" ");
      return argv.some((token, index) => token === parts[0] && parts.every((part, offset) => argv[index + offset] === part));
    });
    if (known !== undefined) command = known;
    const request = parseCliArgs(argv, cwd);
    command = request.command;
    stateRoot = request.stateRoot;

    const handler = registry.find((entry) => entry.key === request.command);
    if (handler === undefined) {
      throw new Error(`No handler registered for ${request.command}.`);
    }

    const availableCommands: CliCommandInfo[] = registry.map((entry) => ({
      key: entry.key,
      description: entry.description,
    }));
    const context: CliContext = {
      repoRoot: request.repoRoot,
      stateRoot: request.stateRoot,
      profilesDir: request.profilesDir,
      availableCommands,
      hostEnv: options.hostEnv,
    };
    const result = await handler.handle(request, context);
    const envelope = createSuccessEnvelope(request.command, request.stateRoot, result);
    return {
      exitCode: 0,
      stdout: serializeEnvelope(envelope, request.json),
      stderr: "",
      envelope,
    };
  } catch (error) {
    const normalized = normalizeCliError(error);
    const envelope = createErrorEnvelope(command, stateRoot, normalized);
    return {
      exitCode: normalized.code,
      stdout: "",
      stderr: serializeEnvelope(envelope, argv.includes("--json")),
      envelope,
    };
  }
}

export async function runCli(
  argv: string[],
  registry: readonly CliCommandRegistration[],
  options: {
    readonly cwd?: string;
    readonly stdout?: NodeJS.WriteStream;
    readonly stderr?: NodeJS.WriteStream;
  } = {},
): Promise<number> {
  const result = await executeCli(argv, registry, {
    cwd: options.cwd,
  });

  if (result.stdout.length > 0) {
    (options.stdout ?? process.stdout).write(result.stdout);
  }
  if (result.stderr.length > 0) {
    (options.stderr ?? process.stderr).write(result.stderr);
  }

  return result.exitCode;
}
