import { configDefaults, defineConfig } from "vitest/config";

const fixture = process.env.GUARD_INTEGRATION_REQUIRED === "1" ? {
  GUARD_INTEGRATION_REQUIRED: "1",
  GUARD_TEST_DATABASE_URL: process.env.GUARD_TEST_DATABASE_URL,
  GUARD_FIXTURE_RUN_DIR: process.env.GUARD_FIXTURE_RUN_DIR,
} : undefined;
const custody = process.env.GUARD_CUSTODY_RUN_DIR && process.env.GUARD_CUSTODY_STAGE ? {
  GUARD_CUSTODY_RUN_DIR: process.env.GUARD_CUSTODY_RUN_DIR,
  GUARD_CUSTODY_STAGE: process.env.GUARD_CUSTODY_STAGE,
  GUARD_JOB_STARTED_MS: process.env.GUARD_JOB_STARTED_MS,
  GUARD_ADMITTED_OPERATION_NS: process.env.GUARD_ADMITTED_OPERATION_NS,
  GUARD_ADMITTED_COMPLETION_NS: process.env.GUARD_ADMITTED_COMPLETION_NS,
  GUARD_ADMITTED_CLEANUP_SLOTS: process.env.GUARD_ADMITTED_CLEANUP_SLOTS,
  GUARD_ADMITTED_CHILD_RESERVATION_MS: process.env.GUARD_ADMITTED_CHILD_RESERVATION_MS,
  GUARD_ADMITTED_EPOCH_FILE: process.env.GUARD_ADMITTED_EPOCH_FILE,
} : {};
// Capture admitted parameters for the DB project, then remove them before forks.
for (const key of Object.keys(process.env)) {
  if (key.startsWith("PG") || key.startsWith("SUPABASE_") || key.startsWith("GUARD_") || key === "DATABASE_URL") delete process.env[key];
}
export default defineConfig({
  test: {
    environment: "node",
    projects: [
      { test: { name: "deterministic", environment: "node", include: ["packages/**/*.test.ts", "tests/guard/**/*.test.ts"], exclude: [...configDefaults.exclude, "tests/guard/**/*.db.test.ts"], env: custody } },
      ...(fixture ? [{ test: { name: "guard-db", environment: "node", include: ["tests/guard/**/*.db.test.ts"], env: { ...custody, ...fixture } } }] : []),
    ],
  },
});
