import { randomBytes, createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { cleanEnvironment, runProcess } from "../tests/helpers/guard-process.ts";

export const IMAGE = "postgres@sha256:45cd22f8d32e189d245403954882f88e7a8714301fda80dab6da90f1265b25a3";
export const PLATFORM = "linux/amd64";
export const DATABASE = "omniagent_guard";
export const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
export const ADMISSION = `select json_build_object('database',current_database(),'user',session_user,'version',current_setting('server_version_num')::int,'super',rolsuper,'login',rolcanlogin,'fresh',not exists(select from pg_class where relname like 'coordination_%') and not exists(select from pg_roles where rolname='guard_client')) from pg_roles where rolname=session_user`;
export const ROLES = `select json_agg(row_to_json(r) order by rolname) from (select rolname,rolsuper,rolbypassrls,rolinherit,rolcanlogin,rolcreatedb,rolcreaterole,rolreplication from pg_roles where rolname in ('anon','authenticated','service_role','guard_client')) r`;

export function connectionEnvironment(fixture, user = "postgres", password = fixture.password) {
  return { ...cleanEnvironment(), PGHOST: "127.0.0.1", PGHOSTADDR: "127.0.0.1", PGPORT: String(fixture.port), PGDATABASE: DATABASE, PGUSER: user, PGPASSWORD: password, PGCONNECT_TIMEOUT: "5", PGOPTIONS: "-c statement_timeout=10000", PGSSLMODE: "disable", PGSERVICEFILE: join(fixture.runDir, "absent-service"), PGPASSFILE: join(fixture.runDir, "absent-pass") };
}
export async function sql(fixture, statement, user = "postgres", password = fixture.password, timeout = 15_000) {
  return await runProcess("psql", ["-X", "-qAt", "-v", "ON_ERROR_STOP=1"], { env: connectionEnvironment(fixture, user, password), input: statement, timeout });
}
export function validateMetadata(container, image, fixture) {
  const ports = container.NetworkSettings?.Ports?.["5432/tcp"];
  if (container.Id !== fixture.id || container.Config.Image !== IMAGE || container.Image !== image.Id || image.Os + "/" + image.Architecture !== PLATFORM || !image.RepoDigests?.includes(IMAGE) || ports?.length !== 1 || ports[0].HostIp !== "127.0.0.1" || Number(ports[0].HostPort) !== fixture.port || !container.State.Running) throw new Error("Fixture Docker identity mismatch");
}
export async function pullImage(run = runProcess) {
  await run("docker", ["pull", "--platform", PLATFORM, IMAGE], { timeout: 300_000 });
}
export async function awaitReadiness(fixture, { now = Date.now, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), probe = sql, signal = new AbortController().signal } = {}) {
  const deadline = now() + 30_000;
  for (;;) {
    const remaining = deadline - now();
    if (signal.aborted || remaining <= 550) throw new Error("Fixture readiness failed");
    try { await probe(fixture, "select 1", "postgres", fixture.password, Math.min(15_000, remaining - 550)); break; }
    catch {
      if (now() >= deadline - 550) throw new Error("Fixture readiness failed");
      await sleep(Math.min(250, Math.max(0, deadline - now() - 550)));
    }
  }
}
export async function createFixture({ mode = "local", source = process.env, root = process.cwd(), run = runProcess } = {}) {
  if (!["local", "github-service"].includes(mode)) throw new Error("Invalid fixture mode");
  const runDir = resolve(root, ".phase-loop/guard", `${Date.now()}-${randomBytes(6).toString("hex")}`);
  mkdirSync(runDir, { recursive: true });
  const fixture = { id: "", port: 0, host: "127.0.0.1", database: DATABASE, password: randomBytes(20).toString("hex"), clientPassword: randomBytes(20).toString("hex"), runDir, mode, receipt: { image: IMAGE, platform: PLATFORM, container_id: "", port: 0, admitted: false, migrations: [], roles: [], probe: "not-run", cleanup: "pending" } };
  const ownerLabel = `omniagent.guard.run=${randomBytes(16).toString("hex")}`;
  const controller = new AbortController();
  let creationStarted = false;
  let established = false;
  const activeRun = (command, args, options = {}) => run(command, args, { ...options, signal: controller.signal });
  let cleaned = false;
  async function cleanup() {
    if (cleaned) return;
    if (mode === "local" && creationStarted && !fixture.id) {
      const ids = await run("docker", ["ps", "--all", "--quiet", "--no-trunc", "--filter", `label=${ownerLabel}`]);
      for (const id of ids.split("\n").filter(Boolean)) {
        const [container] = JSON.parse(await run("docker", ["inspect", id]));
        if (container.Config.Labels["omniagent.guard.run"] !== ownerLabel.split("=")[1] || container.Config.Image !== IMAGE) throw new Error("Cleanup ownership mismatch");
        await run("docker", ["rm", "--force", id]);
      }
    }
    if (mode === "local" && fixture.id) await run("docker", ["rm", "--force", fixture.id]);
    fixture.receipt.cleanup = mode === "local" ? "removed-owned-container" : "workflow-owned-service";
    writeFileSync(join(runDir, "sql-setup.json"), JSON.stringify(fixture.receipt, null, 2) + "\n");
    cleaned = true;
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", interrupt);
  }
  function interrupt() {
    controller.abort();
    if (established) cleanup().then(() => process.exit(1), () => process.exit(1));
  }
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);
  try {
    if (mode === "local") {
      await pullImage(activeRun);
      creationStarted = true;
      fixture.id = await activeRun("docker", ["run", "--detach", "--platform", PLATFORM, "--label", "omniagent.guard=disposable", "--label", ownerLabel, "--publish", "127.0.0.1::5432", "--env", `POSTGRES_DB=${DATABASE}`, "--env", "POSTGRES_USER=postgres", "--env", "POSTGRES_PASSWORD", IMAGE], { env: { ...cleanEnvironment(), POSTGRES_PASSWORD: fixture.password } });
    } else {
      if (source.GITHUB_ACTIONS !== "true" || !/^[a-f0-9]{64}$/.test(source.GUARD_FIXTURE_CONTAINER_ID ?? "") || !/^\d+$/.test(source.GUARD_FIXTURE_PORT ?? "") || source.GUARD_FIXTURE_DATABASE !== DATABASE || source.GUARD_FIXTURE_INSTALLER_USER !== "postgres" || !source.GUARD_FIXTURE_INSTALLER_PASSWORD) throw new Error("Missing hosted fixture identity");
      fixture.id = source.GUARD_FIXTURE_CONTAINER_ID ?? "";
      fixture.password = source.GUARD_FIXTURE_INSTALLER_PASSWORD;
      fixture.port = Number(source.GUARD_FIXTURE_PORT);
    }
    const [container] = JSON.parse(await activeRun("docker", ["inspect", fixture.id]));
    if (mode === "local") fixture.port = Number(container.NetworkSettings?.Ports?.["5432/tcp"]?.[0]?.HostPort);
    const [image] = JSON.parse(await activeRun("docker", ["image", "inspect", IMAGE]));
    validateMetadata(container, image, fixture);
    fixture.receipt.container_id = fixture.id;
    fixture.receipt.port = fixture.port;
    await awaitReadiness(fixture, { signal: controller.signal });
    if (controller.signal.aborted) throw new Error("Fixture creation interrupted");
    established = true;
    return { ...fixture, cleanup };
  } catch (error) { await cleanup(); throw error; }
}

