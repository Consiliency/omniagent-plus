import type { PortabilityInput, PortabilityScore } from "./types.js";

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function scoreTaskPortability(
  input: PortabilityInput,
): PortabilityScore {
  let score = 0.5;
  const reasons: string[] = [];

  if (input.sessionContinuation) {
    score -= 0.35;
    reasons.push("active session continuation prefers the current provider");
  } else {
    score += 0.15;
    reasons.push("new work can move without session affinity");
  }

  if (input.handoffEvidence) {
    score += 0.1;
    reasons.push("handoff evidence supports migration");
  } else {
    score -= 0.1;
    reasons.push("missing handoff evidence weakens portability");
  }

  if (input.worktreeLease) {
    score += 0.15;
    reasons.push("worktree lease keeps repo context portable");
  } else {
    score -= 0.05;
    reasons.push("missing worktree evidence reduces portability");
  }

  if (input.rawHistoryAttached) {
    score -= 0.15;
    reasons.push("raw history attachments reduce portability");
  }

  if (input.localFilesystemDependency) {
    score -= 0.2;
    reasons.push("local filesystem dependency pins execution");
  }

  if (input.allowCrossProviderMigration === false) {
    score = Math.min(score, 0.39);
    reasons.push("policy forbids cross-provider migration");
  }

  const clampedScore = clamp(score);
  const level =
    clampedScore >= 0.75 ? "high" : clampedScore >= 0.4 ? "medium" : "low";

  return {
    score: clampedScore,
    level,
    migrateAcrossProviders:
      level === "high" && input.allowCrossProviderMigration !== false,
    reasons,
  };
}
