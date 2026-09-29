import { probeClient } from "../../scripts/prepare-test-postgres.mjs";

export function admittedClient() {
  if (process.env.GUARD_INTEGRATION_REQUIRED !== "1" || !process.env.GUARD_TEST_DATABASE_URL) throw new Error("Required DB fixture missing");
  const url = new URL(process.env.GUARD_TEST_DATABASE_URL);
  if (url.protocol !== "postgresql:" || url.hostname !== "127.0.0.1" || url.username !== "guard_client" || url.pathname !== "/omniagent_guard" || !url.password || !url.port || url.search || url.hash) throw new Error("Invalid test fixture connection");
  return { port: Number(url.port), clientPassword: url.password, password: "", runDir: process.env.GUARD_FIXTURE_RUN_DIR ?? "/nonexistent/guard" };
}
export async function probeAdmittedClient(): Promise<void> {
  await probeClient(admittedClient());
}
