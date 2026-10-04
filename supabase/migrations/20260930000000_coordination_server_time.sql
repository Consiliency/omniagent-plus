begin;

create or replace function public.coordination_page_limit(query jsonb)
returns integer language plpgsql immutable set search_path = public, pg_temp as $$
declare
  page_limit numeric := 100;
  cursor_value jsonb := query->'cursor';
begin
  if query is null or jsonb_typeof(query) <> 'object' then raise exception 'Invalid coordination page' using errcode='22023'; end if;
  if query ? 'limit' then
    if jsonb_typeof(query->'limit') <> 'number' then raise exception 'Invalid coordination limit' using errcode='22023'; end if;
    page_limit := (query->>'limit')::numeric;
    if page_limit < 1 or page_limit > 500 or page_limit <> trunc(page_limit) then raise exception 'Invalid coordination limit' using errcode='22023'; end if;
  end if;
  if query ? 'cursor' then
    if jsonb_typeof(cursor_value) is distinct from 'object' or jsonb_typeof(cursor_value->'timestamp') is distinct from 'string'
      or jsonb_typeof(cursor_value->'id') is distinct from 'string' or length(cursor_value->>'id') = 0
      or (cursor_value->>'timestamp') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$'
      or (select count(*) from jsonb_object_keys(cursor_value)) <> 2 then
      raise exception 'Invalid coordination cursor' using errcode='22023';
    end if;
    perform (cursor_value->>'timestamp')::timestamptz;
  end if;
  return page_limit::integer;
end;
$$;

