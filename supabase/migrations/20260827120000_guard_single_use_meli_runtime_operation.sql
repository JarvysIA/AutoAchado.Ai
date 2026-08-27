alter table private.meli_oauth_connections
  add column consumed_runtime_operation_ids text[] not null default '{}'::text[];

alter table private.meli_oauth_connections
  add constraint meli_oauth_connections_runtime_operation_ids_check check (
    pg_catalog.array_position(consumed_runtime_operation_ids, null) is null
    and (
      pg_catalog.cardinality(consumed_runtime_operation_ids) = 0
      or pg_catalog.array_to_string(consumed_runtime_operation_ids, ',')
        ~ '^([A-Za-z0-9][A-Za-z0-9._:-]{0,127})(,[A-Za-z0-9][A-Za-z0-9._:-]{0,127})*$'
    )
  );

create function public.claim_meli_refresh_for_runtime_operation(
  p_external_user_id bigint,
  p_operation_id text
)
returns table (
  outcome text,
  external_user_id bigint,
  lease_id uuid,
  expected_version bigint,
  refresh_token text,
  lease_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_connection private.meli_oauth_connections%rowtype;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_lease_id uuid;
  v_refresh_token text;
begin
  if p_external_user_id is null or p_external_user_id <= 0 then
    raise exception using errcode = '22023', message = 'OAUTH_INVALID_EXTERNAL_USER_ID';
  end if;
  if p_operation_id is null
    or pg_catalog.length(p_operation_id) = 0
    or pg_catalog.length(p_operation_id) > 128
    or p_operation_id <> pg_catalog.btrim(p_operation_id)
    or p_operation_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' then
    raise exception using errcode = '22023', message = 'OAUTH_INVALID_RUNTIME_OPERATION_ID';
  end if;

  select c.*
    into v_connection
    from private.meli_oauth_connections as c
   where c.provider = 'MERCADO_LIVRE'
     and c.external_user_id = p_external_user_id
   for update;

  if not found then
    return query select 'NOT_FOUND'::text, p_external_user_id, null::uuid, null::bigint, null::text, null::timestamptz;
    return;
  end if;

  if p_operation_id = any(v_connection.consumed_runtime_operation_ids) then
    return query select 'OPERATION_ALREADY_USED'::text, p_external_user_id, null::uuid,
      v_connection.token_version, null::text, v_connection.lease_expires_at;
    return;
  end if;

  if v_connection.status = 'REFRESHING' then
    if v_connection.lease_expires_at > v_now then
      return query select 'LOCK_BUSY'::text, p_external_user_id, null::uuid,
        v_connection.token_version, null::text, v_connection.lease_expires_at;
      return;
    end if;

    update private.meli_oauth_connections as c
       set status = 'REFRESH_OUTCOME_UNKNOWN',
           lease_id = null,
           lease_acquired_at = null,
           lease_expires_at = null,
           last_error_code = 'LEASE_EXPIRED_OUTCOME_UNKNOWN',
           consecutive_failures = c.consecutive_failures + 1,
           reauth_required = true,
           updated_at = v_now
     where c.connection_id = v_connection.connection_id;
    return query select 'OUTCOME_UNKNOWN'::text, p_external_user_id, null::uuid,
      v_connection.token_version, null::text, null::timestamptz;
    return;
  end if;

  if v_connection.status = 'REAUTH_REQUIRED' then
    return query select 'REAUTH_REQUIRED'::text, p_external_user_id, null::uuid,
      v_connection.token_version, null::text, null::timestamptz;
    return;
  end if;
  if v_connection.status = 'REFRESH_OUTCOME_UNKNOWN' then
    return query select 'OUTCOME_UNKNOWN'::text, p_external_user_id, null::uuid,
      v_connection.token_version, null::text, null::timestamptz;
    return;
  end if;
  if v_connection.status = 'DISABLED' then
    return query select 'DISABLED'::text, p_external_user_id, null::uuid,
      v_connection.token_version, null::text, null::timestamptz;
    return;
  end if;
  if v_connection.status <> 'ACTIVE' then
    raise exception using errcode = '55000', message = 'OAUTH_INVALID_CONNECTION_STATE';
  end if;

  if v_connection.vault_secret_id is null then
    v_refresh_token := null;
  else
    select s.decrypted_secret
      into v_refresh_token
      from vault.decrypted_secrets as s
     where s.id = v_connection.vault_secret_id;
  end if;

  if v_refresh_token is null or pg_catalog.octet_length(v_refresh_token) = 0 then
    update private.meli_oauth_connections as c
       set status = 'REAUTH_REQUIRED',
           lease_id = null,
           lease_acquired_at = null,
           lease_expires_at = null,
           last_error_code = 'SECRET_MISSING',
           consecutive_failures = c.consecutive_failures + 1,
           reauth_required = true,
           updated_at = v_now
     where c.connection_id = v_connection.connection_id;
    return query select 'SECRET_MISSING'::text, p_external_user_id, null::uuid,
      v_connection.token_version, null::text, null::timestamptz;
    return;
  end if;

  v_lease_id := extensions.gen_random_uuid();
  update private.meli_oauth_connections as c
     set status = 'REFRESHING',
         lease_id = v_lease_id,
         lease_acquired_at = v_now,
         lease_expires_at = v_now + interval '2 minutes',
         consumed_runtime_operation_ids = pg_catalog.array_append(c.consumed_runtime_operation_ids, p_operation_id),
         updated_at = v_now
   where c.connection_id = v_connection.connection_id
     and not (p_operation_id = any(c.consumed_runtime_operation_ids))
  returning c.lease_expires_at into v_connection.lease_expires_at;

  if not found then
    return query select 'OPERATION_ALREADY_USED'::text, p_external_user_id, null::uuid,
      v_connection.token_version, null::text, null::timestamptz;
    return;
  end if;

  return query select
    'CLAIMED'::text,
    p_external_user_id,
    v_lease_id,
    v_connection.token_version,
    v_refresh_token,
    v_connection.lease_expires_at;
end;
$$;

alter function public.claim_meli_refresh_for_runtime_operation(bigint, text) owner to postgres;

revoke execute on function public.claim_meli_refresh_for_runtime_operation(bigint, text)
  from public, anon, authenticated;
grant execute on function public.claim_meli_refresh_for_runtime_operation(bigint, text)
  to service_role;

comment on column private.meli_oauth_connections.consumed_runtime_operation_ids is
  'Durable, non-secret single-use identifiers for approved server-side OAuth runtime operations.';
comment on function public.claim_meli_refresh_for_runtime_operation(bigint, text) is
  'Atomically consumes one server-owned operation identifier while claiming the existing refresh lease.';
