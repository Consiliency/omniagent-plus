export const STAGES = ["install", "build", "lint", "typecheck", "boundaries", "sql-setup", "root-suite", "pack-and-manifest", "transport-smoke", "artifact-check"] as const;
export async function runStages(stages: readonly string[], run: (stage: string) => Promise<void>): Promise<void> {
  for (const stage of stages) await run(stage);
}