export async function setupFixture(fixture, migrationDir = resolve("supabase/migrations")) {
  if (fixture.host !== "127.0.0.1" || fixture.database !== DATABASE || !fixture.id || !fixture.port) throw new Error("Non-disposable fixture configuration before bootstrap");
  const admission = JSON.parse(await sql(fixture, ADMISSION));
  if (admission.database !== DATABASE || admission.user !== "postgres" || !admission.super || !admission.login || admission.version < 170000 || admission.version >= 180000 || !admission.fresh) throw new Error("Fixture admission/freshness failed before bootstrap");
  fixture.receipt.admitted = true;
  await sql(fixture, `create role anon nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
create role authenticated nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
create role service_role nologin nosuperuser bypassrls nocreatedb nocreaterole noreplication;
create role guard_client login nosuperuser nobypassrls noinherit nocreatedb nocreaterole noreplication password '${fixture.clientPassword}';
grant service_role to guard_client with admin false, inherit false, set true;`);
  const migrations = readdirSync(migrationDir).filter((file) => file.endsWith(".sql")).sort();
  if (!migrations.length) throw new Error("No migrations");
  for (const file of migrations) {
    const bytes = readFileSync(join(migrationDir, file));
    await sql(fixture, bytes.toString("utf8"));
    fixture.receipt.migrations.push({ file, sha256: hash(bytes) });
  }
  await validateSetup(fixture);
  return fixture;
}
export async function validateSetup(fixture) {
  const roles = JSON.parse(await sql(fixture, ROLES));
  if (!Array.isArray(roles) || roles.length !== 4) throw new Error("Missing required role");
  for (const role of roles) {
    if (role.rolsuper || role.rolcreatedb || role.rolcreaterole || role.rolreplication || role.rolbypassrls !== (role.rolname === "service_role") || role.rolcanlogin !== (role.rolname === "guard_client") || (role.rolname === "guard_client" && role.rolinherit)) throw new Error("Unexpected role attributes");
  }
  const membership = await sql(fixture, "select admin_option::text||'|'||inherit_option::text||'|'||set_option::text from pg_auth_members where roleid='service_role'::regrole and member='guard_client'::regrole");
  if (membership !== "false|false|true") throw new Error("Unexpected membership attributes");
  await probeClient(fixture);
  fixture.receipt.roles = roles;
  fixture.receipt.probe = "passed-signature-and-read-only-query";
}
export async function probeClient(fixture, user = "guard_client", password = fixture.clientPassword) {
  // Each psql invocation is a dedicated connection, closed even on SQL failure.
  const identity = await sql(fixture, "select current_user||'|'||session_user||'|'||rolsuper::text||'|'||rolbypassrls::text from pg_roles where rolname=session_user", user, password);
  if (identity !== "guard_client|guard_client|false|false") throw new Error("Invalid test caller");
  const grants = await sql(fixture, "select (to_regprocedure('public.coordination_acquire_lease(jsonb)') is not null)::text||'|'||has_function_privilege('service_role','public.coordination_query_leases(jsonb)','execute')::text||'|'||has_function_privilege('guard_client','public.coordination_query_leases(jsonb)','execute')::text", user, password);
  if (grants !== "true|true|false") throw new Error("Missing function or invalid execute grants");
  const result = await sql(fixture, "begin read only; set local role service_role; select current_user||'|'||session_user; select public.coordination_query_leases('{}'::jsonb); rollback;", user, password);
  if (!result.startsWith("service_role|guard_client\n") || !Array.isArray(JSON.parse(result.split("\n")[1] ?? "null").leases)) throw new Error("Read-only probe failed");
  const fresh = await sql(fixture, "select current_user||'|'||session_user", user, password);
  if (fresh !== "guard_client|guard_client") throw new Error("Probe role leaked");
}
export function clientUrl(fixture) {
  return `postgresql://guard_client:${fixture.clientPassword}@127.0.0.1:${fixture.port}/${DATABASE}`;
}
