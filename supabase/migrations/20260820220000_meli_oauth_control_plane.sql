create schema private authorization postgres;

revoke all privileges on schema private from public, anon, authenticated, service_role;

create table private.meli_oauth_connections (
  connection_id uuid primary key default extensions.gen_random_uuid(),
  provider text not null default 'MERCADO_LIVRE' check (provider = 'MERCADO_LIVRE'),
  external_user_id bigint not null unique check (external_user_id > 0),
  vault_secret_id uuid unique,
  status text not null default 'REAUTH_REQUIRED' check (
    status in ('REAUTH_REQUIRED', 'ACTIVE', 'REFRESHING', 'REFRESH_OUTCOME_UNKNOWN', 'DISABLED')
  ),
  token_version bigint not null default 0 check (token_version >= 0),
  lease_id uuid,
  lease_acquired_at timestamptz,
  lease_expires_at timestamptz,
  last_refresh_at timestamptz,
  last_success_at timestamptz,
  last_error_code text check (
    last_error_code is null or last_error_code ~ '^[A-Z][A-Z0-9_]{0,63}$'
  ),
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  reauth_required boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (
      status = 'REFRESHING'
      and lease_id is not null
      and lease_acquired_at is not null
      and lease_expires_at is not null
      and lease_expires_at > lease_acquired_at
    )
    or
    (
      status <> 'REFRESHING'
      and lease_id is null
      and lease_acquired_at is null
      and lease_expires_at is null
    )
  )
);

alter table private.meli_oauth_connections enable row level security;
alter table private.meli_oauth_connections owner to postgres;

revoke all privileges on table private.meli_oauth_connections
  from public, anon, authenticated, service_role;

-- Supabase owns Vault as supabase_admin and manages its built-in grants. The
-- vault schema remains outside the Data API exposed schemas; this migration
-- adds no direct Vault grants and exposes only the specific public RPCs below.

