import { lstat } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";

import {
  WorktreeLeasingError,
  type WorktreePlacement,
  type WorktreePlacementOptions,
} from "./types.js";

const DEFAULT_WORKSPACE_ROOT = "/mnt/workspace";
const DEFAULT_WORKTREE_SUBDIR = "worktrees";

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function assertNonSymlink(path: string): Promise<void> {
  if (!(await pathExists(path))) {
    return;
  }

  const stat = await lstat(path);
  if (stat.isSymbolicLink()) {
    throw new WorktreeLeasingError(
      "symlink_escape_rejected",
      `Refusing to place a worktree under symlinked root ${path}.`,
      { path },
    );
  }
}

function assertSafeProjectName(projectName: string): string {
  if (!/^[A-Za-z0-9._-]+$/.test(projectName)) {
    throw new WorktreeLeasingError(
      "invalid_project_name",
      `Invalid project name ${projectName}.`,
      { projectName },
    );
  }

  return projectName;
}

export function validateBranchName(branchName: string): string {
  const invalid =
    branchName.length === 0 ||
    branchName.startsWith("/") ||
    branchName.endsWith("/") ||
    branchName.includes("..") ||
    branchName.includes("\\") ||
    branchName.includes(" ") ||
    branchName.includes(":") ||
    branchName.includes("~") ||
    branchName.includes("^") ||
    branchName.includes("?") ||
    branchName.includes("*") ||
    branchName.includes("[") ||
    branchName.includes("@{") ||
    !/^[A-Za-z0-9._/-]+$/.test(branchName);

  if (invalid) {
    throw new WorktreeLeasingError(
      "invalid_branch_name",
      `Invalid branch name ${branchName}.`,
      { branchName },
    );
  }

  return branchName;
}

export function branchNameToSlug(branchName: string): string {
  return validateBranchName(branchName)
    .replaceAll("/", "-")
    .replace(/-+/g, "-");
}

async function assertPlacementWithinRoot(
  root: string,
  path: string,
): Promise<void> {
  const rootResolved = resolve(root);
  const pathResolved = resolve(path);
  const relation = relative(rootResolved, pathResolved);

  if (
    relation === ".." ||
    relation.startsWith(`..${sep}`) ||
    relation.length === 0 ||
    relation.includes(`..${sep}`)
  ) {
    if (relation.length === 0) {
      throw new WorktreeLeasingError(
        "invalid_worktree_path",
        `Worktree path ${pathResolved} must include a child component under ${rootResolved}.`,
        { path: pathResolved, root: rootResolved },
      );
    }

    throw new WorktreeLeasingError(
      "path_traversal_rejected",
      `Worktree path ${pathResolved} escapes ${rootResolved}.`,
      { path: pathResolved, root: rootResolved },
    );
  }
}

export async function resolveMountedWorkspacePlacement(
  options: WorktreePlacementOptions,
): Promise<WorktreePlacement> {
  const projectSlug = assertSafeProjectName(options.projectName);
  const branchSlug = branchNameToSlug(options.branchName);
  const workspaceMountRoot = options.workspaceMountRoot ?? DEFAULT_WORKSPACE_ROOT;
  const usesMountedWorkspace =
    options.workspaceMountExists ?? (await pathExists(workspaceMountRoot));
  const root = usesMountedWorkspace
    ? join(workspaceMountRoot, DEFAULT_WORKTREE_SUBDIR)
    : resolve(options.fallbackRoot ?? dirname(options.repoRoot));
  const path = resolve(root, `${projectSlug}-${branchSlug}`);

  if (usesMountedWorkspace) {
    await assertNonSymlink(workspaceMountRoot);
  }
  await assertNonSymlink(root);
  await assertPlacementWithinRoot(root, path);

  return {
    path,
    root: resolve(root),
    usesMountedWorkspace,
    projectSlug,
    branchSlug,
  };
}
