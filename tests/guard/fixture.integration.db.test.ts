import { expect, it } from "vitest";
import { admittedClient, probeAdmittedClient } from "../helpers/guard-postgres.js";
import { sql } from "../../scripts/prepare-test-postgres.mjs";

it("GUARD-DB-probe", async () => { await probeAdmittedClient(); }, 30_000);
it("GUARD-DB-default-identity", async () => {
  const fixture = admittedClient();
  expect(await sql(fixture, "select current_user||'|'||session_user", "guard_client", fixture.clientPassword)).toBe("guard_client|guard_client");
  expect(process.env.DATABASE_URL).toBeUndefined();
  expect(process.env.GUARD_FIXTURE_INSTALLER_PASSWORD).toBeUndefined();
}, 20_000);