create or replace function public.coordination_lease_payload(lease public.coordination_current_leases)
returns jsonb language sql stable set search_path = public, pg_temp as $$
  select jsonb_build_object('schema','consiliency.lease.v1','lease_id',lease.lease_id,'holder',lease.holder,
    'acquired_at',to_char(lease.acquired_at at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'ttl_seconds',lease.ttl_seconds,'heartbeat_at',to_char(lease.heartbeat_at at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'mode',lease.mode,'scope',jsonb_build_object('granularity',lease.scope_kind,'selector',to_jsonb(lease.scope_selector)),'phase',lease.phase);
$$;

create or replace function public.coordination_prune_history()
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare protected_ids uuid[];
begin
  select array_agg(id) into protected_ids from (
    select distinct on (e.lease_id) e.id from public.coordination_lease_events e
      join public.coordination_current_leases c on c.lease_id=e.lease_id and c.state='active' and e.payload=c.payload
      order by e.lease_id, e.created_at desc, e.id desc
  ) latest;
  select coalesce(protected_ids,'{}'::uuid[]) || coalesce(array_agg(id),'{}'::uuid[]) into protected_ids from (
    select distinct on (e.lease_id) e.id from public.coordination_lease_events e
      join public.coordination_current_leases c on c.lease_id=e.lease_id and c.state='active'
      where e.event_type='acquire' and e.holder=c.holder
        and e.payload->>'acquired_at'=c.payload->>'acquired_at'
      order by e.lease_id,e.created_at desc,e.id desc
  ) acquisitions;
  delete from public.coordination_lease_events where id in (
    select id from public.coordination_lease_events where not (id=any(protected_ids))
      order by created_at,id limit greatest(0,(select count(*) from public.coordination_lease_events)-10000)
  );
  if (select count(*) from public.coordination_lease_events)>10000 then raise exception 'Coordination protected capacity exceeded' using errcode='P0001'; end if;
  delete from public.coordination_current_leases where lease_id in (
    select lease_id from public.coordination_current_leases where state<>'active'
      order by updated_at,lease_id collate "C" limit greatest(0,(select count(*) from public.coordination_current_leases)-10000)
  );
  if (select count(*) from public.coordination_current_leases)>10000 then raise exception 'Coordination protected capacity exceeded' using errcode='P0001'; end if;
end;
$$;

update public.coordination_inbox_messages set created_at=date_trunc('second',least(created_at,statement_timestamp()));
update public.coordination_inbox_messages set payload=jsonb_set(payload,'{created_at}',to_jsonb(to_char(created_at at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS"Z"')));

create or replace function public.coordination_scope_overlaps(
  left_kind text,
  left_selector text[],
  right_kind text,
  right_selector text[]
) returns boolean
language plpgsql
stable
as $$
declare
  left_value text;
  right_value text;
begin
  if left_kind = 'repo' or right_kind = 'repo' then
    return true;
  end if;

  if left_kind <> right_kind then
    return false;
  end if;

  foreach left_value in array left_selector loop
    foreach right_value in array right_selector loop
      if left_kind = 'symbol' and left_value = right_value then
        return true;
      end if;
      if left_kind = 'path-set' and (
        rtrim(left_value, '/') = rtrim(right_value, '/')
        or starts_with(rtrim(left_value, '/'), rtrim(right_value, '/') || '/')
        or starts_with(rtrim(right_value, '/'), rtrim(left_value, '/') || '/')
      ) then
        return true;
      end if;
    end loop;
  end loop;

  return false;
end;
$$;

create or replace function public.coordination_expire_leases(now_at timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  expired_count integer;
begin
  perform pg_advisory_xact_lock(hashtext('coordination_acquire_lease:v1'));
  now_at := date_trunc('second',clock_timestamp());

  with expired as (
    update public.coordination_current_leases
       set state = 'expired',
           updated_at = now_at
     where state = 'active'
       and now_at >= heartbeat_at + make_interval(secs => ttl_seconds)
     returning *
  )
  insert into public.coordination_lease_events (
    event_type,
    lease_id,
    holder,
    scope_kind,
    scope_selector,
    mode,
    ttl_seconds,
    heartbeat_at,
    payload,
    created_at
  )
  select
    'expire',
    lease_id,
    holder,
    scope_kind,
    scope_selector,
    mode,
    ttl_seconds,
    heartbeat_at,
    payload,
    now_at
  from expired;

  get diagnostics expired_count = row_count;
  perform public.coordination_prune_history();
  return jsonb_build_object('expired', expired_count);
end;
$$;

create or replace function public.coordination_acquire_lease(request jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  now_at timestamptz;
  requested_id text := coalesce(request->>'leaseId','lease:'||gen_random_uuid()::text);
  requested_holder text := request->>'holder';
  requested_ttl integer := (request->>'ttlSeconds')::integer;
  requested_mode text := request->>'mode';
  requested_phase text := request->>'phase';
  requested_kind text := request #>> '{scope,granularity}';
  requested_selector text[] := array(select jsonb_array_elements_text(request #> '{scope,selector}'));
  lease_payload jsonb;
  conflict_payload jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('coordination_acquire_lease:v1'));
  now_at := date_trunc('second',clock_timestamp());
  perform public.coordination_expire_leases(now_at);
  now_at := date_trunc('second',clock_timestamp());
  select public.coordination_lease_payload(c) into conflict_payload from public.coordination_current_leases c
    where c.lease_id=requested_id and c.state='active' limit 1;
  if conflict_payload is not null then return jsonb_build_object('granted',false,'failure','conflict','conflict',conflict_payload); end if;
  select public.coordination_lease_payload(c) into conflict_payload from public.coordination_current_leases c
    where c.state='active' and c.mode='hard' and requested_mode='hard'
      and public.coordination_scope_overlaps(requested_kind,requested_selector,c.scope_kind,c.scope_selector)
    order by c.updated_at,c.lease_id collate "C" limit 1;
  if conflict_payload is not null then return jsonb_build_object('granted',false,'failure','conflict','conflict',conflict_payload); end if;
  lease_payload := jsonb_build_object('schema','consiliency.lease.v1','lease_id',requested_id,'holder',requested_holder,
    'acquired_at',to_char(now_at at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS"Z"'),'ttl_seconds',requested_ttl,
    'heartbeat_at',to_char(now_at at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS"Z"'),'mode',requested_mode,
    'scope',jsonb_build_object('granularity',requested_kind,'selector',to_jsonb(requested_selector)),'phase',requested_phase);
  insert into public.coordination_current_leases(lease_id,holder,acquired_at,ttl_seconds,heartbeat_at,mode,scope_kind,scope_selector,phase,state,payload,updated_at)
    values(requested_id,requested_holder,now_at,requested_ttl,now_at,requested_mode,requested_kind,requested_selector,requested_phase,'active',lease_payload,now_at)
    on conflict(lease_id) do update set holder=excluded.holder,acquired_at=excluded.acquired_at,ttl_seconds=excluded.ttl_seconds,
      heartbeat_at=excluded.heartbeat_at,mode=excluded.mode,scope_kind=excluded.scope_kind,scope_selector=excluded.scope_selector,
      phase=excluded.phase,state='active',payload=excluded.payload,updated_at=excluded.updated_at,released_at=null;
  insert into public.coordination_lease_events(event_type,lease_id,holder,scope_kind,scope_selector,mode,ttl_seconds,heartbeat_at,payload,created_at)
    values('acquire',requested_id,requested_holder,requested_kind,requested_selector,requested_mode,requested_ttl,now_at,lease_payload,now_at);
  perform public.coordination_prune_history();
  return jsonb_build_object('granted',true,'lease',lease_payload);
end;
$$;

create or replace function public.coordination_renew_lease(request jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  now_at timestamptz;
  lease_row public.coordination_current_leases%rowtype;
  renewed_payload jsonb;
begin
  if jsonb_typeof(request->'holder') is distinct from 'string' or length(request->>'holder') = 0 then
    return jsonb_build_object('renewed',false,'failure','not-holder');
  end if;
  perform pg_advisory_xact_lock(hashtext('coordination_acquire_lease:v1'));
  now_at := date_trunc('second',clock_timestamp());
  perform public.coordination_expire_leases(now_at);
  now_at := date_trunc('second',clock_timestamp());
  select * into lease_row from public.coordination_current_leases
    where lease_id = request->>'lease_id';

  if not found then
    return jsonb_build_object('renewed', false, 'failure', 'not-found');
  end if;
  if lease_row.state <> 'active' then
    return jsonb_build_object('renewed', false, 'failure', 'expired');
  end if;
  if lease_row.holder is distinct from request->>'holder' then
    return jsonb_build_object('renewed', false, 'failure', 'not-holder');
  end if;

  renewed_payload := jsonb_set(
    jsonb_set(
      lease_row.payload,
      '{heartbeat_at}',
      to_jsonb(to_char(now_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
    ),
    '{ttl_seconds}',
    to_jsonb(coalesce((request->>'ttl_seconds')::integer, lease_row.ttl_seconds))
  );

  update public.coordination_current_leases
     set heartbeat_at = now_at,
         ttl_seconds = coalesce((request->>'ttl_seconds')::integer, lease_row.ttl_seconds),
         payload = renewed_payload,
         updated_at = now_at
   where lease_id = lease_row.lease_id;

  insert into public.coordination_lease_events (
    event_type, lease_id, holder, scope_kind, scope_selector, mode, ttl_seconds,
    heartbeat_at, payload, created_at
  ) values (
    'renew', lease_row.lease_id, lease_row.holder, lease_row.scope_kind,
    lease_row.scope_selector, lease_row.mode,
    coalesce((request->>'ttl_seconds')::integer, lease_row.ttl_seconds),
    now_at, renewed_payload, now_at
  );

  perform public.coordination_prune_history();
  return jsonb_build_object('renewed', true, 'lease', renewed_payload);
end;
$$;

create or replace function public.coordination_release_lease(request jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  now_at timestamptz;
  lease_row public.coordination_current_leases%rowtype;
begin
  if jsonb_typeof(request->'holder') is distinct from 'string' or length(request->>'holder') = 0 then
    return jsonb_build_object('released',false,'failure','not-holder');
  end if;
  perform pg_advisory_xact_lock(hashtext('coordination_acquire_lease:v1'));
  now_at := date_trunc('second',clock_timestamp());

  select * into lease_row from public.coordination_current_leases
    where lease_id = request->>'lease_id';

  if not found then
    return jsonb_build_object('released', true, 'failure', 'not-found');
  end if;
  if lease_row.holder is distinct from request->>'holder' then
    return jsonb_build_object('released', false, 'failure', 'not-holder');
  end if;

  update public.coordination_current_leases
     set state = 'released',
         released_at = now_at,
         updated_at = now_at
   where lease_id = lease_row.lease_id;

  insert into public.coordination_lease_events (
    event_type, lease_id, holder, scope_kind, scope_selector, mode, ttl_seconds,
    heartbeat_at, payload, created_at
  ) values (
    'release', lease_row.lease_id, lease_row.holder, lease_row.scope_kind,
    lease_row.scope_selector, lease_row.mode, lease_row.ttl_seconds,
    lease_row.heartbeat_at, lease_row.payload, now_at
  );

  perform public.coordination_prune_history();
  return jsonb_build_object('released', true);
end;
$$;

create or replace function public.coordination_query_leases(request jsonb default '{}'::jsonb)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('leases',coalesce(jsonb_agg(payload order by ordered_at,lease_id collate "C"),'[]'::jsonb))
  from (
    select public.coordination_lease_payload(c) as payload,date_trunc('second',c.acquired_at) as ordered_at,c.lease_id
    from public.coordination_current_leases c
    where c.state='active'
      and (request->>'include_expired'='true' or statement_timestamp()<c.heartbeat_at+make_interval(secs=>c.ttl_seconds))
      and (request->>'lease_id' is null or c.lease_id=request->>'lease_id')
      and (request->>'mode' is null or c.mode=request->>'mode')
      and (request->'scope' is null or public.coordination_scope_overlaps(c.scope_kind,c.scope_selector,
        request #>> '{scope,granularity}',array(select jsonb_array_elements_text(request #> '{scope,selector}'))))
      and (request->'cursor' is null or request->'cursor'='null'::jsonb
        or (date_trunc('second',c.acquired_at),c.lease_id collate "C")>((request #>> '{cursor,timestamp}')::timestamptz,(request #>> '{cursor,id}') collate "C"))
    order by date_trunc('second',c.acquired_at),c.lease_id collate "C" limit public.coordination_page_limit(request)
  ) page;
$$;

create or replace function public.coordination_send_message(message jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  now_at timestamptz;
  message_id text := 'msg:' || gen_random_uuid()::text;
  payload jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('coordination_inbox:v1'));
  now_at := date_trunc('second',clock_timestamp());
  update public.coordination_inbox_messages as inbox set created_at=now_at,
    payload=jsonb_set(inbox.payload,'{created_at}',to_jsonb(to_char(now_at at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS"Z"'))) where inbox.created_at>now_at;
  delete from public.coordination_inbox_messages where created_at<=now_at-interval '7 days';
  if (select count(*) from public.coordination_inbox_messages)>=10000 then return jsonb_build_object('failure','capacity'); end if;
  payload := jsonb_build_object(
    'schema', 'consiliency.coordination_message.v1',
    'message_id', message_id,
    'type', message->>'type',
    'sender', message->>'sender',
    'created_at', to_char(now_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'scope', message->'scope',
    'target_holder', message->>'targetHolder',
    'lease_id', message->>'leaseId',
    'handoff_packet_id', message->>'handoffPacketId',
    'body', message->'body'
  );

  insert into public.coordination_inbox_messages (
    message_id,
    message_type,
    sender,
    target_holder,
    lease_id,
    handoff_packet_id,
    scope_kind,
    scope_selector,
    payload,
    created_at
  ) values (
    message_id,
    message->>'type',
    message->>'sender',
    message->>'targetHolder',
    message->>'leaseId',
    message->>'handoffPacketId',
    message #>> '{scope,granularity}',
    array(select jsonb_array_elements_text(message #> '{scope,selector}')),
    jsonb_strip_nulls(payload),
    now_at
  );

  return jsonb_build_object('messageId', message_id, 'createdAt', to_char(now_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
end;
$$;

create or replace function public.coordination_list_messages(query jsonb default '{}'::jsonb)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('messages',coalesce(jsonb_agg(payload order by ordered_at,message_id collate "C"),'[]'::jsonb))
  from (
    select jsonb_set(m.payload,'{created_at}',to_jsonb(to_char(m.created_at at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS"Z"'))) as payload,
      date_trunc('second',m.created_at) as ordered_at,m.message_id
    from public.coordination_inbox_messages m
    where m.created_at>statement_timestamp()-interval '7 days'
      and (query->>'type' is null or m.message_type=query->>'type')
      and (query->'scope' is null or public.coordination_scope_overlaps(m.scope_kind,m.scope_selector,
        query #>> '{scope,granularity}',array(select jsonb_array_elements_text(query #> '{scope,selector}'))))
      and (query->'cursor' is null or query->'cursor'='null'::jsonb
        or (date_trunc('second',m.created_at),m.message_id collate "C")>((query #>> '{cursor,timestamp}')::timestamptz,(query #>> '{cursor,id}') collate "C"))
    order by date_trunc('second',m.created_at),m.message_id collate "C" limit public.coordination_page_limit(query)
  ) page;
$$;

alter table public.coordination_lease_events enable row level security;
alter table public.coordination_current_leases enable row level security;
alter table public.coordination_inbox_messages enable row level security;

revoke all on table public.coordination_lease_events from public, anon, authenticated;
revoke all on table public.coordination_current_leases from public, anon, authenticated;
revoke all on table public.coordination_inbox_messages from public, anon, authenticated;

grant select, insert, update on table public.coordination_lease_events to service_role;
grant select, insert, update on table public.coordination_current_leases to service_role;
grant select, insert, update on table public.coordination_inbox_messages to service_role;

revoke all on function public.coordination_expire_leases(timestamptz) from public, anon, authenticated;
revoke all on function public.coordination_acquire_lease(jsonb) from public, anon, authenticated;
revoke all on function public.coordination_renew_lease(jsonb) from public, anon, authenticated;
revoke all on function public.coordination_release_lease(jsonb) from public, anon, authenticated;
revoke all on function public.coordination_query_leases(jsonb) from public, anon, authenticated;
revoke all on function public.coordination_send_message(jsonb) from public, anon, authenticated;
revoke all on function public.coordination_list_messages(jsonb) from public, anon, authenticated;

grant execute on function public.coordination_expire_leases(timestamptz) to service_role;
grant execute on function public.coordination_acquire_lease(jsonb) to service_role;
grant execute on function public.coordination_renew_lease(jsonb) to service_role;
grant execute on function public.coordination_release_lease(jsonb) to service_role;
grant execute on function public.coordination_query_leases(jsonb) to service_role;
grant execute on function public.coordination_send_message(jsonb) to service_role;
grant execute on function public.coordination_list_messages(jsonb) to service_role;

do $$
declare routine record;
begin
  for routine in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'coordination\_%' escape '\' loop
    execute format('revoke all on function %s from public, anon, authenticated',routine.signature);
    execute format('grant execute on function %s to service_role',routine.signature);
  end loop;
end;
$$;

commit;
