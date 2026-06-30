import { readFileSync } from "node:fs";
import { mkdtemp, mkdir, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { resolveMountedWorkspacePlacement } from "./index.js";

interface PlacementFixture {
  readonly mounted: {
    readonly projectName: string;
    readonly branchName: string;
  };
  readonly fallback: {
    readonly projectName: string;
    readonly branchName: string;
  };
}

function readFixture(): PlacementFixture {
  return JSON.parse(
    readFileSync(
      new URL("../../../fixtures/worktree/placement/placement-cases.json", import.meta.url),
      "utf8",
    ),
  ) as PlacementFixture;
}

describe("mounted workspace placement", () => {
  it("prefers /mnt/workspace/worktrees when the mount exists and falls back to repo-adjacent placement otherwise", async () => {
    const fixture = readFixture();
    const rootDir = await mkdtemp(join(tmpdir(), "worktree-placement-"));
    const repoRoot = join(rootDir, "repo", "omniagent-plus");
    const mountRoot = join(rootDir, "mnt-workspace");
    await mkdir(repoRoot, { recursive: true });
    await mkdir(join(mountRoot, "worktrees"), { recursive: true });

    const mounted = await resolveMountedWorkspacePlacement({
      ...fixture.mounted,
      repoRoot,
      workspaceMountRoot: mountRoot,
      workspaceMountExists: true,
    });
    const fallback = await resolveMountedWorkspacePlacement({
      ...fixture.fallback,
      repoRoot,
      workspaceMountRoot: join(rootDir, "missing-mount"),
      workspaceMountExists: false,
    });

    expect(mounted.path).toBe(
      join(mountRoot, "worktrees", "omniagent-plus-feature-worktree"),
    );
    expect(fallback.path).toBe(
      join(dirname(repoRoot), "omniagent-plus-feature-fallback"),
    );
  });

  it("rejects path traversal and symlink escape roots", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "worktree-placement-guard-"));
    const repoRoot = join(rootDir, "repo", "omniagent-plus");
    const actualMountRoot = join(rootDir, "actual-mount");
    const symlinkMountRoot = join(rootDir, "symlink-mount");
    await mkdir(repoRoot, { recursive: true });
    await mkdir(join(actualMountRoot, "worktrees"), { recursive: true });
    await symlink(actualMountRoot, symlinkMountRoot);

    await expect(
      resolveMountedWorkspacePlacement({
        projectName: "../escape",
        branchName: "feature/worktree",
        repoRoot,
        workspaceMountRoot: actualMountRoot,
        workspaceMountExists: true,
      }),
    ).rejects.toMatchObject({
      code: "invalid_project_name",
    });
    await expect(
      resolveMountedWorkspacePlacement({
        projectName: "omniagent-plus",
        branchName: "feature/worktree",
        repoRoot,
        workspaceMountRoot: symlinkMountRoot,
        workspaceMountExists: true,
      }),
    ).rejects.toMatchObject({
      code: "symlink_escape_rejected",
    });
  });
});
