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
  field_name text;
  metadata_nodes jsonb[] := array[message];
  metadata_depths integer[] := array[0];
  metadata_keys boolean[] := array[false];
  metadata_index integer := 1;
  metadata_value jsonb;
  metadata_text text;
  metadata_depth integer;
  metadata_is_key boolean;
  metadata_item record;
  normalized_key text;
  placeholder boolean;
  encoded_value jsonb;
  encoded_text text;
  encoded_valid boolean;
  encoded_token text;
  encoded_source text;
  encoded_escape text;
  encoded_string text;
  encoded_states integer[];
  encoded_level integer;
  encoded_state integer;
  encoded_skip integer;
  encoded_folded text;
  number_finite boolean;
  guard_namespace text := '';
  guard_nonce text := replace(gen_random_uuid()::text,'-','');
  guard_nonfinite text;
  number_digits text;
  number_significand text;
  number_exponent text;
  number_order bigint;
  metadata_space text := E'\u0009\u000a\u000d\u000c\u000b\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff';
  metadata_scan_text text;
begin
  for metadata_index in 1..length(guard_nonce) loop
    guard_namespace := guard_namespace || chr(57600+strpos('0123456789abcdef',substring(guard_nonce,metadata_index,1))-1);
  end loop;
  metadata_index := 1;
  guard_nonfinite := chr(3)||guard_namespace||chr(4);
  if jsonb_typeof(message) is distinct from 'object'
    or jsonb_typeof(message->'type') is distinct from 'string' or message->>'type' not in ('request-yield','announce-intent','handoff','done')
    or jsonb_typeof(message->'sender') is distinct from 'string' or length(message->>'sender')=0
    or jsonb_typeof(message->'scope') is distinct from 'object'
    or jsonb_typeof(message #> '{scope,granularity}') is distinct from 'string' or message #>> '{scope,granularity}' not in ('repo','path-set','symbol')
    or jsonb_typeof(message #> '{scope,selector}') is distinct from 'array' then
    raise exception 'Invalid coordination message' using errcode='22023';
  end if;
  if jsonb_array_length(message #> '{scope,selector}')=0 or exists (
    select 1 from jsonb_array_elements(message #> '{scope,selector}') as item(value)
    where jsonb_typeof(value) is distinct from 'string' or length(value #>> '{}')=0
      or left(value #>> '{}',1)='/' or value #>> '{}' ~ '(^|/)[.][.](/|$)'
      or (left(value #>> '{}',2) ~ '^[A-Za-z]:$' and substring(value #>> '{}',3,1) in ('/',chr(92)))
  ) then raise exception 'Invalid coordination scope' using errcode='22023'; end if;
  foreach field_name in array array['targetHolder','leaseId','handoffPacketId'] loop
    if message ? field_name and (jsonb_typeof(message->field_name) is distinct from 'string' or length(message->>field_name)=0) then
      raise exception 'Invalid coordination identifier' using errcode='22023';
    end if;
  end loop;
  if message ? 'body' and jsonb_typeof(message->'body') is distinct from 'object' then
    raise exception 'Invalid coordination body' using errcode='22023';
  end if;
  while metadata_index <= cardinality(metadata_nodes) loop
    metadata_value := metadata_nodes[metadata_index];
    metadata_depth := metadata_depths[metadata_index];
    metadata_is_key := metadata_keys[metadata_index];
    metadata_index := metadata_index + 1;
    if metadata_depth > 64 then raise exception 'Invalid coordination metadata' using errcode='22023'; end if;
    if jsonb_typeof(metadata_value)='string' then
      metadata_text := metadata_value #>> '{}';
      if metadata_text=guard_nonfinite then raise exception 'Invalid coordination metadata' using errcode='22023'; end if;
      metadata_scan_text := translate(metadata_text,metadata_space,repeat(' ',length(metadata_space)));
      if metadata_scan_text collate "C" ~* $metadata$\ybearer\s+[a-z0-9._~+/=-]{8,}|\y(?:(?:sk-|gh[pousr]_|xox[baprs]?-|glpat-|AIza)[a-z0-9._-]{8,}|npm_[a-z0-9]{8,})\y|(?<![a-z0-9_])(?:[a-z][a-z0-9_]*_)?(?:password|passwd|token|credential|authorization|api_key|access_key|client_secret|secret_key|service_role_key|secret)\s*(?:=|:)\s*\S+|\yOMNIGENT_[A-Z0-9_]*(?:API_KEY|TOKEN|SECRET|CREDENTIAL|PASSWORD|KEY)\s*=\s*\S+|\yeyJ[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}\y|\y(?:authorization|x-api-key|cookie)\s*:\s*\S+|\y[a-z][a-z0-9+.-]*://[^/\s@]+:[^/\s@]+@|(?:/(?:home|Users)/[^/\s]+|[A-Z]:[\\/]Users[\\/][^\\/\s]+)|(?:^|[^a-z0-9_.-])[.]recovery(?:[\\/]|$|[^a-z0-9_.-])$metadata$
        or metadata_text collate "C" ~ $metadata$-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----|\yAKIA[0-9A-Z]{16}\y$metadata$
        or (not metadata_is_key and metadata_text collate "C" ~ $metadata$(^|[\n\r\u2028\u2029])(?:HOME|PATH|PWD|OPENAI_API_KEY|ANTHROPIC_API_KEY|GOOGLE_API_KEY|AZURE_OPENAI_API_KEY|OMNIGENT_[A-Z0-9_]*(?:API_KEY|TOKEN|SECRET|CREDENTIAL|PASSWORD|KEY))=$metadata$) then
        raise exception 'Invalid coordination metadata' using errcode='22023';
      end if;
      if not metadata_is_key and left(ltrim(metadata_text,E' \t\n\r'),1) in ('"','{','[') then
        encoded_valid := true;
        encoded_source := metadata_text;
        begin perform metadata_text::json;
        exception when invalid_text_representation then encoded_valid := false;
          when program_limit_exceeded then
            encoded_states := array[1];
            encoded_level := 1;
            encoded_skip := 0;
            encoded_folded := '';
            for encoded_token in select matches[1] from regexp_matches(metadata_text,$syntax$("(?:[^"\\\x00-\x1f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?|true|false|null|[ \t\n\r]+|.)$syntax$,'g') as item(matches) loop
              if encoded_token ~ E'^[ \\t\\n\\r]+$' then continue; end if;
              encoded_state := encoded_states[encoded_level];
              if encoded_state in (6,7) and left(encoded_token,1)='"' and length(encoded_token)>1 then
                encoded_states[encoded_level] := 8;
              elsif encoded_state=8 and encoded_token=':' then
                encoded_states[encoded_level] := 9;
              elsif (encoded_state=5 and encoded_token=',') or (encoded_state=10 and encoded_token=',') then
                encoded_states[encoded_level] := case when encoded_state=5 then 4 else 7 end;
              elsif (encoded_state in (3,5) and encoded_token=']') or (encoded_state in (6,10) and encoded_token='}') then
                encoded_level := encoded_level-1;
                if encoded_skip>0 and encoded_level<encoded_skip then encoded_skip:=0; continue; end if;
              elsif encoded_state in (1,3,4,9) and (
                encoded_token in ('[','{','true','false','null') or (left(encoded_token,1)='"' and length(encoded_token)>1)
                or encoded_token collate "C" ~ '^-?[0-9]') then
                encoded_states[encoded_level] := case when encoded_state=1 then 2 when encoded_state=9 then 10 else 5 end;
                if encoded_token in ('[','{') then
                  if encoded_skip=0 and metadata_depth+encoded_level>64 then
                    encoded_folded := encoded_folded || to_jsonb(guard_nonfinite)::text;
                    encoded_skip := encoded_level+1;
                  end if;
                  encoded_level := encoded_level+1;
                  encoded_states[encoded_level] := case when encoded_token='[' then 3 else 6 end;
                end if;
              else encoded_valid := false; exit; end if;
              if encoded_skip=0 then encoded_folded := encoded_folded || encoded_token; end if;
            end loop;
            encoded_valid := encoded_valid and encoded_level=1 and encoded_states[1]=2;
            encoded_source := encoded_folded;
        end;
        encoded_text := '';
        if encoded_valid then
          for encoded_escape in select matches[1] from regexp_matches(metadata_text,guard_namespace||E'([\ue800-\uefff])','g') as item(matches) loop
            encoded_source := replace(encoded_source,guard_namespace||encoded_escape,chr(92)||'u'||to_hex(55296+ascii(encoded_escape)-59392));
          end loop;
          for encoded_token in select matches[1] from regexp_matches(encoded_source,$json$("(?:[^"\\]|\\.)*"|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?|[^"0-9-]+|.)$json$,'g') as item(matches) loop
            if encoded_token collate "C" ~ '^-?[0-9]' then
              number_significand := split_part(lower(ltrim(encoded_token,'-')),'e',1);
              number_digits := replace(number_significand,'.','');
              number_exponent := split_part(lower(encoded_token),'e',2);
              number_order := case when length(ltrim(number_exponent,'+-0'))>9
                then case when left(number_exponent,1)='-' then -1000000000000 else 1000000000000 end
                else coalesce(nullif(number_exponent,'')::bigint,0) end
                + case when strpos(number_significand,'.')>0 then strpos(number_significand,'.')-1 else length(number_significand) end
                - coalesce(nullif(strpos(number_digits,substring(number_digits from '[1-9]')),0),length(number_digits)+1);
              number_finite := number_digits !~ '[1-9]' or number_order<=308;
              if number_digits ~ '[1-9]' and number_order=308 then
                begin perform encoded_token::double precision;
                exception when numeric_value_out_of_range then number_finite := false; end;
              end if;
              encoded_text := encoded_text || case when number_finite then '0' else to_jsonb(guard_nonfinite)::text end;
            elsif left(encoded_token,1)='"' then
              encoded_string := '';
              for encoded_escape in select matches[1] from regexp_matches(encoded_token,$unicode$(\\u[dD][89aAbB][0-9a-fA-F]{2}\\u[dD][cCdDeEfF][0-9a-fA-F]{2}|\\u[dD][89aAbBcCdDeEfF][0-9a-fA-F]{2}|\\u0000|\\.|[^\\]+)$unicode$,'g') as item(matches) loop
                if encoded_escape=chr(92)||'u0000' then
                  encoded_string := encoded_string || chr(92)||'u0001'||guard_namespace||chr(92)||'u0002';
                elsif length(encoded_escape)=6 and left(encoded_escape,2)=chr(92)||'u' and lower(substring(encoded_escape,3,1))='d' then
                  encoded_string := encoded_string || guard_namespace||chr(59392+('x'||substring(encoded_escape,3,4))::bit(16)::integer-55296);
                else encoded_string := encoded_string || encoded_escape; end if;
              end loop;
              encoded_text := encoded_text || encoded_string;
            else encoded_text := encoded_text || encoded_token; end if;
          end loop;
          encoded_value := encoded_text::jsonb;
        end if;
        if encoded_valid and jsonb_typeof(encoded_value) in ('string','object','array') then
          metadata_nodes := array_append(metadata_nodes,encoded_value);
          metadata_depths := array_append(metadata_depths,metadata_depth+1);
          metadata_keys := array_append(metadata_keys,false);
        end if;
      end if;
    elsif jsonb_typeof(metadata_value)='number' and abs((metadata_value #>> '{}')::numeric)>=1 then
      begin perform (metadata_value #>> '{}')::double precision;
      exception when numeric_value_out_of_range then raise exception 'Invalid coordination metadata' using errcode='22023'; end;
    elsif jsonb_typeof(metadata_value)='array' then
      for metadata_item in select value from jsonb_array_elements(metadata_value) loop
        metadata_nodes := array_append(metadata_nodes,metadata_item.value);
        metadata_depths := array_append(metadata_depths,metadata_depth+1);
        metadata_keys := array_append(metadata_keys,false);
      end loop;
    elsif jsonb_typeof(metadata_value)='object' then
      if jsonb_typeof(metadata_value->'anthropic_version')='string' or jsonb_typeof(metadata_value->'providerPayload')='object'
        or exists (select 1 from jsonb_array_elements(case when jsonb_typeof(metadata_value->'choices')='array' then metadata_value->'choices' else '[]'::jsonb end) as item(value)
          where jsonb_typeof(value)='object' and (value ? 'message' or value ? 'delta'))
        or exists (select 1 from jsonb_array_elements(case when jsonb_typeof(metadata_value->'messages')='array' then metadata_value->'messages' else '[]'::jsonb end) as item(value)
          where jsonb_typeof(value)='object' and value ? 'role')
        or exists (select 1 from jsonb_array_elements(case when jsonb_typeof(metadata_value->'candidates')='array' then metadata_value->'candidates' else '[]'::jsonb end) as item(value)
          where jsonb_typeof(value)='object' and value ? 'content') then
        raise exception 'Invalid coordination metadata' using errcode='22023';
      end if;
      for metadata_item in select key,value from jsonb_each(metadata_value) loop
        normalized_key := lower(regexp_replace(metadata_item.key collate "C",'[^a-zA-Z0-9]','','g'));
        placeholder := false;
        if jsonb_typeof(metadata_item.value)='object' then
          placeholder := coalesce(metadata_item.value->>'schema'='redacted_config_value.v0.1' and metadata_item.value->>'value'='[redacted]'
            and jsonb_typeof(metadata_item.value->'reason')='string' and length(metadata_item.value->>'reason')>0
            and metadata_item.value-array['schema','value','reason','updatedAt']='{}'::jsonb
            and (not metadata_item.value ? 'updatedAt' or (jsonb_typeof(metadata_item.value->'updatedAt')='string'
              and metadata_item.value->>'updatedAt' collate "C" ~ $timestamp$^((\d\d[2468][048]|\d\d[13579][26]|\d\d0[48]|[02468][048]00|[13579][26]00)-02-29|\d{4}-((0[13578]|1[02])-(0[1-9]|[12]\d|3[01])|(0[469]|11)-(0[1-9]|[12]\d|30)|(02)-(0[1-9]|1\d|2[0-8])))T([01]\d|2[0-3]):[0-5]\d(:[0-5]\d(\.\d+)?)?(Z|([+-]\d{2}:?\d{2}))($)$timestamp$)),false);
          if metadata_item.key in ('env','environment') and metadata_item.value<>'{}'::jsonb and not placeholder
            and not exists (select 1 from jsonb_each(metadata_item.value) as item(key,value) where jsonb_typeof(value)<>'string') then
            raise exception 'Invalid coordination metadata' using errcode='22023';
          end if;
        end if;
        if normalized_key<>'fencingtoken' and not (normalized_key='autorefreshtoken' and jsonb_typeof(metadata_item.value)='boolean')
          and (normalized_key ~ '^(tokens|passwords|secrets|cookies|apikeys)$'
            or normalized_key ~ '(password|passwd|token|credentials?|authorization|authheader|apikey|accesskey|secret|secretkey|privatekey|servicerolekey|cookie)$')
          and not placeholder then raise exception 'Invalid coordination metadata' using errcode='22023'; end if;
        metadata_nodes := array_append(metadata_nodes,to_jsonb(metadata_item.key));
        metadata_depths := array_append(metadata_depths,metadata_depth);
        metadata_keys := array_append(metadata_keys,true);
        metadata_nodes := array_append(metadata_nodes,metadata_item.value);
        metadata_depths := array_append(metadata_depths,metadata_depth+1);
        metadata_keys := array_append(metadata_keys,false);
      end loop;
    end if;
  end loop;
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
    payload-array(select key from jsonb_each(payload) as item(key,value) where value='null'::jsonb),
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
