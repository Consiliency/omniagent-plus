import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { coordinationMessageSchema } from "../../packages/core-contracts/src/coordination-contract.js";
import { describe, expect, it } from "vitest";
import { admittedClient } from "../helpers/guard-postgres.js";
import { sql } from "../../scripts/prepare-test-postgres.mjs";

function json(value: unknown): string { return "'" + JSON.stringify(value).replaceAll("'", "''") + "'::jsonb"; }
async function service(statement: string, readOnly = false): Promise<string> {
  const fixture = admittedClient();
  return sql(fixture, "begin" + (readOnly ? " read only" : "") + "; set local role service_role; " + statement + "; " + (readOnly ? "rollback" : "commit") + ";", "guard_client", fixture.clientPassword);
}
async function invoke(fn: string, request: unknown): Promise<Record<string, unknown>> {
  return JSON.parse(await service("select public." + fn + "(" + json(request) + ")"));
}
function acquire(prefix: string, id = "lease:" + randomUUID(), mode = "hard") {
  return { leaseId: id, holder: prefix, ttlSeconds: 60, mode, scope: { granularity: "path-set", selector: [prefix] }, phase: "COORD", now: "2099-01-01T00:00:00Z" };
}

describe.sequential("admitted COORD SQL", () => {
  it("COORD-DB-privileges", async () => {
    const fixture = admittedClient();
    const inventory = JSON.parse(await sql(fixture, `select json_build_object(
      'functions',(select json_agg(json_build_object('name',p.proname,'anon',has_function_privilege('anon',p.oid,'execute'),
        'authenticated',has_function_privilege('authenticated',p.oid,'execute'),'client',has_function_privilege('guard_client',p.oid,'execute'),
        'service',has_function_privilege('service_role',p.oid,'execute'))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname like 'coordination\\_%' escape '\\'),
      'tables',(select json_agg(json_build_object('name',c.relname,'rls',c.relrowsecurity,
        'anon',has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),
        'authenticated',has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),
        'client',has_table_privilege('guard_client',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),
        'service',has_table_privilege('service_role',c.oid,'SELECT,INSERT,UPDATE'))) from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relkind='r' and c.relname like 'coordination\\_%' escape '\\'))`, "guard_client", fixture.clientPassword));
    expect(inventory.functions.length).toBe(11);
    expect(inventory.tables.length).toBe(3);
    for (const fn of inventory.functions) expect(fn).toMatchObject({ anon: false, authenticated: false, client: false, service: true });
    for (const table of inventory.tables) expect(table).toMatchObject({ rls: true, anon: false, authenticated: false, client: false, service: true });
  });

  it("COORD-DB-clock-and-holder", async () => {
    const prefix = "coord-clock-" + randomUUID();
    const request = acquire(prefix);
    const acquired = await invoke("coordination_acquire_lease", request);
    expect(acquired.granted).toBe(true);
    const lease = acquired.lease as { acquired_at: string; heartbeat_at: string };
    expect(Math.abs(Date.now() - Date.parse(lease.acquired_at))).toBeLessThan(5000);
    const queried = await invoke("coordination_query_leases", { lease_id: request.leaseId, now: "2099-01-01T00:00:00Z" });
    expect((queried.leases as unknown[]).length).toBe(1);
    expect(await invoke("coordination_renew_lease", { lease_id: request.leaseId, holder: "other", now: "2099-01-01T00:00:00Z" })).toMatchObject({ renewed: false, failure: "not-holder" });
    expect(await invoke("coordination_release_lease", { lease_id: request.leaseId, holder: "other", now: "1970-01-01T00:00:00Z" })).toMatchObject({ released: false, failure: "not-holder" });
    const snapshot = () => service(`select md5(jsonb_build_object('projection',(select to_jsonb(c) from public.coordination_current_leases c where lease_id='${request.leaseId}'),
      'events',(select jsonb_agg(to_jsonb(e) order by e.id) from public.coordination_lease_events e where lease_id='${request.leaseId}'))::text)`, true);
    const before = await snapshot();
    for (const holderFields of [{}, { holder: null }, { holder: "" }, { holder: 7 }, { holder: {} }]) {
      expect(await invoke("coordination_renew_lease", { lease_id: request.leaseId, ...holderFields })).toMatchObject({ renewed: false, failure: "not-holder" });
      expect(await invoke("coordination_release_lease", { lease_id: request.leaseId, ...holderFields })).toMatchObject({ released: false, failure: "not-holder" });
      expect(await snapshot()).toBe(before);
    }
    const renewed = await invoke("coordination_renew_lease", { lease_id: request.leaseId, holder: prefix, now: "1970-01-01T00:00:00Z" });
    expect(Math.abs(Date.now() - Date.parse((renewed.lease as { heartbeat_at: string }).heartbeat_at))).toBeLessThan(5000);
    expect(await invoke("coordination_release_lease", { lease_id: request.leaseId, holder: prefix, now: "1970-01-01T00:00:00Z" })).toMatchObject({ released: true });
    const released = await service("select extract(epoch from released_at) from public.coordination_current_leases where lease_id='" + request.leaseId + "'", true);
    expect(Math.abs(Date.now() - Number(released) * 1000)).toBeLessThan(5000);
    expect((await invoke("coordination_acquire_lease", request)).granted).toBe(true);
  });

  it("COORD-DB-concurrent-hard", async () => {
    const prefix = "coord-concurrent-" + randomUUID();
    const requests = [acquire(prefix), acquire(prefix)];
    const results = await Promise.all(requests.map((request) => invoke("coordination_acquire_lease", request)));
    expect(results.filter((result) => result.granted)).toHaveLength(1);
    expect(results.filter((result) => result.failure === "conflict")).toHaveLength(1);
    const counts = JSON.parse(await service(`select json_build_object('projection',(select count(*) from public.coordination_current_leases where scope_selector=array['${prefix}']),
      'events',(select count(*) from public.coordination_lease_events where scope_selector=array['${prefix}']))`, true));
    expect(counts).toEqual({ projection: 1, events: 1 });
  });

  it("COORD-DB-rollback", async () => {
    const prefix = "coord-rollback-" + randomUUID();
    const request = acquire(prefix);
    const fixture = admittedClient();
    await sql(fixture, "begin; set local role service_role; select public.coordination_acquire_lease(" + json(request) + "); rollback;", "guard_client", fixture.clientPassword);
    expect(await service(`select count(*) from public.coordination_current_leases where lease_id='${request.leaseId}'`, true)).toBe("0");
    expect(await service(`select count(*) from public.coordination_lease_events where lease_id='${request.leaseId}'`, true)).toBe("0");
    await expect(invoke("coordination_acquire_lease", { ...request, ttlSeconds: 9000 })).rejects.toThrow();
    expect(await service(`select count(*) from public.coordination_lease_events where lease_id='${request.leaseId}'`, true)).toBe("0");
  });

  it("COORD-DB-expiry", async () => {
    const prefix = "coord-expiry-" + randomUUID();
    const request = acquire(prefix);
    await invoke("coordination_acquire_lease", request);
    await service(`update public.coordination_current_leases set heartbeat_at=clock_timestamp()-interval '61 seconds'
      where lease_id='${request.leaseId}'`);
    await service("select public.coordination_expire_leases('1970-01-01T00:00:00Z'::timestamptz)");
    expect(await service(`select state from public.coordination_current_leases where lease_id='${request.leaseId}'`, true)).toBe("expired");
    expect(await service(`select count(*) from public.coordination_lease_events where lease_id='${request.leaseId}' and event_type='expire'`, true)).toBe("1");
    expect((await invoke("coordination_acquire_lease", request)).granted).toBe(true);
  });

  it("COORD-DB-query-pages", async () => {
    const prefix = "coord-pages-" + randomUUID();
    const ids = ["c", "b", "a"].map((suffix) => "lease:" + prefix + ":" + suffix);
    for (const id of ids) await invoke("coordination_acquire_lease", acquire(prefix, id, "soft"));
    await service(`update public.coordination_current_leases set acquired_at=date_trunc('second',clock_timestamp())+
      case right(lease_id,1) when 'a' then interval '0.999 seconds' when 'b' then interval '0.5 seconds' else interval '0.001 seconds' end
      where scope_selector=array['${prefix}']`);
    const scope = { granularity: "path-set", selector: [prefix] };
    let cursor: { timestamp: string; id: string } | undefined;
    const visited: string[] = [];
    for (let n = 0; n < 3; n += 1) {
      const response = await invoke("coordination_query_leases", { scope, limit: 1, cursor });
      const lease = (response.leases as Array<{ lease_id: string; acquired_at: string }>)[0]!;
      visited.push(lease.lease_id); cursor = { timestamp: lease.acquired_at, id: lease.lease_id };
    }
    expect(visited).toEqual([...ids].reverse());
    for (let n = 0; n < 101; n += 1) await invoke("coordination_acquire_lease", acquire(prefix + "-hard-filter", "lease:" + prefix + ":soft:" + n.toString().padStart(3, "0"), "soft"));
    const hard = acquire(prefix + "-hard-filter", "lease:" + prefix + ":zzhard");
    await invoke("coordination_acquire_lease", hard);
    const hardOnly = await invoke("coordination_query_leases", { scope: hard.scope, mode: "hard", limit: 1 });
    expect((hardOnly.leases as Array<{ lease_id: string }>)[0]?.lease_id).toBe(hard.leaseId);
    const messageIds = ["c", "b", "a"].map((suffix) => prefix + ":" + suffix);
    await service("insert into public.coordination_inbox_messages(message_id,message_type,sender,scope_kind,scope_selector,payload,created_at) values " +
      messageIds.map((id) => `('${id}','done','operator','path-set',array['${prefix}'],${json({ schema: "consiliency.coordination_message.v1", message_id: id, type: "done", sender: "operator", scope })},date_trunc('second',statement_timestamp())+interval '0.5 seconds')`).join(","));
    cursor = undefined;
    const messages: string[] = [];
    for (let n = 0; n < 3; n += 1) {
      const response = await invoke("coordination_list_messages", { scope, limit: 1, cursor });
      const message = (response.messages as Array<{ message_id: string; created_at: string }>)[0]!;
      messages.push(message.message_id); cursor = { timestamp: message.created_at, id: message.message_id };
    }
    expect(messages).toEqual([...messageIds].reverse());
    await expect(invoke("coordination_query_leases", { limit: 501 })).rejects.toThrow();
    for (const cursor of [null, {}, { id: "x", extra: "y" }, { timestamp: "2026-10-03T00:00:00Z", extra: "y" }, { timestamp: null, id: "x" }]) {
      await expect(invoke("coordination_query_leases", { cursor })).rejects.toThrow();
      await expect(invoke("coordination_list_messages", { cursor })).rejects.toThrow();
    }
  }, 30_000);

  it("COORD-DB-inbox-capacity", async () => {
    const prefix = "coord-capacity-" + randomUUID();
    const scope = { granularity: "path-set", selector: [prefix] };
    const futureId = prefix + ":future";
    await service(`insert into public.coordination_inbox_messages(message_id,message_type,sender,scope_kind,scope_selector,payload,created_at)
      values('${futureId}','done','operator','path-set',array['${prefix}'],${json({ schema: "consiliency.coordination_message.v1", message_id: futureId, type: "done", sender: "operator", scope, created_at: "2099-01-01T00:00:00Z" })},'2099-01-01T00:00:00Z')`);
    const snapshot = () => service("select md5(coalesce(jsonb_agg(to_jsonb(inbox) order by message_id),'[]'::jsonb)::text) from public.coordination_inbox_messages inbox", true);
    const beforeInvalid = await snapshot();
    const corpus = JSON.parse(readFileSync(new URL("../../fixtures/content-policy/corpus.json", import.meta.url), "utf8")) as { allowed: unknown[]; rejected: unknown[] };
    const tooDeep = Array.from({ length: 63 }).reduce<unknown>((nested) => ({ nested }), "safe");
    for (const input of [null, { type: "done", sender: "", scope }, { type: "done", sender: null, scope }, { type: "invalid", sender: "operator", scope },
      ...[[], [""], [null], [7], ["/absolute"], ["../parent"], ["C:\\absolute"]].map((selector) => ({ type: "done", sender: "operator", scope: { ...scope, selector } })),
      ...["targetHolder", "leaseId", "handoffPacketId"].flatMap((key) => ["", null, 7].map((value) => ({ type: "done", sender: "operator", scope, [key]: value }))),
      { type: "done", sender: "operator", scope, body: null }, { type: "done", sender: "operator", scope, body: [] },
      ...corpus.rejected.map((nested) => ({ type: "done", sender: "operator", scope, body: { nested } })),
      ...['{"count":1e400}', '{"count":1e400000}'].map((nested) => ({ type: "done", sender: "operator", scope, body: { nested } })),
      ...["sender", "targetHolder", "leaseId", "handoffPacketId"].map((key) => ({ type: "done", sender: "operator", scope, [key]: "Bearer synthetic-token-123456" })),
      { type: "done", sender: "operator", scope: { ...scope, selector: ["Bearer synthetic-token-123456"] } },
      { type: "done", sender: "operator", scope, body: { password: { schema: "redacted_config_value.v0.1", value: "[redacted]", reason: "safe", updatedAt: "2026-02-29T01:02:03Z" } } },
      { type: "done", sender: "operator", scope, body: { password: { schema: "redacted_config_value.v0.1", value: "[redacted]", reason: "" } } },
      { type: "done", sender: "operator", scope, body: { nested: tooDeep } }]) {
      await expect(invoke("coordination_send_message", input)).rejects.toThrow();
      expect(await snapshot()).toBe(beforeInvalid);
    }
    await invoke("coordination_send_message", { type: "done", sender: "operator", scope });
    const normalized = JSON.parse(await service(`select json_build_object('column',to_char(created_at at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS"Z"'),'payload',payload->>'created_at')
      from public.coordination_inbox_messages where message_id='${futureId}'`, true));
    expect(normalized.column).toBe(normalized.payload);
    expect(Math.abs(Date.now() - Date.parse(normalized.column))).toBeLessThan(5000);
    for (const nested of [...corpus.allowed,
      { password: { schema: "redacted_config_value.v0.1", value: "[redacted]", reason: "synthetic_fixture", updatedAt: "2024-02-29T01:02:03.123+02:00" } },
      { password: { schema: "redacted_config_value.v0.1", value: "[redacted]", reason: "synthetic_fixture", updatedAt: "2026-10-03T01:02Z" } },
      Array.from({ length: 62 }).reduce<unknown>((nested) => ({ nested }), "safe")]) {
      await invoke("coordination_send_message", { type: "done", sender: "operator", scope, body: { nested } });
    }
    const readable = (await invoke("coordination_list_messages", { scope })).messages as unknown[];
    expect(readable).toHaveLength(corpus.allowed.length + 5);
    for (const message of readable) expect(coordinationMessageSchema.safeParse(message).success).toBe(true);
    const fixture = admittedClient();
    await expect(sql(fixture, "begin; set local role service_role; select public.coordination_send_message(" + json({ type: "done", sender: "operator", scope, body: {} }).replace(/"body":\{\}/, '"body":{"count":1e400}') + "); commit;", "guard_client", fixture.clientPassword)).rejects.toThrow();
    expect((await invoke("coordination_list_messages", { scope })).messages).toEqual(readable);
    await service("update public.coordination_inbox_messages set created_at=clock_timestamp()-interval '8 days'");
    await invoke("coordination_send_message", { type: "done", sender: "operator", scope, now: "2099-01-01T00:00:00Z" });
    await service(`insert into public.coordination_inbox_messages(message_id,message_type,sender,scope_kind,scope_selector,payload,created_at)
      select '${prefix}:'||n,'done','operator','path-set',array['${prefix}'],
        jsonb_build_object('schema','consiliency.coordination_message.v1','message_id','${prefix}:'||n,'type','done','sender','operator','scope',${json(scope)},
          'created_at',to_char(clock_timestamp() at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS"Z"')),clock_timestamp() from generate_series(1,9998) n`);
    const send = () => invoke("coordination_send_message", { type: "done", sender: "operator", scope });
    const boundary = await Promise.allSettled([send(), send()]);
    expect(boundary.filter((result) => result.status === "fulfilled")).toHaveLength(2);
    expect(boundary.filter((result) => result.status === "fulfilled" && result.value.failure === "capacity")).toHaveLength(1);
    expect(boundary.filter((result) => result.status === "fulfilled" && typeof result.value.createdAt === "string")).toHaveLength(1);
    const before = await service("select count(*)||'|'||md5(string_agg(message_id,',' order by message_id)) from public.coordination_inbox_messages", true);
    expect(before.startsWith("10000|")).toBe(true);
    expect(await send()).toEqual({ failure: "capacity" });
    expect(await service("select count(*)||'|'||md5(string_agg(message_id,',' order by message_id)) from public.coordination_inbox_messages", true)).toBe(before);
    expect((await invoke("coordination_list_messages", { scope })).messages as unknown[]).toHaveLength(100);
    await service(`update public.coordination_inbox_messages set created_at='2099-01-01T00:00:00Z',payload=jsonb_set(payload,'{created_at}','"2099-01-01T00:00:00Z"'::jsonb)`);
    const bodiesBefore = await service("select md5(string_agg((payload-'created_at')::text,',' order by message_id)) from public.coordination_inbox_messages", true);
    expect(await send()).toEqual({ failure: "capacity" });
    expect(await service("select count(*)||'|'||md5(string_agg(message_id,',' order by message_id)) from public.coordination_inbox_messages", true)).toBe(before);
    expect(await service("select md5(string_agg((payload-'created_at')::text,',' order by message_id)) from public.coordination_inbox_messages", true)).toBe(bodiesBefore);
    expect(await service(`select count(*) from public.coordination_inbox_messages where created_at<=clock_timestamp() and payload->>'created_at'=to_char(created_at at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS"Z"')`, true)).toBe("10000");
    await service("update public.coordination_inbox_messages set created_at=clock_timestamp()-interval '8 days'");
    expect((await invoke("coordination_list_messages", { scope })).messages).toEqual([]);
    expect(await service("select count(*) from public.coordination_inbox_messages", true)).toBe("10000");
    const receipt = await send();
    expect(Math.abs(Date.now() - Date.parse(receipt.createdAt as string))).toBeLessThan(5000);
    expect(await service("select count(*) from public.coordination_inbox_messages", true)).toBe("1");
  }, 30_000);

  it("COORD-DB-history-capacity", async () => {
    const prefix = "coord-history-" + randomUUID();
    const request = acquire(prefix, undefined, "soft");
    await invoke("coordination_acquire_lease", request);
    await service(`insert into public.coordination_lease_events(event_type,lease_id,holder,scope_kind,scope_selector,mode,ttl_seconds,heartbeat_at,payload,created_at)
      select 'renew',c.lease_id,c.holder,c.scope_kind,c.scope_selector,c.mode,c.ttl_seconds,c.heartbeat_at,c.payload,clock_timestamp()
      from public.coordination_current_leases c cross join generate_series(1,greatest(0,10000-(select count(*) from public.coordination_lease_events))) n where c.lease_id='${request.leaseId}'`);
    await invoke("coordination_renew_lease", { lease_id: request.leaseId, holder: prefix, ttl_seconds: 120 });
    expect(await service("select count(*) from public.coordination_lease_events", true)).toBe("10000");
    expect(await service(`select count(*) from public.coordination_lease_events where lease_id='${request.leaseId}' and event_type='acquire'`, true)).toBe("1");
    expect(await service(`select count(*) from public.coordination_lease_events e join public.coordination_current_leases c on c.lease_id=e.lease_id where c.lease_id='${request.leaseId}' and e.payload=c.payload`, true)).not.toBe("0");
  }, 30_000);
});
