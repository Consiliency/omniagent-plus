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
      },
      (error, stdout, stderr) => {
        if (error !== null) {
          const exitCode =
            typeof (error as NodeJS.ErrnoException & { code?: number }).code ===
            "number"
              ? ((error as NodeJS.ErrnoException & { code: number }).code ?? 1)
              : 1;
          if (allowFailure) {
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
                stderr: stderr.trim().slice(0, 200),
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
  } catch {
    return false;
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
    ["diff", "--numstat", "--relative"],
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
