create or replace function public.initialize_meli_oauth_connection(
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
  v_expected_status text;
  v_expected_version bigint;
begin
  if p_external_user_id is null or p_external_user_id <= 0 then
    raise exception using errcode = '22023', message = 'OAUTH_INVALID_EXTERNAL_USER_ID';
  end if;
  if p_refresh_token is null
    or pg_catalog.octet_length(p_refresh_token) = 0
    or pg_catalog.octet_length(p_refresh_token) > 4096 then
    raise exception using errcode = '22023', message = 'OAUTH_INVALID_REFRESH_TOKEN';
  end if;

  -- SELECT FOR UPDATE cannot lock a row that does not exist. This identity-scoped
  -- transaction lock serializes the decision before the row is read or created.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('autoachado:meli:' || p_external_user_id::text, 0)
  );

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
    return;
  end if;

  if v_connection.status = 'ACTIVE' then
    return query select
      'ALREADY_INITIALIZED'::text,
      v_connection.connection_id,
      v_connection.external_user_id,
      v_connection.provider,
      v_connection.status,
      v_connection.token_version,
      v_connection.reauth_required,
      v_connection.consecutive_failures,
      v_connection.last_error_code,
      v_connection.updated_at;
    return;
  end if;

  if v_connection.status = 'REFRESHING' then
    return query select
      'LOCK_BUSY'::text,
      v_connection.connection_id,
      v_connection.external_user_id,
      v_connection.provider,
      v_connection.status,
      v_connection.token_version,
      v_connection.reauth_required,
      v_connection.consecutive_failures,
      v_connection.last_error_code,
      v_connection.updated_at;
    return;
  end if;

  if v_connection.status not in ('REAUTH_REQUIRED', 'REFRESH_OUTCOME_UNKNOWN') then
    return query select
      'STATE_NOT_ALLOWED'::text,
      v_connection.connection_id,
      v_connection.external_user_id,
      v_connection.provider,
      v_connection.status,
      v_connection.token_version,
      v_connection.reauth_required,
      v_connection.consecutive_failures,
      v_connection.last_error_code,
      v_connection.updated_at;
    return;
  end if;

  v_expected_status := v_connection.status;
  v_expected_version := v_connection.token_version;
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
     and c.provider = 'MERCADO_LIVRE'
     and c.external_user_id = p_external_user_id
     and c.status = v_expected_status
     and c.token_version = v_expected_version
  returning c.* into v_connection;

  if not found then
    -- Raising rolls back both Vault and metadata changes in this transaction.
    raise exception using errcode = '40001', message = 'OAUTH_REAUTH_CAS_FAILED';
  end if;

  return query select
    'REAUTHORIZED'::text,
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

alter function public.initialize_meli_oauth_connection(bigint, text) owner to postgres;

revoke execute on function public.initialize_meli_oauth_connection(bigint, text)
  from public, anon, authenticated;
grant execute on function public.initialize_meli_oauth_connection(bigint, text)
  to service_role;

comment on function public.initialize_meli_oauth_connection(bigint, text) is
  'Identity-serialized, state-aware Mercado Livre initialization and human reauthorization. Never returns credentials.';
