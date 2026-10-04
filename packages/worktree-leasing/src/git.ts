import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { constants } from "node:fs";

import { WorktreeLeasingError, type GitWorktreeResult } from "./types.js";

function execGit(
  cwd: string,
  args: readonly string[],
  allowFailure = false,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      [...args],
      {
        cwd,
        encoding: "utf8",
        maxBuffer: 10 * 1024 * 1024,
        timeout: 30_000,
        killSignal: "SIGKILL",
      },
      (error, stdout, stderr) => {
        if (error !== null) {
          const exitCode =
            typeof (error as NodeJS.ErrnoException & { code?: number }).code ===
            "number"
              ? ((error as NodeJS.ErrnoException & { code: number }).code ?? 1)
              : 1;
          if (allowFailure && !("killed" in error && error.killed)) {
            resolve({
              stdout,
              stderr,
              exitCode,
            });
            return;
          }
          reject(
            new WorktreeLeasingError(
              "git_command_failed",
              `git ${args.join(" ")} failed in ${cwd}.`,
              {
                cwd,
                command: args.join(" "),
                exitCode,
              },
            ),
          );
          return;
        }

        resolve({
          stdout,
          stderr,
          exitCode: 0,
        });
      },
    );
  });
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}

async function branchExists(
  repoRoot: string,
  branchName: string,
): Promise<boolean> {
  const result = await execGit(
    repoRoot,
    ["show-ref", "--verify", "--quiet", `refs/heads/${branchName}`],
    true,
  );

  return result.exitCode === 0;
}

export async function readGitHead(path: string): Promise<string> {
  const result = await execGit(path, ["rev-parse", "HEAD"]);
  return result.stdout.trim();
}

export async function readGitBranch(path: string): Promise<string> {
  const result = await execGit(path, ["rev-parse", "--abbrev-ref", "HEAD"]);
  return result.stdout.trim();
}

export async function inspectWorktreeDirtyState(
  worktreePath: string,
): Promise<"clean" | "dirty" | "unknown"> {
  const result = await execGit(
    worktreePath,
    ["status", "--short"],
    true,
  );

  if (result.exitCode !== 0) {
    return "unknown";
  }

  return result.stdout.trim().length === 0 ? "clean" : "dirty";
}

export async function ensureGitWorktree(options: {
  readonly repoRoot: string;
  readonly targetPath: string;
  readonly branchName: string;
  readonly baseRef?: string;
  readonly allowReuseExisting?: boolean;
}): Promise<GitWorktreeResult> {
  const alreadyExists = await pathExists(options.targetPath);
  if (alreadyExists) {
    if (options.allowReuseExisting !== true) {
      throw new WorktreeLeasingError(
        "worktree_path_exists",
        `Worktree path ${options.targetPath} already exists.`,
        {
          path: options.targetPath,
          branchName: options.branchName,
        },
      );
    }

    const branchName = await readGitBranch(options.targetPath);
    if (branchName !== options.branchName) {
      throw new WorktreeLeasingError(
        "worktree_branch_mismatch",
        `Existing worktree at ${options.targetPath} is on ${branchName}.`,
        {
          path: options.targetPath,
          branchName,
        },
      );
    }

    return {
      path: options.targetPath,
      branchName,
      head: await readGitHead(options.targetPath),
      reused: true,
    };
  }

  const args = (await branchExists(options.repoRoot, options.branchName))
    ? ["worktree", "add", options.targetPath, options.branchName]
    : [
        "worktree",
        "add",
        "-b",
        options.branchName,
        options.targetPath,
        options.baseRef ?? "HEAD",
      ];
  await execGit(options.repoRoot, args);

  return {
    path: options.targetPath,
    branchName: await readGitBranch(options.targetPath),
    head: await readGitHead(options.targetPath),
    reused: false,
  };
}

export async function removeGitWorktree(
  repoRoot: string,
  worktreePath: string,
): Promise<void> {
  await execGit(repoRoot, ["worktree", "remove", worktreePath]);
}

export async function readGitWorktreeRegistration(repoRoot: string, path: string): Promise<{ path: string; branchName?: string } | undefined> {
  const result = await execGit(repoRoot, ["worktree", "list", "--porcelain", "-z"]);
  for (const block of result.stdout.split("\0\0")) {
    const fields = block.split("\0");
    const registeredPath = fields.find((field) => field.startsWith("worktree "))?.slice(9);
    if (registeredPath === path) return { path, branchName: fields.find((field) => field.startsWith("branch refs/heads/"))?.slice(18) };
  }
  return undefined;
}

export async function verifyGitWorktreeRepository(repoRoot: string, path: string): Promise<boolean> {
  const repo = await execGit(repoRoot, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  const worktree = await execGit(path, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  const top = await execGit(path, ["rev-parse", "--show-toplevel"]);
  return repo.stdout.trim() === worktree.stdout.trim() && top.stdout.trim() === path;
}

export async function readGitStatusEntries(
  worktreePath: string,
): Promise<string[]> {
  const result = await execGit(worktreePath, ["status", "--porcelain=v1"]);

  return result.stdout
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);
}

export async function readGitNumstat(
  worktreePath: string,
): Promise<string[]> {
  const result = await execGit(
    worktreePath,
    ["diff", "HEAD", "--numstat", "--relative"],
    true,
  );
  if (result.exitCode !== 0) {
    return [];
  }

  return result.stdout
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);
}
