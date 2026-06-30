import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ensureGitWorktree,
  resolveMountedWorkspacePlacement,
  summarizeWorktreeDiff,
} from "./index.js";

interface DiffFixture {
  readonly maxPaths: number;
}

function runGit(cwd: string, args: readonly string[]): void {
  const result = spawnSync("git", [...args], {
    cwd,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `git ${args.join(" ")} failed`);
  }
}

async function createRepo(rootDir: string): Promise<string> {
  const repoRoot = join(rootDir, "repo");
  await mkdir(repoRoot, { recursive: true });
  runGit(repoRoot, ["init", "--initial-branch=main"]);
  runGit(repoRoot, ["config", "user.name", "Diff Test"]);
  runGit(repoRoot, ["config", "user.email", "diff@example.com"]);
  await writeFile(join(repoRoot, "README.md"), "hello\n", "utf8");
  await writeFile(join(repoRoot, "a.txt"), "a\n", "utf8");
  await writeFile(join(repoRoot, "b.txt"), "b\n", "utf8");
  runGit(repoRoot, ["add", "README.md", "a.txt", "b.txt"]);
  runGit(repoRoot, ["commit", "-m", "init"]);
  return repoRoot;
}

function readFixture(): DiffFixture {
  return JSON.parse(
    readFileSync(
      new URL("../../../fixtures/worktree/diff/diff-cases.json", import.meta.url),
      "utf8",
    ),
  ) as DiffFixture;
}

describe("diff summary", () => {
  it("returns bounded metadata-only diff summaries", async () => {
    const fixture = readFixture();
    const rootDir = await mkdtemp(join(tmpdir(), "worktree-diff-"));
    const repoRoot = await createRepo(rootDir);
    const placement = await resolveMountedWorkspacePlacement({
      projectName: "omniagent-plus",
      branchName: "feature/diff",
      repoRoot,
      fallbackRoot: join(rootDir, "worktrees"),
      workspaceMountExists: false,
    });
    const worktree = await ensureGitWorktree({
      repoRoot,
      targetPath: placement.path,
      branchName: "feature/diff",
      baseRef: "HEAD",
    });

    await writeFile(join(worktree.path, "README.md"), "hello\nchanged\n", "utf8");
    await writeFile(join(worktree.path, "a.txt"), "a\nchanged\n", "utf8");
    await writeFile(join(worktree.path, "b.txt"), "b\nchanged\n", "utf8");

    const summary = await summarizeWorktreeDiff({
      worktreePath: worktree.path,
      maxPaths: fixture.maxPaths,
    });

    expect(summary.dirtyState).toBe("dirty");
    expect(summary.fileCount).toBe(3);
    expect(summary.changedPaths).toHaveLength(2);
    expect(summary.truncated).toBe(true);
    expect(summary.changedPaths.some((entry) => entry.includes("@@"))).toBe(false);
  });
});
