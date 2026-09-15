import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createFixture, setupFixture, sql, probeClient } from "../../scripts/prepare-test-postgres.mjs";
import { runProcess } from "../helpers/guard-process.js";

describe.sequential("disposable SQL setup", () => {
  it("GUARD-SQL-positive", async () => {
    const fixture = await createFixture();
    try { await setupFixture(fixture); expect(fixture.receipt.probe).toBe("passed-signature-and-read-only-query"); }
    finally { await fixture.cleanup(); }
  }, 360_000);
  it("GUARD-SQL-creation-cleanup", async () => {
    let created = "";
    await expect(createFixture({ run: async (command, args, options) => {
      const output = await runProcess(command, args, options);
      if (args[0] === "run") { created = output; throw new Error("Lost container creation response"); }
      return output;
    } })).rejects.toThrow("Lost container creation response");
    expect(created).toMatch(/^[a-f0-9]{64}$/);
    await expect(runProcess("docker", ["inspect", created])).rejects.toThrow();
  }, 360_000);
  it("GUARD-SQL-unreachable", async () => {
    await expect(sql({ port: 1, password: "synthetic", runDir: "/nonexistent/guard" }, "select 1")).rejects.toThrow();
  }, 20_000);
  it("GUARD-SQL-invalid-migration", async () => {
    const dir = mkdtempSync(join(tmpdir(), "guard-migrations-"));
    cpSync("supabase/migrations", dir, { recursive: true });
    writeFileSync(join(dir, "999999_invalid.sql"), "this is invalid sql;");
    const fixture = await createFixture();
    try { await expect(setupFixture(fixture, dir)).rejects.toThrow(); }
    finally { await fixture.cleanup(); rmSync(dir, { recursive: true, force: true }); }
  }, 360_000);
  for (const [id, mutation] of [
    ["GUARD-SQL-missing-role", "alter role anon rename to missing_anon"],
    ["GUARD-SQL-privilege", "alter role guard_client superuser"],
    ["GUARD-SQL-missing-function", "drop function public.coordination_acquire_lease(jsonb)"],
  ] as const) it(id, async () => {
    const dir = mkdtempSync(join(tmpdir(), "guard-mutation-"));
    cpSync("supabase/migrations", dir, { recursive: true });
    writeFileSync(join(dir, "999999_control.sql"), mutation + ";");
    const fixture = await createFixture();
    try { await expect(setupFixture(fixture, dir)).rejects.toThrow(); }
    finally { await fixture.cleanup(); rmSync(dir, { recursive: true, force: true }); }
  }, 360_000);
  it("GUARD-SQL-stale", async () => {
    const fixture = await createFixture();
    try {
      await expect(setupFixture({ ...fixture, database: "other" })).rejects.toThrow("before bootstrap");
      await expect(setupFixture({ ...fixture, host: "192.0.2.1" })).rejects.toThrow("before bootstrap");
      expect(await sql(fixture, "select count(*) from pg_roles where rolname='service_role'")).toBe("0");
      await sql(fixture, "create table public.coordination_stale(id int)");
      await expect(setupFixture(fixture)).rejects.toThrow("before bootstrap");
      expect(await sql(fixture, "select count(*) from pg_roles where rolname='guard_client'")).toBe("0");
      await sql(fixture, "drop table public.coordination_stale; create role guard_client");
      await expect(setupFixture(fixture)).rejects.toThrow("before bootstrap");
      expect(await sql(fixture, "select count(*) from pg_roles where rolname='service_role'")).toBe("0");
    } finally { await fixture.cleanup(); }
  }, 360_000);
  it("GUARD-SQL-superuser", async () => {
    const fixture = await createFixture();
    try { await setupFixture(fixture); await expect(probeClient(fixture, "postgres", fixture.password)).rejects.toThrow("Invalid test caller"); }
    finally { await fixture.cleanup(); }
  }, 360_000);
});
