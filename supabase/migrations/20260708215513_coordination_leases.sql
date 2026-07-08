create table if not exists public.coordination_lease_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in ('acquire', 'renew', 'release', 'expire')),
  lease_id text not null,
  holder text not null,
  repo_id text,
  scope_kind text not null check (scope_kind in ('repo', 'path-set', 'symbol')),
  scope_selector text[] not null,
  mode text check (mode in ('soft', 'hard')),
  ttl_seconds integer,
  heartbeat_at timestamptz,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.coordination_current_leases (
  lease_id text primary key,
  holder text not null,
  acquired_at timestamptz not null,
  ttl_seconds integer not null check (ttl_seconds > 0 and ttl_seconds <= 7200),
  heartbeat_at timestamptz not null,
  mode text not null check (mode in ('soft', 'hard')),
  scope_kind text not null check (scope_kind in ('repo', 'path-set', 'symbol')),
  scope_selector text[] not null,
  phase text not null,
  state text not null check (state in ('active', 'released', 'expired')),
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  released_at timestamptz
);

create table if not exists public.coordination_inbox_messages (
  message_id text primary key,
  message_type text not null check (message_type in ('request-yield', 'announce-intent', 'handoff', 'done')),
  sender text not null,
  target_holder text,
  lease_id text,
  handoff_packet_id text,
  scope_kind text not null check (scope_kind in ('repo', 'path-set', 'symbol')),
  scope_selector text[] not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz
);

create index if not exists coordination_current_leases_active_idx
  on public.coordination_current_leases (state, mode, scope_kind);

create index if not exists coordination_inbox_messages_scope_idx
  on public.coordination_inbox_messages (scope_kind, created_at);

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
        or rtrim(left_value, '/') like rtrim(right_value, '/') || '/%'
        or rtrim(right_value, '/') like rtrim(left_value, '/') || '/%'
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
  return jsonb_build_object('expired', expired_count);
end;
$$;

create or replace function public.coordination_acquire_lease(request jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  now_at timestamptz := coalesce((request->>'now')::timestamptz, now());
  lease_id text := coalesce(request->>'leaseId', 'lease:' || gen_random_uuid()::text);
  holder text := request->>'holder';
  ttl_seconds integer := (request->>'ttlSeconds')::integer;
  lease_mode text := request->>'mode';
  phase text := request->>'phase';
  scope_kind text := request #>> '{scope,granularity}';
  scope_selector text[] := array(select jsonb_array_elements_text(request #> '{scope,selector}'));
  lease_payload jsonb;
  conflict_payload jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('coordination_acquire_lease:v1'));
  perform public.coordination_expire_leases(now_at);

  select payload into conflict_payload
    from public.coordination_current_leases
   where state = 'active'
     and mode = 'hard'
     and lease_mode = 'hard'
     and public.coordination_scope_overlaps(scope_kind, scope_selector, coordination_current_leases.scope_kind, coordination_current_leases.scope_selector)
   order by updated_at asc
   limit 1;

  if conflict_payload is not null then
    return jsonb_build_object('granted', false, 'failure', 'conflict', 'conflict', conflict_payload);
  end if;

  lease_payload := jsonb_build_object(
    'schema', 'consiliency.lease.v1',
    'lease_id', lease_id,
    'holder', holder,
    'acquired_at', to_char(now_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'ttl_seconds', ttl_seconds,
    'heartbeat_at', to_char(now_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'mode', lease_mode,
    'scope', jsonb_build_object('granularity', scope_kind, 'selector', to_jsonb(scope_selector)),
    'phase', phase
  );

  insert into public.coordination_current_leases (
    lease_id,
    holder,
    acquired_at,
    ttl_seconds,
    heartbeat_at,
    mode,
    scope_kind,
    scope_selector,
    phase,
    state,
    payload,
    updated_at
  ) values (
    lease_id,
    holder,
    now_at,
    ttl_seconds,
    now_at,
    lease_mode,
    scope_kind,
    scope_selector,
    phase,
    'active',
    lease_payload,
    now_at
  );

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
  ) values (
    'acquire',
    lease_id,
    holder,
    scope_kind,
    scope_selector,
    lease_mode,
    ttl_seconds,
    now_at,
    lease_payload,
    now_at
  );

  return jsonb_build_object('granted', true, 'lease', lease_payload);
end;
$$;

create or replace function public.coordination_renew_lease(request jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  now_at timestamptz := coalesce((request->>'now')::timestamptz, now());
  lease_row public.coordination_current_leases%rowtype;
  renewed_payload jsonb;
begin
  perform public.coordination_expire_leases(now_at);
  select * into lease_row from public.coordination_current_leases
    where lease_id = request->>'lease_id';

  if not found then
    return jsonb_build_object('renewed', false, 'failure', 'not-found');
  end if;
  if lease_row.state <> 'active' then
    return jsonb_build_object('renewed', false, 'failure', 'expired');
  end if;
  if lease_row.holder <> request->>'holder' then
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
  now_at timestamptz := coalesce((request->>'now')::timestamptz, now());
  lease_row public.coordination_current_leases%rowtype;
begin
  select * into lease_row from public.coordination_current_leases
    where lease_id = request->>'lease_id';

  if not found then
    return jsonb_build_object('released', true, 'failure', 'not-found');
  end if;
  if lease_row.holder <> request->>'holder' then
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

  return jsonb_build_object('released', true);
end;
$$;

create or replace function public.coordination_query_leases(request jsonb default '{}'::jsonb)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'leases',
    coalesce(jsonb_agg(payload order by lease_id), '[]'::jsonb)
  )
  from public.coordination_current_leases
  where state = 'active'
    and (
      request->>'include_expired' = 'true'
      or coalesce((request->>'now')::timestamptz, now()) < heartbeat_at + make_interval(secs => ttl_seconds)
    )
    and (request->>'lease_id' is null or lease_id = request->>'lease_id')
    and (
      request->'scope' is null
      or public.coordination_scope_overlaps(
        scope_kind,
        scope_selector,
        request #>> '{scope,granularity}',
        array(select jsonb_array_elements_text(request #> '{scope,selector}'))
      )
    );
$$;

create or replace function public.coordination_send_message(message jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  now_at timestamptz := coalesce((message->>'now')::timestamptz, now());
  message_id text := 'msg:' || gen_random_uuid()::text;
  payload jsonb;
begin
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
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'messages',
    coalesce(jsonb_agg(payload order by created_at), '[]'::jsonb)
  )
  from public.coordination_inbox_messages
  where (query->>'type' is null or message_type = query->>'type')
    and (
      query->'scope' is null
      or public.coordination_scope_overlaps(
        scope_kind,
        scope_selector,
        query #>> '{scope,granularity}',
        array(select jsonb_array_elements_text(query #> '{scope,selector}'))
      )
    );
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
