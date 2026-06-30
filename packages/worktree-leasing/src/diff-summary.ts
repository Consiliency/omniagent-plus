import type { DiffSummary } from "./types.js";
import {
  inspectWorktreeDirtyState,
  readGitBranch,
  readGitNumstat,
  readGitStatusEntries,
} from "./git.js";

function parseChangedPath(entry: string): string {
  const pathPart = entry.slice(3);
  const renameIndex = pathPart.indexOf(" -> ");
  if (renameIndex >= 0) {
    return pathPart.slice(renameIndex + 4);
  }

  return pathPart;
}

export async function summarizeWorktreeDiff(options: {
  readonly worktreePath: string;
  readonly maxPaths?: number;
}): Promise<DiffSummary> {
  const maxPaths = options.maxPaths ?? 20;
  const statusEntries = await readGitStatusEntries(options.worktreePath);
  const changedPaths = statusEntries.map(parseChangedPath);
  const numstatEntries = await readGitNumstat(options.worktreePath);

  let additions = 0;
  let deletions = 0;
  for (const entry of numstatEntries) {
    const [addedRaw, deletedRaw] = entry.split("\t");
    if (addedRaw !== undefined && addedRaw !== "-") {
      additions += Number.parseInt(addedRaw, 10);
    }
    if (deletedRaw !== undefined && deletedRaw !== "-") {
      deletions += Number.parseInt(deletedRaw, 10);
    }
  }

  return {
    branchName: await readGitBranch(options.worktreePath),
    worktreePath: options.worktreePath,
    dirtyState: await inspectWorktreeDirtyState(options.worktreePath),
    changedPaths: changedPaths.slice(0, maxPaths),
    fileCount: changedPaths.length,
    additions,
    deletions,
    truncated: changedPaths.length > maxPaths,
  };
}
