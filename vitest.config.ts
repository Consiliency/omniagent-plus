import { configDefaults, defineConfig } from "vitest/config";

const fixture = process.env.GUARD_INTEGRATION_REQUIRED === "1" ? {
  GUARD_INTEGRATION_REQUIRED: "1",
  GUARD_TEST_DATABASE_URL: process.env.GUARD_TEST_DATABASE_URL,
  GUARD_FIXTURE_RUN_DIR: process.env.GUARD_FIXTURE_RUN_DIR,
} : undefined;
// Capture admitted parameters for the DB project, then remove them before forks.
for (const key of Object.keys(process.env)) {
  if (key.startsWith("PG") || key.startsWith("SUPABASE_") || key.startsWith("GUARD_") || key === "DATABASE_URL") delete process.env[key];
}
export default defineConfig({
  test: {
    environment: "node",
    projects: [
      { test: { name: "deterministic", environment: "node", include: ["packages/**/*.test.ts", "tests/guard/**/*.test.ts"], exclude: [...configDefaults.exclude, "tests/guard/**/*.db.test.ts"] } },
      ...(fixture ? [{ test: { name: "guard-db", environment: "node", include: ["tests/guard/**/*.db.test.ts"], env: fixture } }] : []),
    ],
  },
});