create function public.initialize_meli_oauth_connection(
  p_external_user_id bigint,
  p_refresh_token text
)
returns table (
  outcome text,
  connection_id uuid,
  external_user_id bigint,
  provider text,
  status text,
  token_version bigint,
  reauth_required boolean,
  consecutive_failures integer,
  last_error_code text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_connection private.meli_oauth_connections%rowtype;
  v_secret_id uuid;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_secret_name text;
begin
  if p_external_user_id is null or p_external_user_id <= 0 then
    raise exception using errcode = '22023', message = 'OAUTH_INVALID_EXTERNAL_USER_ID';
  end if;
  if p_refresh_token is null
    or pg_catalog.octet_length(p_refresh_token) = 0
    or pg_catalog.octet_length(p_refresh_token) > 4096 then
    raise exception using errcode = '22023', message = 'OAUTH_INVALID_REFRESH_TOKEN';
  end if;

  v_secret_name := 'autoachado_meli_refresh_' || p_external_user_id::text;

  select c.*
    into v_connection
    from private.meli_oauth_connections as c
   where c.provider = 'MERCADO_LIVRE'
     and c.external_user_id = p_external_user_id
   for update;

  if not found then
    v_secret_id := vault.create_secret(
      p_refresh_token,
      v_secret_name,
      'AutoAchado Mercado Livre rotating refresh credential',
      null::uuid
    );

    insert into private.meli_oauth_connections (
      provider,
      external_user_id,
      vault_secret_id,
      status,
      token_version,
      last_success_at,
      consecutive_failures,
      reauth_required,
      updated_at
    ) values (
      'MERCADO_LIVRE',
      p_external_user_id,
      v_secret_id,
      'ACTIVE',
      1,
      v_now,
      0,
      false,
      v_now
    )
    returning * into v_connection;
  else
    v_secret_id := v_connection.vault_secret_id;
    if v_secret_id is null
      or not exists (select 1 from vault.secrets as s where s.id = v_secret_id) then
      v_secret_id := vault.create_secret(
        p_refresh_token,
        v_secret_name,
        'AutoAchado Mercado Livre rotating refresh credential',
        null::uuid
      );
    else
      perform vault.update_secret(v_secret_id, p_refresh_token, null, null, null);
    end if;

    update private.meli_oauth_connections as c
       set vault_secret_id = v_secret_id,
           status = 'ACTIVE',
           token_version = c.token_version + 1,
           lease_id = null,
           lease_acquired_at = null,
           lease_expires_at = null,
           last_success_at = v_now,
           last_error_code = null,
           consecutive_failures = 0,
           reauth_required = false,
           updated_at = v_now
     where c.connection_id = v_connection.connection_id
    returning c.* into v_connection;
  end if;

  return query select
    'INITIALIZED'::text,
    v_connection.connection_id,
    v_connection.external_user_id,
    v_connection.provider,
    v_connection.status,
    v_connection.token_version,
    v_connection.reauth_required,
    v_connection.consecutive_failures,
    v_connection.last_error_code,
    v_connection.updated_at;
end;
$$;

create function public.claim_meli_refresh(p_external_user_id bigint)
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

  if v_connection.status = 'REFRESHING' then
    if v_connection.lease_expires_at > v_now then
      return query select 'LOCK_BUSY'::text, p_external_user_id, null::uuid, v_connection.token_version, null::text, v_connection.lease_expires_at;
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
    return query select 'OUTCOME_UNKNOWN'::text, p_external_user_id, null::uuid, v_connection.token_version, null::text, null::timestamptz;
    return;
  end if;

  if v_connection.status = 'REAUTH_REQUIRED' then
    return query select 'REAUTH_REQUIRED'::text, p_external_user_id, null::uuid, v_connection.token_version, null::text, null::timestamptz;
    return;
  end if;
  if v_connection.status = 'REFRESH_OUTCOME_UNKNOWN' then
    return query select 'OUTCOME_UNKNOWN'::text, p_external_user_id, null::uuid, v_connection.token_version, null::text, null::timestamptz;
    return;
  end if;
  if v_connection.status = 'DISABLED' then
    return query select 'DISABLED'::text, p_external_user_id, null::uuid, v_connection.token_version, null::text, null::timestamptz;
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
    return query select 'SECRET_MISSING'::text, p_external_user_id, null::uuid, v_connection.token_version, null::text, null::timestamptz;
    return;
  end if;

  v_lease_id := extensions.gen_random_uuid();
  update private.meli_oauth_connections as c
     set status = 'REFRESHING',
         lease_id = v_lease_id,
         lease_acquired_at = v_now,
         lease_expires_at = v_now + interval '2 minutes',
         updated_at = v_now
   where c.connection_id = v_connection.connection_id
  returning c.lease_expires_at into v_connection.lease_expires_at;

  return query select
    'CLAIMED'::text,
    p_external_user_id,
    v_lease_id,
    v_connection.token_version,
    v_refresh_token,
    v_connection.lease_expires_at;
end;
$$;

create function public.complete_meli_refresh(
  p_external_user_id bigint,
  p_lease_id uuid,
  p_expected_version bigint,
  p_new_refresh_token text
)
returns table (
  outcome text,
  connection_id uuid,
  external_user_id bigint,
  status text,
  token_version bigint,
  reauth_required boolean,
  consecutive_failures integer,
  last_error_code text,
  last_refresh_at timestamptz,
  last_success_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_connection private.meli_oauth_connections%rowtype;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if p_external_user_id is null or p_external_user_id <= 0 then
    raise exception using errcode = '22023', message = 'OAUTH_INVALID_EXTERNAL_USER_ID';
  end if;
  if p_lease_id is null or p_expected_version is null or p_expected_version < 0 then
    raise exception using errcode = '22023', message = 'OAUTH_INVALID_COMPLETION_CONTROL';
  end if;
  if p_new_refresh_token is null
    or pg_catalog.octet_length(p_new_refresh_token) = 0
    or pg_catalog.octet_length(p_new_refresh_token) > 4096 then
    raise exception using errcode = '22023', message = 'OAUTH_INVALID_REFRESH_TOKEN';
  end if;

  select c.*
    into v_connection
    from private.meli_oauth_connections as c
   where c.provider = 'MERCADO_LIVRE'
     and c.external_user_id = p_external_user_id
   for update;

  if not found then
    return query select 'NOT_FOUND'::text, null::uuid, p_external_user_id, null::text, null::bigint, true, 0, 'CONNECTION_NOT_FOUND'::text, null::timestamptz, null::timestamptz, v_now;
    return;
  end if;
  if v_connection.status <> 'REFRESHING' then
    return query select 'NOT_REFRESHING'::text, v_connection.connection_id, p_external_user_id, v_connection.status, v_connection.token_version, v_connection.reauth_required, v_connection.consecutive_failures, v_connection.last_error_code, v_connection.last_refresh_at, v_connection.last_success_at, v_connection.updated_at;
    return;
  end if;
  if v_connection.token_version <> p_expected_version then
    return query select 'STALE_VERSION'::text, v_connection.connection_id, p_external_user_id, v_connection.status, v_connection.token_version, v_connection.reauth_required, v_connection.consecutive_failures, v_connection.last_error_code, v_connection.last_refresh_at, v_connection.last_success_at, v_connection.updated_at;
    return;
  end if;
  if v_connection.lease_id <> p_lease_id then
    return query select 'LEASE_MISMATCH'::text, v_connection.connection_id, p_external_user_id, v_connection.status, v_connection.token_version, v_connection.reauth_required, v_connection.consecutive_failures, v_connection.last_error_code, v_connection.last_refresh_at, v_connection.last_success_at, v_connection.updated_at;
    return;
  end if;
  if v_connection.vault_secret_id is null
    or not exists (select 1 from vault.secrets as s where s.id = v_connection.vault_secret_id) then
    update private.meli_oauth_connections as c
       set status = 'REAUTH_REQUIRED',
           lease_id = null,
           lease_acquired_at = null,
           lease_expires_at = null,
           last_error_code = 'SECRET_MISSING',
           consecutive_failures = c.consecutive_failures + 1,
           reauth_required = true,
           updated_at = v_now
     where c.connection_id = v_connection.connection_id
    returning c.* into v_connection;
    return query select 'SECRET_MISSING'::text, v_connection.connection_id, p_external_user_id, v_connection.status, v_connection.token_version, v_connection.reauth_required, v_connection.consecutive_failures, v_connection.last_error_code, v_connection.last_refresh_at, v_connection.last_success_at, v_connection.updated_at;
    return;
  end if;

  perform vault.update_secret(v_connection.vault_secret_id, p_new_refresh_token, null, null, null);

  update private.meli_oauth_connections as c
     set status = 'ACTIVE',
         token_version = c.token_version + 1,
         lease_id = null,
         lease_acquired_at = null,
         lease_expires_at = null,
         last_refresh_at = v_now,
         last_success_at = v_now,
         last_error_code = null,
         consecutive_failures = 0,
         reauth_required = false,
         updated_at = v_now
   where c.connection_id = v_connection.connection_id
  returning c.* into v_connection;

  return query select
    'COMPLETED'::text,
    v_connection.connection_id,
    v_connection.external_user_id,
    v_connection.status,
    v_connection.token_version,
    v_connection.reauth_required,
    v_connection.consecutive_failures,
    v_connection.last_error_code,
    v_connection.last_refresh_at,
    v_connection.last_success_at,
    v_connection.updated_at;
end;
$$;

create function public.fail_meli_refresh(
  p_external_user_id bigint,
  p_lease_id uuid,
  p_expected_version bigint,
  p_error_code text,
  p_outcome_class text
)
returns table (
  outcome text,
  connection_id uuid,
  external_user_id bigint,
  status text,
  token_version bigint,
  reauth_required boolean,
  consecutive_failures integer,
  last_error_code text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_connection private.meli_oauth_connections%rowtype;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_status text;
  v_reauth_required boolean;
begin
  if p_external_user_id is null or p_external_user_id <= 0 then
    raise exception using errcode = '22023', message = 'OAUTH_INVALID_EXTERNAL_USER_ID';
  end if;
  if p_lease_id is null or p_expected_version is null or p_expected_version < 0 then
    raise exception using errcode = '22023', message = 'OAUTH_INVALID_FAILURE_CONTROL';
  end if;
  if p_error_code is null or p_error_code !~ '^[A-Z][A-Z0-9_]{0,63}$' then
    raise exception using errcode = '22023', message = 'OAUTH_INVALID_ERROR_CODE';
  end if;
  if p_outcome_class not in ('SAFE_RETRY', 'REAUTH_REQUIRED', 'OUTCOME_UNKNOWN', 'CONFIG_ERROR') then
    raise exception using errcode = '22023', message = 'OAUTH_INVALID_OUTCOME_CLASS';
  end if;

  select c.*
    into v_connection
    from private.meli_oauth_connections as c
   where c.provider = 'MERCADO_LIVRE'
     and c.external_user_id = p_external_user_id
   for update;

  if not found then
    return query select 'NOT_FOUND'::text, null::uuid, p_external_user_id, null::text, null::bigint, true, 0, 'CONNECTION_NOT_FOUND'::text, v_now;
    return;
  end if;
  if v_connection.status <> 'REFRESHING' then
    return query select 'NOT_REFRESHING'::text, v_connection.connection_id, p_external_user_id, v_connection.status, v_connection.token_version, v_connection.reauth_required, v_connection.consecutive_failures, v_connection.last_error_code, v_connection.updated_at;
    return;
  end if;
  if v_connection.token_version <> p_expected_version then
    return query select 'STALE_VERSION'::text, v_connection.connection_id, p_external_user_id, v_connection.status, v_connection.token_version, v_connection.reauth_required, v_connection.consecutive_failures, v_connection.last_error_code, v_connection.updated_at;
    return;
  end if;
  if v_connection.lease_id <> p_lease_id then
    return query select 'LEASE_MISMATCH'::text, v_connection.connection_id, p_external_user_id, v_connection.status, v_connection.token_version, v_connection.reauth_required, v_connection.consecutive_failures, v_connection.last_error_code, v_connection.updated_at;
    return;
  end if;

  v_status := case p_outcome_class
    when 'SAFE_RETRY' then 'ACTIVE'
    when 'REAUTH_REQUIRED' then 'REAUTH_REQUIRED'
    when 'OUTCOME_UNKNOWN' then 'REFRESH_OUTCOME_UNKNOWN'
    when 'CONFIG_ERROR' then 'DISABLED'
  end;
  v_reauth_required := p_outcome_class <> 'SAFE_RETRY';

  update private.meli_oauth_connections as c
     set status = v_status,
         lease_id = null,
         lease_acquired_at = null,
         lease_expires_at = null,
         last_error_code = p_error_code,
         consecutive_failures = c.consecutive_failures + 1,
         reauth_required = v_reauth_required,
         updated_at = v_now
   where c.connection_id = v_connection.connection_id
  returning c.* into v_connection;

  return query select
    'FAILURE_RECORDED'::text,
    v_connection.connection_id,
    v_connection.external_user_id,
    v_connection.status,
    v_connection.token_version,
    v_connection.reauth_required,
    v_connection.consecutive_failures,
    v_connection.last_error_code,
    v_connection.updated_at;
end;
$$;

alter function public.initialize_meli_oauth_connection(bigint, text) owner to postgres;
alter function public.claim_meli_refresh(bigint) owner to postgres;
alter function public.complete_meli_refresh(bigint, uuid, bigint, text) owner to postgres;
alter function public.fail_meli_refresh(bigint, uuid, bigint, text, text) owner to postgres;

revoke execute on function public.initialize_meli_oauth_connection(bigint, text)
  from public, anon, authenticated;
revoke execute on function public.claim_meli_refresh(bigint)
  from public, anon, authenticated;
revoke execute on function public.complete_meli_refresh(bigint, uuid, bigint, text)
  from public, anon, authenticated;
revoke execute on function public.fail_meli_refresh(bigint, uuid, bigint, text, text)
  from public, anon, authenticated;

grant execute on function public.initialize_meli_oauth_connection(bigint, text) to service_role;
grant execute on function public.claim_meli_refresh(bigint) to service_role;
grant execute on function public.complete_meli_refresh(bigint, uuid, bigint, text) to service_role;
grant execute on function public.fail_meli_refresh(bigint, uuid, bigint, text, text) to service_role;

comment on schema private is
  'Non-exposed server-side metadata. No Data API role receives schema usage.';
comment on table private.meli_oauth_connections is
  'Non-sensitive Mercado Livre OAuth state. Refresh credentials exist only in Supabase Vault.';
comment on function public.claim_meli_refresh(bigint) is
  'Claims a two-minute exclusive lease and returns only the associated Mercado Livre refresh credential to service_role.';
