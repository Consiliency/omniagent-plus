import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ensureGitWorktree,
  inspectWorktreeDirtyState,
  resolveMountedWorkspacePlacement,
} from "./index.js";

interface GitFixture {
  readonly projectName: string;
  readonly branchName: string;
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
  runGit(repoRoot, ["config", "user.name", "Worktree Test"]);
  runGit(repoRoot, ["config", "user.email", "worktree@example.com"]);
  await writeFile(join(repoRoot, "README.md"), "hello\n", "utf8");
  runGit(repoRoot, ["add", "README.md"]);
  runGit(repoRoot, ["commit", "-m", "init"]);
  return repoRoot;
}

function readFixture(): GitFixture {
  return JSON.parse(
    readFileSync(
      new URL("../../../fixtures/worktree/git/git-cases.json", import.meta.url),
      "utf8",
    ),
  ) as GitFixture;
}

describe("git worktree helpers", () => {
  it("creates a git worktree and reports dirty state", async () => {
    const fixture = readFixture();
    const rootDir = await mkdtemp(join(tmpdir(), "worktree-git-"));
    const repoRoot = await createRepo(rootDir);
    const placement = await resolveMountedWorkspacePlacement({
      projectName: fixture.projectName,
      branchName: fixture.branchName,
      repoRoot,
      fallbackRoot: join(rootDir, "worktrees"),
      workspaceMountExists: false,
    });

    const worktree = await ensureGitWorktree({
      repoRoot,
      targetPath: placement.path,
      branchName: fixture.branchName,
      baseRef: "HEAD",
    });

    expect(worktree.reused).toBe(false);
    expect(worktree.branchName).toBe(fixture.branchName);
    expect(await inspectWorktreeDirtyState(worktree.path)).toBe("clean");

    await writeFile(join(worktree.path, "README.md"), "hello\nworktree\n", "utf8");
    expect(await inspectWorktreeDirtyState(worktree.path)).toBe("dirty");
  });
});
